import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendUserMessage, SUPPORT_PAUSE_MS, type RespondDeps } from "@/lib/chat/respond";
import type { ChatOutcome, ChatRequest } from "@/lib/chat/types";
import { SCRIPTED_BANKS } from "@/lib/coach/scripted";
import { DexieRepository } from "@/lib/data/dexieRepository";
import type { CoachId, Message } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import { DAY, HOUR, MINUTE } from "@/lib/time";

const NOW = new Date(2026, 9, 20, 17, 0).getTime();

let repo: DexieRepository;
let counter = 0;
let requests: ChatRequest[];
let pendings: (string | null)[];
let clock: number;

beforeEach(async () => {
  counter += 1;
  clock = NOW;
  requests = [];
  pendings = [];
  repo = new DexieRepository(`pinok-respond-${counter}`);
  await repo.updateProfile({
    name: "Алекс",
    onboardingDone: true,
    ageBand: "18+",
    harshness: 2,
    voiceEnabled: false,
    createdAt: NOW - DAY,
  });
});
afterEach(async () => {
  await repo.destroy();
});

const LLM_OK: ChatOutcome = {
  ok: true,
  source: "llm",
  reply: {
    messages: ["Принято. Жду в 18:00."],
    emotion: "neutral",
    action: "none",
    safety: "none",
    memory: [],
  },
};

function deps(
  outcome: ChatOutcome | (() => ChatOutcome),
  extra: Partial<RespondDeps> = {},
): RespondDeps {
  return {
    repo,
    fetchReply: async (req) => {
      requests.push(req);
      return typeof outcome === "function" ? outcome() : outcome;
    },
    now: () => (clock += 10),
    rng: () => 0.5,
    sleep: async () => undefined,
    onPending: (kind) => pendings.push(kind),
    ...extra,
  };
}

async function feed(coachId: CoachId = "gromov"): Promise<Message[]> {
  return repo.listMessages(coachId);
}

describe("ответ нейросетью", () => {
  it("сохраняет сообщение пользователя и ответ, ставит «прочитано», показывает «печатает»", async () => {
    const result = await sendUserMessage(deps(LLM_OK), "gromov", "привет");
    expect(result?.kind).toBe("llm");
    const messages = await feed();
    expect(messages.map((m) => m.sender)).toEqual(["user", "coach"]);
    expect(messages[0]!.readAt).not.toBeNull();
    expect(messages[1]!.text).toBe("Принято. Жду в 18:00.");
    expect(messages[1]!.meta.source).toBe("llm");
    expect(pendings).toContain("typing");
    expect(pendings[pendings.length - 1]).toBeNull();
  });

  it("в запрос уходят история, имя, уровень и память, но не текущее сообщение дважды", async () => {
    await repo.addMemory({
      coachId: "gromov",
      fact: "любит приседания",
      kind: "fact",
      createdAt: 1,
    });
    await sendUserMessage(deps(LLM_OK), "gromov", "привет");
    await sendUserMessage(deps(LLM_OK), "gromov", "что по плану?");
    const second = requests[1]!;
    expect(second.message).toBe("что по плану?");
    expect(second.userName).toBe("Алекс");
    expect(second.memory).toEqual([{ fact: "любит приседания", kind: "fact" }]);
    expect(second.history.map((h) => h.text)).toEqual(["привет", "Принято. Жду в 18:00."]);
  });

  it("несколько сообщений подряд сохраняются по порядку с растущим временем", async () => {
    await sendUserMessage(
      deps({ ...LLM_OK, reply: { ...LLM_OK.reply, messages: ["Раз.", "Два.", "Три."] } }),
      "gromov",
      "привет",
    );
    const coach = (await feed()).filter((m) => m.sender === "coach");
    expect(coach.map((m) => m.text)).toEqual(["Раз.", "Два.", "Три."]);
    expect(coach[0]!.createdAt).toBeLessThan(coach[1]!.createdAt);
  });

  it("действие propose_workout добавляет карточку тренировки, а эмоция попадает в сообщение", async () => {
    await sendUserMessage(
      deps({ ...LLM_OK, reply: { ...LLM_OK.reply, action: "propose_workout", emotion: "angry" } }),
      "gromov",
      "скучно",
    );
    const messages = await feed();
    expect(messages.at(-1)?.type).toBe("workout_card");
    expect(messages.at(-1)?.meta.planId).toBe("legs-20");
    expect(messages.find((m) => m.sender === "coach" && m.type === "text")?.emotion).toBe("angry");
  });

  it("новые факты из ответа попадают в память", async () => {
    await sendUserMessage(
      deps({
        ...LLM_OK,
        reply: { ...LLM_OK.reply, memory: [{ fact: "по вторникам кружок", kind: "fact" }] },
      }),
      "gromov",
      "по вторникам у меня кружок",
    );
    expect((await repo.listMemory("gromov")).map((m) => m.fact)).toEqual(["по вторникам кружок"]);
  });

  it("пустое сообщение игнорируется", async () => {
    expect(await sendUserMessage(deps(LLM_OK), "gromov", "   ")).toBeNull();
    expect(await feed()).toHaveLength(0);
  });
});

describe("заготовленные ответы вместо нейросети", () => {
  it.each(["no_key", "limit", "error", "offline"] as const)(
    "при %s тренер отвечает репликой из своей базы",
    async (reason) => {
      const result = await sendUserMessage(deps({ ok: false, reason }), "gromov", "привет");
      expect(result?.kind).toBe("scripted");
      expect(result?.failReason).toBe(reason);
      const reply = (await feed()).find((m) => m.sender === "coach")!;
      const bank =
        reason === "limit" ? SCRIPTED_BANKS.gromov.limit : SCRIPTED_BANKS.gromov.greeting;
      expect(bank.map((l) => l.text)).toContain(reply.text);
      expect(reply.meta.source).toBe("scripted");
    },
  );

  it("извинение получает ответ из группы «apology», вопрос про план — карточку тренировки", async () => {
    await sendUserMessage(deps({ ok: false, reason: "no_key" }), "gromov", "прости, был занят");
    const apology = (await feed()).find((m) => m.sender === "coach")!;
    expect(SCRIPTED_BANKS.gromov.apology.map((l) => l.text)).toContain(apology.text);

    await sendUserMessage(deps({ ok: false, reason: "no_key" }), "gromov", "что по плану?");
    expect((await feed()).at(-1)?.type).toBe("workout_card");
  });

  it("жёсткость реплики не выше, чем разрешено по возрасту", async () => {
    await repo.updateProfile({ ageBand: "16-17" });
    await repo.updateProfile({ harshness: 3 });
    expect((await repo.getProfile()).harshness).toBe(2);
  });
});

describe("голосовые в чате", () => {
  it("не чаще, чем один ответ из четырёх, и только короткие", async () => {
    await repo.updateProfile({ voiceEnabled: true });
    const kinds: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await sendUserMessage(deps(LLM_OK), "gromov", `сообщение ${i}`);
      kinds.push((await feed()).filter((m) => m.sender === "coach").at(-1)!.type);
    }
    const voices = kinds.filter((k) => k === "voice").length;
    expect(voices).toBeGreaterThan(0);
    expect(voices).toBeLessThanOrEqual(3);
    // между двумя голосовыми — минимум три текстовых ответа
    const idx = kinds.flatMap((k, i) => (k === "voice" ? [i] : []));
    for (let i = 1; i < idx.length; i += 1) expect(idx[i]! - idx[i - 1]!).toBeGreaterThanOrEqual(4);
  });

  it("голосовое хранит расшифровку и длительность; при выключенном голосе их нет", async () => {
    await repo.updateProfile({ voiceEnabled: true });
    await repo.setMeta("chatVoiceGap:gromov", 3);
    await sendUserMessage(deps(LLM_OK), "gromov", "привет");
    const voice = (await feed()).find((m) => m.type === "voice");
    expect(voice?.meta.transcript).toBe("Принято. Жду в 18:00.");
    expect(voice?.durationSec).toBeGreaterThanOrEqual(2);
    expect(pendings).toContain("recording");

    await repo.updateProfile({ voiceEnabled: false });
    await repo.setMeta("chatVoiceGap:gromov", 3);
    await sendUserMessage(deps(LLM_OK), "gromov", "ещё");
    expect((await feed()).at(-1)?.type).toBe("text");
  });
});

describe("игнор", () => {
  async function startIgnore() {
    const coach = await repo.getUserCoach("gromov");
    await repo.putUserCoach({
      ...coach,
      state: "ignoring",
      ignoreStartedAt: NOW - HOUR,
      ignoringUntil: NOW + 11 * HOUR,
    });
  }

  it("во время игнора тренер читает сообщение, но не отвечает и не обращается к нейросети", async () => {
    await startIgnore();
    const result = await sendUserMessage(deps(LLM_OK), "gromov", "ну прости");
    expect(result?.kind).toBe("ignored");
    expect(requests).toHaveLength(0);
    const messages = await feed();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.readAt).not.toBeNull();
    expect((await repo.getUserCoach("gromov")).coldMessageDueAt).not.toBeNull();
  });

  it("сообщение о боли снимает игнор и получает ответ", async () => {
    await startIgnore();
    const result = await sendUserMessage(deps(LLM_OK), "gromov", "у меня болит колено");
    expect(result?.kind).toBe("safety");
    expect((await repo.getUserCoach("gromov")).state).toBe("normal");
    expect((await feed()).at(-1)?.text).toBe(t("safety.pain"));
  });
});

describe("безопасность", () => {
  it("боль: нейросеть не вызывается, тренер говорит остановиться, ограничение сохраняется в память", async () => {
    const result = await sendUserMessage(deps(LLM_OK), "gromov", "у меня болит колено");
    expect(result).toMatchObject({ kind: "safety", safety: "pain" });
    expect(requests).toHaveLength(0);
    const memory = await repo.listMemory("gromov");
    expect(memory).toHaveLength(1);
    expect(memory[0]!.kind).toBe("limitation");
    expect(memory[0]!.fact).toContain("болит колено");
  });

  it("еда: ответ без калорий и диет и карточка помощи", async () => {
    await sendUserMessage(deps(LLM_OK), "gromov", "я голодаю уже три дня");
    const messages = await feed();
    expect(messages.map((m) => m.type)).toEqual(["text", "text", "support"]);
    expect(messages[1]!.text).toBe(t("safety.eating"));
    expect(requests).toHaveLength(0);
  });

  it("кризис: тёплый ответ, карточка помощи, игнор и «уколы» выключены на неделю", async () => {
    const now = NOW;
    const result = await sendUserMessage(deps(LLM_OK), "gromov", "я не хочу жить");
    expect(result).toMatchObject({ kind: "safety", safety: "crisis" });
    const messages = await feed();
    expect(messages.at(-2)?.text).toBe(t("safety.crisis"));
    expect(messages.at(-1)?.type).toBe("support");
    const profile = await repo.getProfile();
    expect(profile.supportPausedUntil).toBeGreaterThan(now + SUPPORT_PAUSE_MS - MINUTE);
    expect(requests).toHaveLength(0);
  });
});
