import { getCoach } from "@/lib/coach/coaches";
import type { Repository } from "@/lib/data/repository";
import type { CoachId, Message } from "@/lib/data/types";
import { formatAgo, formatMinutes, formatWhen, weekdayLong } from "@/lib/format";
import { computeStreak } from "@/lib/game/streak";
import { pickNextWorkout, WORKOUT_GRACE_MS } from "@/lib/game/hero";
import { t } from "@/lib/i18n";
import { clampHarshness } from "@/lib/safety/age";
import { dayKey, daysBetween, formatClock, startOfDay } from "@/lib/time";
import { getPlan } from "@/lib/workout/plans";
import { LIMITS, type ChatRequest, type ChatTurn } from "./types";

const monthDayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** Последние реплики для нейросети: только текст и расшифровки голосовых, без карточек и статусов. */
export function historyFor(messages: readonly Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.sender === "system") continue;
    if (m.type !== "text" && m.type !== "voice") continue;
    const text = (m.type === "voice" ? (m.meta.transcript ?? m.text) : m.text).trim();
    if (text) turns.push({ role: m.sender === "user" ? "user" : "coach", text });
  }
  return turns.slice(-LIMITS.history);
}

/** Собирает запрос к /api/chat из данных на устройстве. */
export async function buildChatRequest(
  repo: Repository,
  coachId: CoachId,
  message: string,
  now: number,
): Promise<ChatRequest> {
  const [profile, userCoach, messages, memory, sessions, scheduled] = await Promise.all([
    repo.getProfile(),
    repo.getUserCoach(coachId),
    repo.listMessages(coachId),
    repo.listMemory(coachId),
    repo.listSessions(),
    repo.listScheduled(),
  ]);
  const done = sessions.filter((s) => s.status === "done");
  const lastEnd = done.reduce((max, s) => Math.max(max, s.endedAt ?? s.startedAt), 0);
  const mine = scheduled.filter((s) => s.coachId === coachId);
  const next = pickNextWorkout(mine, now);
  const missedToday = mine.some(
    (s) =>
      s.status === "missed" &&
      dayKey(s.scheduledAt) === dayKey(now) &&
      now > s.scheduledAt + WORKOUT_GRACE_MS,
  );

  let nextWorkout: string | null = null;
  if (next) {
    const plan = getPlan(next.planId);
    nextWorkout = `${formatWhen(next.scheduledAt, now)} · ${plan.cardTitle}, ${formatMinutes(plan.durationMin)}`;
  }

  // Предыдущие сообщения без самого нового: оно уйдёт отдельным полем.
  const history = historyFor(messages);
  const lastTurn = history[history.length - 1];
  if (lastTurn?.role === "user" && lastTurn.text === message.trim()) history.pop();

  return {
    anonId: profile.anonId,
    coachId,
    harshness: clampHarshness(profile.harshness, profile.ageBand),
    ageBand: profile.ageBand,
    userName: profile.name,
    goal: profile.goal,
    level: userCoach.level,
    score: userCoach.score,
    memory: memory.map((m) => ({ fact: m.fact, kind: m.kind })),
    history,
    message: message.trim().slice(0, LIMITS.message),
    context: {
      nowLabel: `${weekdayLong(now)}, ${monthDayFmt.format(now)}, ${formatClock(now)}`,
      streak: computeStreak(
        done.map((s) => s.endedAt ?? s.startedAt),
        now,
      ),
      workoutsTotal: done.length,
      lastWorkoutAgo:
        lastEnd === 0
          ? null
          : daysBetween(lastEnd, now) === 0
            ? t("common.today")
            : daysBetween(lastEnd, now) === 1
              ? t("common.yesterday")
              : formatAgo(startOfDay(lastEnd), now),
      nextWorkout,
      missedToday,
    },
  };
}

/** Для тестов и подписи: имя тренера в контексте не нужно, но пусть будет в одном месте. */
export function coachName(coachId: CoachId): string {
  return getCoach(coachId).name;
}
