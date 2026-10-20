import { scriptedEmotion } from "@/lib/chat/respond";
import { pickScripted, type ScriptedCategory } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import {
  dueAwayMessages,
  missedStreak,
  toneLevel,
  type AwayKind,
  type AwayMessage,
} from "@/lib/notifications/rules";
import { DAY } from "@/lib/time";

// Правила живут в lib/notifications/rules.ts; здесь только запись в чат и журнал.
export {
  dueAwayMessages,
  type AwayInput,
  type AwayKind,
  type AwayMessage,
} from "@/lib/notifications/rules";

/** Сообщение, которое только что записано в чат (с текстом — для системного уведомления). */
export type PostedAway = AwayMessage & { text: string };

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
): Promise<PostedAway[]> {
  const profile = await repo.getProfile();
  if (!profile.onboardingDone) return [];
  const [coaches, scheduled, log, sessions] = await Promise.all([
    repo.listUserCoaches(),
    repo.listScheduled(),
    repo.listNotificationLog(now - 8 * DAY),
    repo.listSessions(60),
  ]);
  const due = dueAwayMessages({ profile, coaches, scheduled, log, now });
  const posted: PostedAway[] = [];
  const tone = toneLevel(profile, missedStreak(scheduled, sessions, now));
  for (const item of due) {
    const recent = (await repo.listMessages(item.coachId))
      .filter((m) => m.sender === "coach")
      .slice(-10)
      .map((m) => m.text);
    const category = CATEGORY[item.kind];
    const text = pickScripted(item.coachId, category, tone, { rng, avoid: recent });
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
    posted.push({ ...item, text });
  }
  return posted;
}
