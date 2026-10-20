import { EXERCISE_IDS, type ExerciseId } from "@/lib/data/types";
import { checkName } from "@/lib/onboarding/anketa";

/**
 * Друзья и дуэли работают без сервера: всё нужное лежит прямо в ссылке (имя, результат).
 * Поэтому цифры в ссылке может поправить кто угодно — для дружеского соревнования это нормально,
 * для настоящих призов потребуется сервер с проверкой (в планах).
 */
export type SocialPayload =
  | { v: 1; kind: "friend"; id: string; name: string; weekly: number; week: string }
  | {
      v: 1;
      kind: "duel";
      id: string;
      name: string;
      exercise: ExerciseId;
      seconds: number;
      score: number;
    }
  | { v: 1; kind: "reply"; id: string; name: string; score: number };

export const MAX_SCORE = 999;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodePayload(payload: SocialPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_SCORE
    ? value
    : null;
}

function id(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

function name(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const check = checkName(value);
  return check.ok ? check.name : null;
}

/** Разбирает ссылку. Любая ошибка или подозрительное значение — null (ссылка просто не сработает). */
export function decodePayload(raw: string): SocialPayload | null {
  try {
    const data: unknown = JSON.parse(fromBase64Url(raw));
    if (!isRecord(data) || data.v !== 1) return null;
    const pid = id(data.id);
    const pname = name(data.name);
    if (!pid || !pname) return null;
    if (data.kind === "friend") {
      const weekly = score(data.weekly);
      if (
        weekly === null ||
        typeof data.week !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.week)
      )
        return null;
      return { v: 1, kind: "friend", id: pid, name: pname, weekly, week: data.week };
    }
    if (data.kind === "duel") {
      const pscore = score(data.score);
      const exercise = EXERCISE_IDS.find((e) => e === data.exercise);
      const seconds = data.seconds;
      if (
        pscore === null ||
        !exercise ||
        typeof seconds !== "number" ||
        !Number.isInteger(seconds) ||
        seconds < 10 ||
        seconds > 180
      )
        return null;
      return { v: 1, kind: "duel", id: pid, name: pname, exercise, seconds, score: pscore };
    }
    if (data.kind === "reply") {
      const pscore = score(data.score);
      if (pscore === null) return null;
      return { v: 1, kind: "reply", id: pid, name: pname, score: pscore };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildLink(origin: string, payload: SocialPayload): string {
  return `${origin}/join?d=${encodePayload(payload)}`;
}
