import type {
  AgeBand,
  CoachId,
  Emotion,
  Goal,
  Harshness,
  RelationshipLevel,
} from "@/lib/data/types";
import type { SafetyKind } from "@/lib/safety/detector";

/** Что тренер хочет сделать кроме ответа словами. Сама тренировка никогда не стартует без нажатия. */
export const CHAT_ACTIONS = ["none", "propose_workout", "start_workout"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

export interface ChatTurn {
  role: "user" | "coach";
  text: string;
}

/** Сведения «о сейчас», которые клиент присылает серверу вместе с сообщением (аккаунтов нет). */
export interface ChatContext {
  /** Человеческая запись времени: «вторник, 20 октября, 18:40». */
  nowLabel: string;
  streak: number;
  workoutsTotal: number;
  /** «вчера», «3 дня назад» или null, если тренировок ещё не было. */
  lastWorkoutAgo: string | null;
  /** «сегодня в 18:00 · Ноги, 20 минут» или null. */
  nextWorkout: string | null;
  /** Пропущена ли сегодняшняя плановая тренировка. */
  missedToday: boolean;
}

export interface ChatRequest {
  anonId: string;
  coachId: CoachId;
  harshness: Harshness;
  ageBand: AgeBand | null;
  userName: string;
  goal: Goal | null;
  level: RelationshipLevel;
  score: number;
  /** Что тренер помнит о пользователе: короткие факты и ограничения по здоровью. */
  memory: { fact: string; kind: "fact" | "limitation" }[];
  history: ChatTurn[];
  message: string;
  context: ChatContext;
}

export interface MemoryItem {
  fact: string;
  kind: "fact" | "limitation";
}

export interface ChatReply {
  /** От одного до трёх коротких сообщений подряд. */
  messages: string[];
  emotion: Emotion;
  action: ChatAction;
  safety: "none" | SafetyKind;
  memory: MemoryItem[];
}

export type ChatFailReason = "no_key" | "limit" | "error" | "safety" | "bad_request" | "offline";

export type ChatOutcome =
  { ok: true; reply: ChatReply; source: "llm" } | { ok: false; reason: ChatFailReason };

export const LIMITS = {
  message: 500,
  history: 12,
  historyText: 400,
  memoryItems: 10,
  memoryText: 140,
  replyMessages: 3,
  replyText: 320,
  name: 40,
} as const;
