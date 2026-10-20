import type {
  CoachId,
  Harshness,
  NotifFrequency,
  NotificationLogRow,
  Profile,
  ScheduledWorkout,
  UserCoach,
  WorkoutSession,
} from "@/lib/data/types";
import { getCoach } from "@/lib/coach/coaches";
import { WORKOUT_GRACE_MS } from "@/lib/game/hero";
import { clampHarshness } from "@/lib/safety/age";
import { atClock, DAY, dayKey, HOUR, isQuietHour, MINUTE, startOfDay } from "@/lib/time";

/**
 * Правила того, когда и что тренер пишет сам (раздел 11 ТЗ). Чистые функции без доступа к базе:
 * по ним работают и сообщения в чате («пока тебя не было»), и системные уведомления.
 *
 * Лестница в день тренировки: утро → за 30 минут → «укол» → вечером холодное сообщение.
 * Тренер не спамит: не больше 3 в сутки, тихие часы, лёгкое отключение.
 */
export type AwayKind = "morning" | "reminder" | "poke" | "evening_cold";

export const MORNING_CLOCK = "09:00";
export const EVENING_CLOCK = "21:00";
export const REMINDER_BEFORE_MS = 30 * MINUTE;
/** «Укол» — пока тренировку ещё можно начать (после 30 минут она засчитывается пропущенной). */
export const POKE_AFTER_MS = 20 * MINUTE;

/** Не больше стольких в сутки (по всем тренерам вместе) и в неделю в режиме «редко». */
export const MAX_PER_DAY = 3;
export const MAX_PER_WEEK_RARE = 3;

/** Тихие часы по умолчанию. Для младше 18 лет их нельзя сократить. */
export const DEFAULT_QUIET = { start: "22:00", end: "08:00" } as const;

/** Какие виды сообщений разрешены при выбранной частоте. */
export const ALLOWED_KINDS: Record<NotifFrequency, readonly AwayKind[]> = {
  normal: ["morning", "reminder", "poke", "evening_cold"],
  workout_day: ["reminder", "poke"],
  rare: ["reminder"],
  off: [],
};

/** Важность при нехватке места под дневной лимит: чем меньше число, тем важнее. */
const PRIORITY: Record<AwayKind, number> = { reminder: 0, poke: 1, morning: 2, evening_cold: 3 };

export type RulesProfile = Pick<
  Profile,
  "notifFrequency" | "supportPausedUntil" | "onboardingDone" | "quietStart" | "quietEnd" | "ageBand"
>;

/** Тихий ли момент: свои часы пользователя; для младше 18 дополнительно обязательные 22:00–08:00. */
export function isQuietTime(
  ts: number,
  profile: Pick<Profile, "quietStart" | "quietEnd" | "ageBand">,
): boolean {
  if (isQuietHour(ts, profile.quietStart, profile.quietEnd)) return true;
  const minor = profile.ageBand !== "18+";
  return minor && isQuietHour(ts, DEFAULT_QUIET.start, DEFAULT_QUIET.end);
}

export interface AwayMessage {
  kind: AwayKind;
  coachId: CoachId;
  scheduledId: string;
  planId: string;
  scheduledAt: number;
  /** Условное время сообщения — по нему оно встаёт в ленту. */
  at: number;
  day: string;
}

export interface AwayInput {
  profile: RulesProfile;
  coaches: readonly UserCoach[];
  scheduled: readonly ScheduledWorkout[];
  log: readonly Pick<NotificationLogRow, "kind" | "coachId" | "day" | "sentAt">[];
  now: number;
}

type Candidate = AwayMessage;

/** Выбирает, что влезает в суточный (и недельный) лимит: важное — первым, в ленте — по времени. */
function applyLimits(
  candidates: Candidate[],
  profile: RulesProfile,
  log: AwayInput["log"],
  now: number,
): Candidate[] {
  const today = dayKey(now);
  let room = MAX_PER_DAY - log.filter((l) => l.day === today).length;
  if (profile.notifFrequency === "rare") {
    const weekAgo = now - 7 * DAY;
    room = Math.min(room, MAX_PER_WEEK_RARE - log.filter((l) => l.sentAt >= weekAgo).length);
  }
  if (room <= 0) return [];
  return candidates
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.at - b.at)
    .slice(0, room)
    .sort((a, b) => a.at - b.at);
}

function paused(profile: RulesProfile, now: number): boolean {
  return profile.supportPausedUntil !== null && profile.supportPausedUntil > now;
}

/** Что тренеры должны были написать к моменту `now` и ещё не написали. */
export function dueAwayMessages({
  profile,
  coaches,
  scheduled,
  log,
  now,
}: AwayInput): AwayMessage[] {
  const allowed = ALLOWED_KINDS[profile.notifFrequency];
  if (!profile.onboardingDone || allowed.length === 0 || paused(profile, now)) return [];

  const today = dayKey(now);
  const byCoach = new Map(coaches.map((c) => [c.coachId, c]));
  const sent = new Set(log.map((l) => `${l.kind}|${l.coachId}|${l.day}`));
  const candidates: Candidate[] = [];

  for (const item of scheduled) {
    if (dayKey(item.scheduledAt) !== today) continue;
    const coach = byCoach.get(item.coachId);
    if (!coach?.unlocked) continue;
    const base = {
      coachId: item.coachId,
      scheduledId: item.id,
      planId: item.planId,
      scheduledAt: item.scheduledAt,
      day: today,
    };
    const push = (kind: AwayKind, at: number) => {
      if (!allowed.includes(kind) || sent.has(`${kind}|${item.coachId}|${today}`)) return;
      // Тренер не пишет в тихие часы: такого сообщения не будет вовсе.
      if (isQuietTime(at, profile)) return;
      candidates.push({ ...base, kind, at });
    };

    if (item.status === "planned" && coach.state !== "ignoring") {
      const reminderAt = item.scheduledAt - REMINDER_BEFORE_MS;
      // Утреннее сообщение имеет смысл, только если до напоминания остаётся хотя бы полчаса.
      const morning = atClock(item.scheduledAt, MORNING_CLOCK);
      if (now >= morning && now < reminderAt && morning <= reminderAt - 30 * MINUTE) {
        push("morning", morning);
      }
      if (now >= reminderAt && now < item.scheduledAt) push("reminder", reminderAt);
      const pokeAt = item.scheduledAt + POKE_AFTER_MS;
      if (now >= pokeAt && now <= item.scheduledAt + WORKOUT_GRACE_MS) push("poke", pokeAt);
    }
    if (item.status === "missed" && coach.state !== "ignoring") {
      const evening = atClock(item.scheduledAt, EVENING_CLOCK);
      if (now >= evening) push("evening_cold", evening);
    }
  }
  return applyLimits(candidates, profile, log, now);
}

/**
 * Что тренеры напишут в ближайшие `horizonMs`, если пользователь ничего не сделает.
 * Нужно для отправки уведомлений, пока приложение закрыто. Здесь «вечернее холодное»
 * планируется только если игнор после пропуска закончится раньше 21:00.
 */
export function upcomingAwayMessages({
  profile,
  coaches,
  scheduled,
  log,
  now,
  horizonMs,
}: AwayInput & { horizonMs: number }): AwayMessage[] {
  const allowed = ALLOWED_KINDS[profile.notifFrequency];
  if (!profile.onboardingDone || allowed.length === 0) return [];
  const byCoach = new Map(coaches.map((c) => [c.coachId, c]));
  const sent = new Set(log.map((l) => `${l.kind}|${l.coachId}|${l.day}`));
  const until = now + horizonMs;
  const byDay = new Map<string, Candidate[]>();

  for (const item of scheduled) {
    if (item.status !== "planned" || item.scheduledAt + HOUR < now || item.scheduledAt > until) {
      continue;
    }
    const coach = byCoach.get(item.coachId);
    if (!coach?.unlocked) continue;
    const day = dayKey(item.scheduledAt);
    const base = {
      coachId: item.coachId,
      scheduledId: item.id,
      planId: item.planId,
      scheduledAt: item.scheduledAt,
      day,
    };
    const list = byDay.get(day) ?? [];
    const push = (kind: AwayKind, at: number) => {
      if (!allowed.includes(kind) || sent.has(`${kind}|${item.coachId}|${day}`)) return;
      if (at <= now || at > until || isQuietTime(at, profile)) return;
      list.push({ ...base, kind, at });
    };
    const reminderAt = item.scheduledAt - REMINDER_BEFORE_MS;
    const morning = atClock(item.scheduledAt, MORNING_CLOCK);
    if (morning <= reminderAt - 30 * MINUTE) push("morning", morning);
    push("reminder", reminderAt);
    push("poke", item.scheduledAt + POKE_AFTER_MS);
    const evening = atClock(item.scheduledAt, EVENING_CLOCK);
    const ignoreEnds =
      item.scheduledAt + WORKOUT_GRACE_MS + getCoach(item.coachId).ignoreHours * HOUR;
    if (ignoreEnds <= evening) push("evening_cold", evening);
    byDay.set(day, list);
  }

  const result: Candidate[] = [];
  for (const [day, list] of byDay) {
    const already = log.filter((l) => l.day === day).length;
    const room = Math.max(0, MAX_PER_DAY - already);
    result.push(
      ...list.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.at - b.at).slice(0, room),
    );
  }
  return result.sort((a, b) => a.at - b.at);
}

/**
 * Сколько дней подряд до сегодняшнего пользователь пропускал плановые тренировки
 * (0 — вчера всё в порядке или пропусков не было).
 */
export function missedStreak(
  scheduled: readonly ScheduledWorkout[],
  sessions: readonly Pick<WorkoutSession, "status" | "endedAt" | "startedAt">[],
  now: number,
): number {
  const doneDays = new Set(
    sessions.filter((s) => s.status === "done").map((s) => dayKey(s.endedAt ?? s.startedAt)),
  );
  const missedDays = new Set(
    scheduled.filter((s) => s.status === "missed").map((s) => dayKey(s.scheduledAt)),
  );
  let streak = 0;
  for (let offset = 1; offset <= 14; offset += 1) {
    const key = dayKey(startOfDay(now) - offset * DAY + 12 * HOUR);
    if (doneDays.has(key)) break;
    if (missedDays.has(key)) streak += 1;
    else if (streak > 0) break;
  }
  return streak;
}

/**
 * Жёсткость реплики: в первый пропуск на ступень мягче выбранной, со второго — как выбрано,
 * но не выше разрешённого по возрасту. Так тон растёт постепенно, а не сразу «на максимум».
 */
export function toneLevel(
  profile: Pick<Profile, "harshness" | "ageBand">,
  streak: number,
): Harshness {
  const base = clampHarshness(profile.harshness, profile.ageBand);
  return Math.min(base, Math.max(1, base - 1 + streak)) as Harshness;
}
