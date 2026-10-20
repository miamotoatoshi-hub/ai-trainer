import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/coach/prompts";
import type { ChatRequest } from "@/lib/chat/types";
import { generateReply, type ChatModelClient } from "@/lib/server/chat";

const REQUEST: ChatRequest = {
  anonId: "anon",
  coachId: "gromov",
  harshness: 2,
  ageBand: "16-17",
  userName: "Алекс",
  goal: null,
  level: "tolerates",
  score: 30,
  memory: [{ fact: "колено: осторожно", kind: "limitation" }],
  history: [
    { role: "coach", text: "Слушаю." },
    { role: "user", text: "привет" },
    { role: "user", text: "что по плану?" },
    { role: "coach", text: "В 18:00 ноги." },
  ],
  message: "а если я устану?",
  context: {
    nowLabel: "вторник, 20 октября, 18:40",
    streak: 2,
    workoutsTotal: 5,
    lastWorkoutAgo: "вчера",
    nextWorkout: "сегодня в 18:00 · Ноги",
    missedToday: false,
  },
};

function reply(json: unknown, usage = { input_tokens: 800, output_tokens: 60 }): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;
}

const GOOD = {
  messages: ["Устанешь — значит, растёшь."],
  emotion: "neutral",
  action: "none",
  safety: "none",
  memory: [],
};

function fakeClient(...responses: Anthropic.Message[]) {
  const create = vi.fn<ChatModelClient["messages"]["create"]>();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { messages: { create } } satisfies ChatModelClient, create };
}

describe("generateReply", () => {
  it("возвращает проверенный ответ с первой попытки", async () => {
    const { client, create } = fakeClient(reply(GOOD));
    const result = await generateReply(REQUEST, { client, persona: "# Громов" });
    expect(result?.reply.messages).toEqual(["Устанешь — значит, растёшь."]);
    expect(result?.attempts).toBe(1);
    expect(result?.inputTokens).toBe(800);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("формирует запрос: модель, структурный вывод, кэшируемый системный промпт, роли по очереди", async () => {
    const { client, create } = fakeClient(reply(GOOD));
    await generateReply(REQUEST, { client, persona: "# Громов", model: "claude-haiku-5-5" });
    const params = create.mock.calls[0]![0];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.output_config?.effort).toBe("low");
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    const roles = params.messages.map((m) => m.role);
    expect(roles[0]).toBe("user");
    expect(roles[roles.length - 1]).toBe("user");
    for (let i = 1; i < roles.length; i += 1) expect(roles[i]).not.toBe(roles[i - 1]);
    const last = String(params.messages[params.messages.length - 1]!.content);
    expect(last).toContain("а если я устану?");
    expect(last).toContain("колено: осторожно");
    expect(last).toContain("вторник, 20 октября, 18:40");
  });

  it("системный промпт не содержит ничего, что меняется от сообщения к сообщению (иначе кэш не работает)", () => {
    const a = buildSystemPrompt({ persona: "P", harshness: 2, ageBand: "16-17" });
    const b = buildSystemPrompt({ persona: "P", harshness: 2, ageBand: "13-15" });
    expect(a).toBe(b);
    expect(a).not.toContain("вторник");
    expect(a).not.toContain("Алекс");
  });

  it("жёсткость 3 несовершеннолетнему не выдаётся", () => {
    const prompt = buildSystemPrompt({ persona: "P", harshness: 3, ageBand: "16-17" });
    expect(prompt).not.toContain("Жёсткий режим");
    const adult = buildSystemPrompt({ persona: "P", harshness: 3, ageBand: "18+" });
    expect(adult).toContain("Жёсткий режим");
  });

  it("при плохом ответе делает ровно одну повторную попытку и сообщает, что было не так", async () => {
    const { client, create } = fakeClient(
      reply({ ...GOOD, messages: ["Ты толстый, поэтому устал"] }),
      reply(GOOD),
    );
    const result = await generateReply(REQUEST, { client, persona: "P" });
    expect(result?.attempts).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    const retryText = String(create.mock.calls[1]![0].messages.at(-1)!.content);
    expect(retryText).toContain("insult");
    expect(result?.inputTokens).toBe(1600);
  });

  it("после двух неудач возвращает null (клиент ответит заготовкой)", async () => {
    const { client, create } = fakeClient(reply("не json"), reply({ ...GOOD, emotion: "happy" }));
    expect(await generateReply(REQUEST, { client, persona: "P" })).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("отказ модели (refusal) — null без повторов", async () => {
    const refusal = reply(GOOD);
    refusal.stop_reason = "refusal";
    const { client, create } = fakeClient(refusal);
    expect(await generateReply(REQUEST, { client, persona: "P" })).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
