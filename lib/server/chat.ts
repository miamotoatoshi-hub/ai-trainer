import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserTurn } from "@/lib/coach/prompts";
import { CHAT_REPLY_SCHEMA, validateChatReply } from "@/lib/chat/schema";
import type { ChatReply, ChatRequest } from "@/lib/chat/types";
import type { CoachId } from "@/lib/data/types";
import { clampHarshness } from "@/lib/safety/age";

/** Модель чата берётся из настройки; по умолчанию — самая дешёвая из актуальных (Haiku). */
export const DEFAULT_CHAT_MODEL = "claude-haiku-5-5";

export function chatModel(): string {
  return process.env.ANTHROPIC_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

/** Ровно то, что нужно от клиента Anthropic: так нейросеть подменяется в тестах. */
export interface ChatModelClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export function createChatClient(apiKey: string): ChatModelClient {
  return new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
}

const personaCache = new Map<CoachId, string>();

/** Характер тренера лежит в content/coaches/<id>/persona.md; читаем один раз. */
export async function loadPersona(coachId: CoachId): Promise<string> {
  const cached = personaCache.get(coachId);
  if (cached) return cached;
  const file = path.join(process.cwd(), "content", "coaches", coachId, "persona.md");
  const text = await fs.readFile(file, "utf8");
  personaCache.set(coachId, text);
  return text;
}

export interface GenerateResult {
  reply: ChatReply;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

export interface GenerateDeps {
  client: ChatModelClient;
  model?: string;
  persona: string;
}

function toMessages(req: ChatRequest): Anthropic.MessageParam[] {
  // Соседние реплики одного автора склеиваем: API принимает чередование ролей.
  const turns: Anthropic.MessageParam[] = [];
  for (const turn of req.history) {
    const role = turn.role === "user" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${turn.text}`;
    } else {
      turns.push({ role, content: turn.text });
    }
  }
  while (turns.length > 0 && turns[0]!.role !== "user") turns.shift();
  const last = turns[turns.length - 1];
  const finalUser = buildUserTurn(req);
  if (last && last.role === "user" && typeof last.content === "string") {
    last.content = `${last.content}\n\n${finalUser}`;
  } else {
    turns.push({ role: "user", content: finalUser });
  }
  return turns;
}

function extractJson(message: Anthropic.Message): unknown {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) return null;
  try {
    return JSON.parse(block.text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Один ответ тренера нейросетью. Ответ проверяется (форма + правила безопасности);
 * если не прошёл — одна повторная попытка с указанием, что было не так. Дальше — null,
 * и клиент отвечает заготовленной репликой.
 */
export async function generateReply(
  req: ChatRequest,
  deps: GenerateDeps,
): Promise<GenerateResult | null> {
  const harshness = clampHarshness(req.harshness, req.ageBand);
  const system = buildSystemPrompt({
    persona: deps.persona,
    harshness,
    ageBand: req.ageBand,
  });
  const base = toMessages(req);
  let inputTokens = 0;
  let outputTokens = 0;
  let why = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages = [...base];
    if (why) {
      const last = messages[messages.length - 1]!;
      messages[messages.length - 1] = {
        role: "user",
        content: `${String(last.content)}\n\n<проверка>Прошлый ответ отклонён: ${why}. Ответь заново по тем же правилам.</проверка>`,
      };
    }
    const response = await deps.client.messages.create({
      model: deps.model ?? chatModel(),
      max_tokens: 1500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: CHAT_REPLY_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
    inputTokens += response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0);
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") return null;
    const parsed = validateChatReply(extractJson(response));
    if (parsed.ok) {
      return { reply: parsed.reply, inputTokens, outputTokens, attempts: attempt };
    }
    why = parsed.why;
  }
  return null;
}
