import { COACH_IDS, EMOTIONS, LEVELS } from "@/lib/data/types";
import { checkCoachReply } from "@/lib/safety/guard";
import {
  CHAT_ACTIONS,
  LIMITS,
  type ChatReply,
  type ChatRequest,
  type ChatTurn,
  type MemoryItem,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** JSON-схема ответа тренера для структурированного вывода нейросети. */
export const CHAT_REPLY_SCHEMA = {
  type: "object",
  properties: {
    messages: { type: "array", items: { type: "string" } },
    emotion: { type: "string", enum: [...EMOTIONS] },
    action: { type: "string", enum: [...CHAT_ACTIONS] },
    safety: { type: "string", enum: ["none", "pain", "eating", "crisis"] },
    memory: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fact: { type: "string" },
          kind: { type: "string", enum: ["fact", "limitation"] },
        },
        required: ["fact", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages", "emotion", "action", "safety", "memory"],
  additionalProperties: false,
} as const;

/** Проверка запроса от клиента: чужие и кривые данные до нейросети не доходят. */
export function parseChatRequest(raw: unknown): ChatRequest | null {
  if (!isRecord(raw)) return null;
  const coachId = oneOf(COACH_IDS, raw.coachId);
  const anonId = str(raw.anonId, 80);
  const message = str(raw.message, LIMITS.message);
  const level = oneOf(LEVELS, raw.level);
  if (!coachId || !anonId || !message || !level) return null;
  const harshness =
    raw.harshness === 1 || raw.harshness === 2 || raw.harshness === 3 ? raw.harshness : 2;
  const ageBand = oneOf(["13-15", "16-17", "18+"] as const, raw.ageBand);
  const goal = oneOf(["strength", "weight", "endurance", "shape"] as const, raw.goal);
  const ctx = isRecord(raw.context) ? raw.context : {};

  const history: ChatTurn[] = [];
  if (Array.isArray(raw.history)) {
    for (const item of raw.history.slice(-LIMITS.history)) {
      if (!isRecord(item)) continue;
      const role = oneOf(["user", "coach"] as const, item.role);
      const text = str(item.text, LIMITS.historyText);
      if (role && text) history.push({ role, text });
    }
  }
  const memory: MemoryItem[] = [];
  if (Array.isArray(raw.memory)) {
    for (const item of raw.memory.slice(0, LIMITS.memoryItems)) {
      if (!isRecord(item)) continue;
      const fact = str(item.fact, LIMITS.memoryText);
      const kind = oneOf(["fact", "limitation"] as const, item.kind) ?? "fact";
      if (fact) memory.push({ fact, kind });
    }
  }
  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : 0;
  return {
    anonId,
    coachId,
    harshness,
    ageBand,
    userName: str(raw.userName, LIMITS.name) ?? "",
    goal,
    level,
    score: Math.max(0, Math.min(100, Math.round(score))),
    memory,
    history,
    message,
    context: {
      nowLabel: str(ctx.nowLabel, 80) ?? "",
      streak: typeof ctx.streak === "number" ? Math.max(0, Math.floor(ctx.streak)) : 0,
      workoutsTotal:
        typeof ctx.workoutsTotal === "number" ? Math.max(0, Math.floor(ctx.workoutsTotal)) : 0,
      lastWorkoutAgo: str(ctx.lastWorkoutAgo, 60),
      nextWorkout: str(ctx.nextWorkout, 120),
      missedToday: ctx.missedToday === true,
    },
  };
}

export type ReplyCheck = { ok: true; reply: ChatReply } | { ok: false; why: string };

/**
 * Проверка ответа нейросети: форма, длина, допустимые значения и правила безопасности.
 * `why` потом используется как подсказка для повторной попытки.
 */
export function validateChatReply(raw: unknown): ReplyCheck {
  if (!isRecord(raw)) return { ok: false, why: "ответ — не JSON-объект" };
  const emotion = oneOf(EMOTIONS, raw.emotion);
  const action = oneOf(CHAT_ACTIONS, raw.action);
  const safety = oneOf(["none", "pain", "eating", "crisis"] as const, raw.safety);
  if (!emotion) return { ok: false, why: "поле emotion вне списка" };
  if (!action) return { ok: false, why: "поле action вне списка" };
  if (!safety) return { ok: false, why: "поле safety вне списка" };
  if (!Array.isArray(raw.messages)) return { ok: false, why: "messages — не массив" };

  const messages: string[] = [];
  for (const item of raw.messages) {
    const text = str(item, 2000);
    if (!text) continue;
    if (text.length > LIMITS.replyText) return { ok: false, why: "сообщение слишком длинное" };
    const verdict = checkCoachReply(text);
    if (!verdict.ok) return { ok: false, why: `нарушено правило безопасности: ${verdict.reason}` };
    messages.push(text);
  }
  if (messages.length === 0) return { ok: false, why: "нет ни одного сообщения" };
  if (messages.length > LIMITS.replyMessages) messages.length = LIMITS.replyMessages;

  const memory: MemoryItem[] = [];
  if (Array.isArray(raw.memory)) {
    for (const item of raw.memory.slice(0, 2)) {
      if (!isRecord(item)) continue;
      const fact = str(item.fact, LIMITS.memoryText);
      const kind = oneOf(["fact", "limitation"] as const, item.kind) ?? "fact";
      if (fact) memory.push({ fact, kind });
    }
  }
  return { ok: true, reply: { messages, emotion, action, safety, memory } };
}
