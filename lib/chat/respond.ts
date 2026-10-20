import { classifyIntent } from "@/lib/coach/intent";
import { pickScripted, type ScriptedCategory } from "@/lib/coach/scripted";
import type { PendingKind } from "@/lib/coach/status";
import type { Repository } from "@/lib/data/repository";
import type { CoachId, Emotion, Message, NewMessage } from "@/lib/data/types";
import { liftIgnoring, onUserMessageWhileIgnoring } from "@/lib/game/ignoring";
import { pickNextWorkout } from "@/lib/game/hero";
import { t } from "@/lib/i18n";
import { detectSafety, type SafetyKind } from "@/lib/safety/detector";
import { clampHarshness } from "@/lib/safety/age";
import { DAY } from "@/lib/time";
import { DEFAULT_PLAN_ID } from "@/lib/workout/plans";
import { fetchChatReply } from "./api";
import { buildChatRequest } from "./context";
import { saveMemory } from "./memory";
import type { ChatAction, ChatFailReason, ChatOutcome, ChatRequest, MemoryItem } from "./types";

export interface RespondDeps {
  repo: Repository;
  fetchReply?: (req: ChatRequest) => Promise<ChatOutcome>;
  now?: () => number;
  rng?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onPending?: (kind: PendingKind) => void;
}

export type RespondKind = "llm" | "scripted" | "safety" | "ignored";

export interface RespondResult {
  kind: RespondKind;
  failReason?: ChatFailReason;
  safety?: SafetyKind;
  added: Message[];
}

/** После сигнала кризиса игнор и «уколы» выключены на неделю (раздел 10 ТЗ). */
export const SUPPORT_PAUSE_MS = 7 * DAY;

/** Голосовое — не чаще, чем одно из четырёх ответов тренера. */
export const VOICE_EVERY = 4;
const VOICE_MAX_CHARS = 140;
const SPEECH_CHARS_PER_SEC = 14;

const SCRIPTED_EMOTION: Record<ScriptedCategory, Emotion> = {
  greeting: "neutral",
  apology: "disappointed",
  excuse: "disappointed",
  tired: "neutral",
  ask_plan: "neutral",
  thanks: "neutral",
  hard: "neutral",
  quit: "angry",
  proud_me: "surprised",
  who_are_you: "neutral",
  how_are_you: "neutral",
  flirt: "angry",
  insult_me: "contempt",
  workout_done: "proud",
  fallback: "neutral",
  limit: "contempt",
  ignore_cold: "contempt",
  ignore_end: "neutral",
  status_new_student: "contempt",
  level_up_tolerates: "neutral",
  level_up_respects: "proud",
  level_up_proud: "proud",
  morning: "neutral",
  reminder: "neutral",
  poke: "disappointed",
  evening_cold: "contempt",
  streak7: "proud",
  welcome_back: "neutral",
  propose_workout: "neutral",
};

export function scriptedEmotion(category: ScriptedCategory): Emotion {
  return SCRIPTED_EMOTION[category];
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Пауза «печатает…»: 1–4 секунды в зависимости от длины ответа. */
export function typingDelayMs(text: string, rng: () => number): number {
  const base = 1000 + Math.min(2200, text.length * 28);
  return Math.round(Math.min(4000, base + rng() * 700));
}

/**
 * Пользователь написал тренеру. Что происходит дальше:
 *  1. сигналы боли/еды/кризиса — проверенный текст приложения, нейросеть не участвует;
 *  2. тренер игнорирует — «прочитано», ответа нет;
 *  3. иначе нейросеть (если есть ключ и лимит), а при любой неудаче — заготовленная реплика.
 */
export async function sendUserMessage(
  deps: RespondDeps,
  coachId: CoachId,
  rawText: string,
): Promise<RespondResult | null> {
  const text = rawText.trim();
  if (!text) return null;
  const { repo } = deps;
  const now = deps.now ?? Date.now;
  const rng = deps.rng ?? Math.random;
  const sleep = deps.sleep ?? realSleep;
  const pending = deps.onPending ?? (() => undefined);
  const added: Message[] = [];

  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(now(), lastStamp + 1);
    return lastStamp;
  };
  const addCoach = async (partial: Partial<NewMessage> & Pick<NewMessage, "text">) => {
    const message = await repo.addMessage({
      coachId,
      sender: "coach",
      type: "text",
      emotion: null,
      durationSec: null,
      meta: {},
      readAt: null,
      createdAt: stamp(),
      ...partial,
    });
    added.push(message);
    return message;
  };

  const sentAt = stamp();
  await repo.addMessage({
    coachId,
    sender: "user",
    type: "text",
    text,
    emotion: null,
    durationSec: null,
    meta: {},
    readAt: null,
    createdAt: sentAt,
  });
  let coach = await repo.getUserCoach(coachId);
  await repo.putUserCoach({ ...coach, lastInteractionAt: sentAt });
  const profile = await repo.getProfile();

  // 1. Безопасность — раньше игнора: при боли и кризисе тренер отвечает всегда.
  const safety = detectSafety(text);
  if (safety) {
    coach = await repo.getUserCoach(coachId);
    if (coach.state === "ignoring") await repo.putUserCoach(liftIgnoring(coach));
    await repo.markUserMessagesRead(coachId, stamp());
    pending("typing");
    await sleep(900 + rng() * 600);
    await addCoach({ text: t(`safety.${safety}`), emotion: "neutral", meta: { source: "system" } });
    if (safety === "crisis" || safety === "eating") {
      await addCoach({
        type: "support",
        text: t("safety.supportCard"),
        meta: { source: "system" },
      });
    }
    if (safety === "crisis") {
      await repo.updateProfile({ supportPausedUntil: stamp() + SUPPORT_PAUSE_MS });
    }
    if (safety === "pain") {
      await saveMemory(
        repo,
        coachId,
        [{ kind: "limitation", fact: t("safety.painMemory", { text: text.slice(0, 80) }) }],
        now(),
      );
    }
    pending(null);
    return { kind: "safety", safety, added };
  }

  // 2. Игнор: «прочитано», ответа нет, максимум одно холодное сообщение за период.
  coach = await repo.getUserCoach(coachId);
  const paused = profile.supportPausedUntil !== null && profile.supportPausedUntil > now();
  if (coach.state === "ignoring" && !paused) {
    await onUserMessageWhileIgnoring(repo, coachId, stamp(), rng);
    return { kind: "ignored", added };
  }

  // 3. Обычный ответ. «Прочитал» — с небольшой задержкой, как у живого человека.
  await sleep(350 + rng() * 650);
  await repo.markUserMessagesRead(coachId, stamp());
  pending("typing");

  const request = await buildChatRequest(repo, coachId, text, now());
  const fetchReply = deps.fetchReply ?? ((req: ChatRequest) => fetchChatReply(req));
  const outcome = await fetchReply(request);

  let lines: string[];
  let emotion: Emotion;
  let action: ChatAction = "none";
  let memory: MemoryItem[] = [];
  let kind: RespondKind;
  let failReason: ChatFailReason | undefined;

  if (outcome.ok) {
    kind = "llm";
    lines = outcome.reply.messages;
    emotion = outcome.reply.emotion;
    action = outcome.reply.action;
    memory = outcome.reply.memory;
  } else {
    kind = "scripted";
    failReason = outcome.reason;
    const category: ScriptedCategory = outcome.reason === "limit" ? "limit" : classifyIntent(text);
    const recent = (await repo.listMessages(coachId))
      .filter((m) => m.sender === "coach")
      .slice(-10)
      .map((m) => m.text);
    lines = [
      pickScripted(coachId, category, clampHarshness(profile.harshness, profile.ageBand), {
        rng,
        avoid: recent,
      }),
    ];
    emotion = scriptedEmotion(category);
    if (category === "ask_plan") action = "propose_workout";
  }

  // Голосовое — не чаще одного из четырёх ответов и только короткое одиночное.
  const gapKey = `chatVoiceGap:${coachId}`;
  const gap = (await repo.getMeta<number>(gapKey)) ?? 0;
  const single = lines.length === 1 ? lines[0]! : null;
  const asVoice =
    profile.voiceEnabled &&
    single !== null &&
    single.length <= VOICE_MAX_CHARS &&
    gap >= VOICE_EVERY - 1 &&
    rng() < 0.7;
  await repo.setMeta(gapKey, asVoice ? 0 : gap + 1);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    pending(asVoice ? "recording" : "typing");
    await sleep(i === 0 ? typingDelayMs(line, rng) : 800 + rng() * 700);
    if (asVoice) {
      await addCoach({
        type: "voice",
        text: line,
        emotion,
        durationSec: Math.max(2, Math.round(line.length / SPEECH_CHARS_PER_SEC)),
        meta: { transcript: line, source: kind === "llm" ? "llm" : "scripted" },
      });
    } else {
      await addCoach({
        text: line,
        emotion,
        meta: { source: kind === "llm" ? "llm" : "scripted" },
      });
    }
  }

  if (action !== "none") {
    const next = pickNextWorkout(
      (await repo.listScheduled()).filter((s) => s.coachId === coachId),
      now(),
    );
    await addCoach({
      type: "workout_card",
      text: "",
      meta: {
        planId: next?.planId ?? DEFAULT_PLAN_ID,
        scheduledId: next?.id,
        scheduledAt: next?.scheduledAt,
      },
    });
  }
  if (memory.length > 0) await saveMemory(repo, coachId, memory, now());
  pending(null);
  return { kind, failReason, added };
}
