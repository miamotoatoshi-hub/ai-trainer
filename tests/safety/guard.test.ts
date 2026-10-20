import { describe, expect, it } from "vitest";
import { checkCoachReply } from "@/lib/safety/guard";

describe("checkCoachReply — допустимое", () => {
  it.each([
    "Ниже! Колени наружу!",
    "…Неплохо. Не зазнавайся.",
    "Я видел табуретки с лучшей амплитудой.",
    "Опоздаешь — расскажу твоему дивану.",
    "Жидкость в бутылке не считается упражнением.",
    "До свидания. Завтра в 18:00.",
    "Хачапури не обсуждаем.",
    "Рекорд! Это записано.",
  ])("%s", (text) => {
    expect(checkCoachReply(text).ok).toBe(true);
  });
});

describe("checkCoachReply — запрещённое", () => {
  it.each([
    ["Ты толстый, поэтому не приседаешь", "insult"],
    ["Какая ты жирная", "insult"],
    ["Приседаешь как девчонка", "insult"],
    ["Ты тупой, да?", "insult"],
    ["Целую, жду на тренировке", "flirt"],
    ["Ты мне нужен", "flirt"],
    ["Скучаю по тебе", "flirt"],
    ["Ну ты и хуже некуда, хуй", "profanity"],
    ["Блять, опять сорвал", "profanity"],
    ["Сядь на диету и считай калории", "medical"],
    ["Выпей таблетку от боли", "medical"],
    ["Попробуй протеин и креатин", "medical"],
    ["Тебе надо поставить диагноз", "diagnosis"],
    ["", "empty"],
  ] as const)("%s → %s", (text, reason) => {
    const verdict = checkCoachReply(text);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe(reason);
  });
});
