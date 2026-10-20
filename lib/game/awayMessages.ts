import { pickScripted, type ScriptedCategory } from "@/lib/coach/scripted";
import { scriptedEmotion } from "@/lib/chat/respond";
import type { Repository } from "@/lib/data/repository";
import type {
  CoachId,
  NotifFrequency,
  NotificationLogRow,
  Profile,
  ScheduledWorkout,
  UserCoach,
} from "@/lib/data/types";
import { clampHarshness } from "@/lib/safety/age";
import { atClock, dayKey, DAY, MINUTE } from "@/lib/time";
import { WORKOUT_GRACE_MS } from "./hero";

/**
 * «Пока тебя не было»: сообщения, которые тренер присылает сам вокруг плановой тренировки.
 * Правила тут чистые (без доступа к базе), поэтому по ним же работают уведомления (этап 10).
 */
export type AwayKind = "morning" | "reminder" | "poke" | "evening_cold";

export const MORNING_CLOCK = "09:00";
export const EVENING_CLOCK = "21:00";
export const REMINDER_BEFORE_MS = 30 * MINUTE;
export const POKE_AFTER_MS = 20 * MINUTE;

/** Не больше стольких сообщений в день (обычный режим) и в неделю (режим «редко»). */
export const MAX_PER_DAY = 2;
export const MAX_PER_WEEK_RARE = 3;

/** Какие виды сообщений разрешены при выбранной частоте. */
const ALLOWED: Record<NotifFrequency, readonly AwayKind[]> = {
  normal: ["morning", "reminder", "poke", "evening_cold"],
  workout_day: ["reminder", "poke"],
  rare: ["reminder"],
  off: [],
};

/** Важность при нехватке места под дневной лимит: чем меньше число, тем важнее. */
const PRIORITY: Record<AwayKind, number> = { reminder: 0, poke: 1, morning: 2, evening_cold: 3 };

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
  profile: Pick<Profile, "notifFrequency" | "supportPausedUntil" | "onboardingDone">;
  coaches: readonly UserCoach[];
  scheduled: readonly ScheduledWorkout[];
  log: readonly Pick<NotificationLogRow, "kind" | "coachId" | "day" | "sentAt">[];
  now: number;
}

export function dueAwayMessages({
  profile,
  coaches,
  scheduled,
  log,
  now,
}: AwayInput): AwayMessage[] {
  const allowed = ALLOWED[profile.notifFrequency];
  if (!profile.onboardingDone || allowed.length === 0) return [];
  if (profile.supportPausedUntil !== null && profile.supportPausedUntil > now) return [];

  const today = dayKey(now);
  const byCoach = new Map(coaches.map((c) => [c.coachId, c]));
  const sent = new Set(log.map((l) => `${l.kind}|${l.coachId}|${l.day}`));
  const candidates: AwayMessage[] = [];

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

  // Лимиты: в день и (в режиме «редко») в неделю.
  const sentToday = log.filter((l) => l.day === today).length;
  let room = MAX_PER_DAY - sentToday;
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

const CATEGORY: Record<AwayKind, ScriptedCategory> = {
  morning: "morning",
  reminder: "reminder",
  poke: "poke",
  evening_cold: "evening_cold",
};

/**
 * Записывает «пока тебя не было» в чаты (и в журнал, чтобы не повторяться). Возвращает то, что добавлено.
 * Вызывается при открытии приложения и раз в минуту.
 */
export async function postAwayMessages(
  repo: Repository,
  now: number,
  rng: () => number = Math.random,
): Promise<AwayMessage[]> {
  const profile = await repo.getProfile();
  if (!profile.onboardingDone) return [];
  const [coaches, scheduled, log] = await Promise.all([
    repo.listUserCoaches(),
    repo.listScheduled(),
    repo.listNotificationLog(now - 8 * DAY),
  ]);
  const due = dueAwayMessages({ profile, coaches, scheduled, log, now });
  const posted: AwayMessage[] = [];
  for (const item of due) {
    const recent = (await repo.listMessages(item.coachId))
      .filter((m) => m.sender === "coach")
      .slice(-10)
      .map((m) => m.text);
    const category = CATEGORY[item.kind];
    const text = pickScripted(
      item.coachId,
      category,
      clampHarshness(profile.harshness, profile.ageBand),
      { rng, avoid: recent },
    );
    await repo.addMessage({
      coachId: item.coachId,
      sender: "coach",
      type: "text",
      text,
      emotion: scriptedEmotion(category),
      durationSec: null,
      meta: { source: "away" },
      readAt: null,
      createdAt: item.at,
    });
    if (item.kind === "reminder" || item.kind === "poke") {
      await repo.addMessage({
        coachId: item.coachId,
        sender: "coach",
        type: "workout_card",
        text: "",
        emotion: null,
        durationSec: null,
        meta: { planId: item.planId, scheduledId: item.scheduledId, scheduledAt: item.scheduledAt },
        readAt: null,
        createdAt: item.at + 1,
      });
    }
    await repo.addNotificationLog({
      kind: item.kind,
      coachId: item.coachId,
      day: item.day,
      sentAt: now,
    });
    posted.push(item);
  }
  return posted;
}
