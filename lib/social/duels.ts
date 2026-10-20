import type { Repository } from "@/lib/data/repository";
import type { Duel, ExerciseId, WorkoutSession } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import { duelPlanId } from "@/lib/workout/plans";
import { startWorkoutSession } from "@/lib/workout/startSession";
import { buildLink, MAX_SCORE, type SocialPayload } from "./links";

/** Классическая дуэль: сколько чистых приседаний за минуту. */
export const DUEL_EXERCISE: ExerciseId = "squat";
export const DUEL_SECONDS = 60;

const PUBLIC_ID_KEY = "publicId";
const sessionKey = (sessionId: string) => `duelSession:${sessionId}`;

/** Публичный идентификатор для ссылок. Не связан с anonId, который нужен серверу для лимитов. */
export async function getPublicId(repo: Repository): Promise<string> {
  const existing = await repo.getMeta<string>(PUBLIC_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto.randomUUID();
  await repo.setMeta(PUBLIC_ID_KEY, id);
  return id;
}

async function startDuelSession(repo: Repository, duel: Duel): Promise<string> {
  const profile = await repo.getProfile();
  const sessionId = await startWorkoutSession(repo, {
    coachId: profile.activeCoachId,
    planId: duelPlanId(duel.exerciseId, duel.durationSec),
    mode: "duel",
  });
  await repo.setMeta(sessionKey(sessionId), duel.id);
  return sessionId;
}

/** Мой вызов: создаём дуэль и запускаем минуту приседаний. Возвращает id тренировки. */
export async function createChallenge(repo: Repository, now: number): Promise<string> {
  const profile = await repo.getProfile();
  const duel: Duel = {
    id: globalThis.crypto.randomUUID(),
    role: "challenger",
    exerciseId: DUEL_EXERCISE,
    durationSec: DUEL_SECONDS,
    challengerName: profile.name || t("rating.you"),
    challengerResult: null,
    opponentName: null,
    opponentResult: null,
    createdAt: now,
  };
  await repo.putDuel(duel);
  return startDuelSession(repo, duel);
}

export type AcceptResult =
  { ok: true; sessionId: string; duel: Duel } | { ok: false; reason: "own" | "done"; duel: Duel };

/** Принять вызов друга: запоминаем его результат и запускаем такую же минуту. */
export async function acceptChallenge(
  repo: Repository,
  payload: Extract<SocialPayload, { kind: "duel" }>,
  now: number,
): Promise<AcceptResult> {
  const existing = await repo.getDuel(payload.id);
  if (existing) {
    if (existing.role === "challenger") return { ok: false, reason: "own", duel: existing };
    if (existing.opponentResult !== null) return { ok: false, reason: "done", duel: existing };
    return { ok: true, sessionId: await startDuelSession(repo, existing), duel: existing };
  }
  const profile = await repo.getProfile();
  const duel: Duel = {
    id: payload.id,
    role: "opponent",
    exerciseId: payload.exercise,
    durationSec: payload.seconds,
    challengerName: payload.name,
    challengerResult: payload.score,
    opponentName: profile.name || t("rating.you"),
    opponentResult: null,
    createdAt: now,
  };
  await repo.putDuel(duel);
  return { ok: true, sessionId: await startDuelSession(repo, duel), duel };
}

/** Чистые повторения в тренировке-дуэли. */
export function duelScore(session: Pick<WorkoutSession, "results">): number {
  const clean = session.results.reduce((sum, r) => sum + (r.unit === "reps" ? r.clean : 0), 0);
  return Math.min(MAX_SCORE, clean);
}

/** После тренировки-дуэли записывает результат. Прерванная тренировка результата не даёт. */
export async function recordDuelResult(
  repo: Repository,
  session: WorkoutSession,
): Promise<Duel | null> {
  if (session.mode !== "duel" || session.status !== "done") return null;
  const duelId = await repo.getMeta<string>(sessionKey(session.id));
  if (!duelId) return null;
  const duel = await repo.getDuel(duelId);
  if (!duel) return null;
  const score = duelScore(session);
  const updated: Duel =
    duel.role === "challenger"
      ? { ...duel, challengerResult: score }
      : { ...duel, opponentResult: score };
  await repo.putDuel(updated);
  return updated;
}

export type ReplyResult =
  { ok: true; duel: Duel } | { ok: false; reason: "unknown" | "own" | "mismatch" };

/** Ответ друга на мой вызов: записываем его результат. */
export async function applyReply(
  repo: Repository,
  payload: Extract<SocialPayload, { kind: "reply" }>,
): Promise<ReplyResult> {
  const duel = await repo.getDuel(payload.id);
  if (!duel) return { ok: false, reason: "unknown" };
  if (duel.role !== "challenger") return { ok: false, reason: "own" };
  const updated: Duel = { ...duel, opponentName: payload.name, opponentResult: payload.score };
  await repo.putDuel(updated);
  return { ok: true, duel: updated };
}

export type DuelOutcome = "pending" | "win" | "lose" | "draw";

/** Мои очки и очки соперника с моей точки зрения. */
export function sides(duel: Duel): {
  mine: number | null;
  theirs: number | null;
  theirName: string;
} {
  return duel.role === "challenger"
    ? {
        mine: duel.challengerResult,
        theirs: duel.opponentResult,
        theirName: duel.opponentName ?? "?",
      }
    : { mine: duel.opponentResult, theirs: duel.challengerResult, theirName: duel.challengerName };
}

export function duelOutcome(duel: Duel): DuelOutcome {
  const { mine, theirs } = sides(duel);
  if (mine === null || theirs === null) return "pending";
  if (mine > theirs) return "win";
  if (mine < theirs) return "lose";
  return "draw";
}

/** Ссылка-вызов: отправляется другу после моей минуты. */
export function challengeLink(duel: Duel, origin: string): string | null {
  if (duel.role !== "challenger" || duel.challengerResult === null) return null;
  return buildLink(origin, {
    v: 1,
    kind: "duel",
    id: duel.id,
    name: duel.challengerName,
    exercise: duel.exerciseId,
    seconds: duel.durationSec,
    score: duel.challengerResult,
  });
}

/** Ссылка-ответ: отправляется тому, кто меня вызвал. */
export function replyLink(duel: Duel, origin: string): string | null {
  if (duel.role !== "opponent" || duel.opponentResult === null) return null;
  return buildLink(origin, {
    v: 1,
    kind: "reply",
    id: duel.id,
    name: duel.opponentName ?? "?",
    score: duel.opponentResult,
  });
}
