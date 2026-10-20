import { getCoach } from "@/lib/coach/coaches";
import { pickScripted } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import type { CoachId, Message, UserCoach } from "@/lib/data/types";
import { HOUR, MINUTE } from "@/lib/time";

/** Тренер сейчас «игнорирует»: читает сообщения, но не отвечает. */
export function isIgnoring(
  coach: Pick<UserCoach, "state" | "ignoringUntil">,
  now: number,
): boolean {
  return coach.state === "ignoring" && coach.ignoringUntil !== null && coach.ignoringUntil > now;
}

/**
 * Начинает игнор: на 12 часов (у Марины — на 24). Это детерминированная механика,
 * её запускает пропуск плановой тренировки, а не нейросеть.
 */
export function startIgnoring(coach: UserCoach, since: number): UserCoach {
  const hours = getCoach(coach.coachId).ignoreHours;
  return {
    ...coach,
    state: "ignoring",
    ignoreStartedAt: since,
    ignoringUntil: since + hours * HOUR,
    coldMessageDueAt: null,
    coldMessageSent: false,
  };
}

/** Снимает игнор (тренировкой, по истечении срока или из-за сигнала боли/кризиса). */
export function liftIgnoring(coach: UserCoach): UserCoach {
  return {
    ...coach,
    state: "normal",
    ignoringUntil: null,
    ignoreStartedAt: null,
    coldMessageDueAt: null,
  };
}

/** Через сколько после сообщения пользователя тренер может прислать единственное «холодное» сообщение. */
export const COLD_MESSAGE_DELAY_MIN_MS = 2 * MINUTE;
export const COLD_MESSAGE_DELAY_MAX_MS = 8 * MINUTE;

/**
 * Пользователь написал, пока тренер игнорирует: сообщения помечаются «прочитано», ответа нет.
 * Не более одного холодного сообщения за период игнора.
 */
export async function onUserMessageWhileIgnoring(
  repo: Repository,
  coachId: CoachId,
  now: number,
  rng: () => number = Math.random,
): Promise<void> {
  await repo.markUserMessagesRead(coachId, now);
  const coach = await repo.getUserCoach(coachId);
  if (coach.coldMessageSent || coach.coldMessageDueAt !== null) return;
  const delay =
    COLD_MESSAGE_DELAY_MIN_MS + rng() * (COLD_MESSAGE_DELAY_MAX_MS - COLD_MESSAGE_DELAY_MIN_MS);
  await repo.putUserCoach({ ...coach, coldMessageDueAt: now + delay });
}

/** Если пришло время «холодного» сообщения — отправляет его (один раз за период игнора). */
export async function deliverColdMessageIfDue(
  repo: Repository,
  coachId: CoachId,
  now: number,
  rng: () => number = Math.random,
): Promise<Message | null> {
  const coach = await repo.getUserCoach(coachId);
  if (!isIgnoring(coach, now) || coach.coldMessageSent) return null;
  if (coach.coldMessageDueAt === null || coach.coldMessageDueAt > now) return null;
  const profile = await repo.getProfile();
  const text = pickScripted(coachId, "ignore_cold", profile.harshness, { rng });
  const message = await repo.addMessage({
    coachId,
    sender: "coach",
    type: "text",
    text,
    emotion: "contempt",
    durationSec: null,
    meta: { source: "scripted" },
    readAt: null,
    createdAt: now,
  });
  await repo.putUserCoach({ ...coach, coldMessageSent: true, coldMessageDueAt: null });
  return message;
}
