import { describe, expect, it } from "vitest";
import { parseChatRequest, validateChatReply } from "@/lib/chat/schema";

const GOOD_REQUEST = {
  anonId: "anon-1",
  coachId: "gromov",
  harshness: 2,
  ageBand: "16-17",
  userName: "Алекс",
  goal: "strength",
  level: "tolerates",
  score: 33.4,
  memory: [{ fact: "любит приседания", kind: "fact" }],
  history: [
    { role: "user", text: "привет" },
    { role: "coach", text: "Слушаю." },
  ],
  message: "  что по плану?  ",
  context: {
    nowLabel: "вторник",
    streak: 2,
    workoutsTotal: 5,
    lastWorkoutAgo: "вчера",
    nextWorkout: null,
    missedToday: false,
  },
};

describe("parseChatRequest", () => {
  it("принимает нормальный запрос и чистит значения", () => {
    const req = parseChatRequest(GOOD_REQUEST);
    expect(req).not.toBeNull();
    expect(req?.message).toBe("что по плану?");
    expect(req?.score).toBe(33);
    expect(req?.history).toHaveLength(2);
    expect(req?.context.streak).toBe(2);
  });

  it.each([
    ["не объект", null],
    ["нет сообщения", { ...GOOD_REQUEST, message: "   " }],
    ["чужой тренер", { ...GOOD_REQUEST, coachId: "hacker" }],
    ["нет anonId", { ...GOOD_REQUEST, anonId: "" }],
    ["неизвестный уровень", { ...GOOD_REQUEST, level: "king" }],
  ])("отклоняет: %s", (_name, body) => {
    expect(parseChatRequest(body)).toBeNull();
  });

  it("обрезает слишком длинные поля и историю", () => {
    const req = parseChatRequest({
      ...GOOD_REQUEST,
      message: "а".repeat(5000),
      history: Array.from({ length: 50 }, (_, i) => ({ role: "user", text: `м${i}` })),
    });
    expect(req?.message.length).toBe(500);
    expect(req?.history.length).toBe(12);
  });

  it("неизвестную жёсткость заменяет на 2, а мусорные записи памяти отбрасывает", () => {
    const req = parseChatRequest({
      ...GOOD_REQUEST,
      harshness: 9,
      memory: [5, { fact: "" }, { fact: "ок" }],
    });
    expect(req?.harshness).toBe(2);
    expect(req?.memory).toEqual([{ fact: "ок", kind: "fact" }]);
  });
});

const GOOD_REPLY = {
  messages: ["Ниже!", "Колени наружу."],
  emotion: "angry",
  action: "none",
  safety: "none",
  memory: [{ fact: "любит приседания", kind: "fact" }],
};

describe("validateChatReply", () => {
  it("принимает правильный ответ", () => {
    const check = validateChatReply(GOOD_REPLY);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.reply.messages).toEqual(["Ниже!", "Колени наружу."]);
  });

  it("оставляет не больше трёх сообщений и двух записей памяти", () => {
    const check = validateChatReply({
      ...GOOD_REPLY,
      messages: ["раз", "два", "три", "четыре"],
      memory: [
        { fact: "а1", kind: "fact" },
        { fact: "а2", kind: "fact" },
        { fact: "а3", kind: "fact" },
      ],
    });
    expect(check.ok && check.reply.messages).toHaveLength(3);
    expect(check.ok && check.reply.memory).toHaveLength(2);
  });

  it.each([
    ["не объект", "строка"],
    ["плохая эмоция", { ...GOOD_REPLY, emotion: "happy" }],
    ["плохое действие", { ...GOOD_REPLY, action: "teleport" }],
    ["нет safety", { ...GOOD_REPLY, safety: undefined }],
    ["messages не массив", { ...GOOD_REPLY, messages: "привет" }],
    ["пустые сообщения", { ...GOOD_REPLY, messages: ["", "  "] }],
    ["слишком длинное", { ...GOOD_REPLY, messages: ["а".repeat(400)] }],
  ])("отклоняет: %s", (_name, body) => {
    expect(validateChatReply(body).ok).toBe(false);
  });

  it("отклоняет ответ с телесным оскорблением и объясняет причину", () => {
    const check = validateChatReply({
      ...GOOD_REPLY,
      messages: ["Ты толстый, вот и не приседаешь"],
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.why).toContain("insult");
  });
});
