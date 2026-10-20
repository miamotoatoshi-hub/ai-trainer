import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetUsageForTests } from "@/lib/server/usage";

const generate = vi.fn();
vi.mock("@/lib/server/chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/chat")>();
  return {
    ...original,
    generateReply: (...args: unknown[]) => generate(...args),
    loadPersona: async () => "# персона",
    createChatClient: () => ({ messages: { create: vi.fn() } }),
  };
});

import { POST } from "@/app/api/chat/route";

const BODY = {
  anonId: "anon-route",
  coachId: "gromov",
  harshness: 2,
  ageBand: "18+",
  userName: "",
  goal: null,
  level: "despises",
  score: 0,
  memory: [],
  history: [],
  message: "что по плану?",
  context: {
    nowLabel: "вторник",
    streak: 0,
    workoutsTotal: 0,
    lastWorkoutAgo: null,
    nextWorkout: null,
    missedToday: false,
  },
};

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }),
  );
}

const GOOD_RESULT = {
  reply: { messages: ["Ждите."], emotion: "neutral", action: "none", safety: "none", memory: [] },
  inputTokens: 1000,
  outputTokens: 50,
  attempts: 1,
};

beforeEach(() => {
  resetUsageForTests();
  generate.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/chat", () => {
  it("без ключа отвечает ok:false/no_key и не вызывает нейросеть", async () => {
    const res = await call(BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "no_key" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("с ключом возвращает ответ нейросети", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generate.mockResolvedValue(GOOD_RESULT);
    const json = await (await call(BODY)).json();
    expect(json.ok).toBe(true);
    expect(json.reply.messages).toEqual(["Ждите."]);
  });

  it("лимит 60 сообщений в день на пользователя: дальше reason=limit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generate.mockResolvedValue(GOOD_RESULT);
    for (let i = 0; i < 60; i += 1) expect((await (await call(BODY)).json()).ok).toBe(true);
    expect(await (await call(BODY)).json()).toEqual({ ok: false, reason: "limit" });
    expect(generate).toHaveBeenCalledTimes(60);
    // другой пользователь лимит не потратил
    expect((await (await call({ ...BODY, anonId: "other" })).json()).ok).toBe(true);
  });

  it("сообщения про боль и кризис нейросети не отдаются", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const res = await call({ ...BODY, message: "у меня болит колено" });
    expect(await res.json()).toEqual({ ok: false, reason: "safety" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("ошибка нейросети — ok:false/error, а не падение", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generate.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await (await call(BODY)).json()).toEqual({ ok: false, reason: "error" });
    spy.mockRestore();
  });

  it("битый запрос — 400", async () => {
    const res = await call({ nope: true });
    expect(res.status).toBe(400);
  });
});
