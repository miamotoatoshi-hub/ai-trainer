import { describe, expect, it } from "vitest";
import {
  allowedHarshness,
  answeredCount,
  applyAnswer,
  checkName,
  nextStep,
  sanitizeDays,
  STEP_ORDER,
  toProfilePatch,
  type Draft,
} from "@/lib/onboarding/anketa";

describe("имя", () => {
  it.each([
    ["Алекс", "Алекс"],
    ["  Анна-Мария  ", "Анна-Мария"],
    ["Max 2", "Max 2"],
    ["Иван   Петров", "Иван Петров"],
  ])("%j → %j", (raw, expected) => {
    expect(checkName(raw)).toEqual({ ok: true, name: expected });
  });

  it.each([
    "",
    "   ",
    "а".repeat(25),
    "<script>",
    "тест@почта.ру",
    "+7 999 123",
    "Ты толстый",
    "блять",
  ])("%j отклоняется", (raw) => {
    expect(checkName(raw).ok).toBe(false);
  });
});

describe("жёсткость и возраст", () => {
  it("«Без пощады» только с 18 лет; пока возраст неизвестен — тоже нет", () => {
    expect(allowedHarshness("18+")).toEqual([1, 2, 3]);
    expect(allowedHarshness("16-17")).toEqual([1, 2]);
    expect(allowedHarshness("13-15")).toEqual([1, 2]);
    expect(allowedHarshness(undefined)).toEqual([1, 2]);
  });

  it("нельзя выбрать жёсткость 3 несовершеннолетнему", () => {
    let draft: Draft = applyAnswer({}, "age", "16-17");
    draft = applyAnswer(draft, "harshness", 3);
    expect(draft.harshness).toBeUndefined();
    draft = applyAnswer(draft, "harshness", 2);
    expect(draft.harshness).toBe(2);
  });

  it("смена возраста понижает уже выбранную жёсткость", () => {
    let draft: Draft = applyAnswer({}, "age", "18+");
    draft = applyAnswer(draft, "harshness", 3);
    expect(draft.harshness).toBe(3);
    draft = applyAnswer(draft, "age", "13-15");
    expect(draft.harshness).toBe(2);
  });
});

describe("дни и время", () => {
  it("дни чистятся и идут с понедельника", () => {
    expect(sanitizeDays([0, 5, 1, 1, 9, -1, 3.5])).toEqual([1, 5, 0]);
  });

  it("пустой выбор дней не принимается, неверное время тоже", () => {
    expect(applyAnswer({}, "days", []).scheduleDays).toBeUndefined();
    expect(applyAnswer({}, "time", "25:00").scheduleTime).toBeUndefined();
    expect(applyAnswer({}, "time", "18:30").scheduleTime).toBe("18:30");
  });
});

describe("порядок вопросов и итог", () => {
  it("идёт по порядку и заканчивается null", () => {
    let draft: Draft = {};
    const seen: string[] = [];
    const answers: Record<string, unknown> = {
      name: "Алекс",
      age: "16-17",
      goal: "strength",
      minutes: 20,
      days: [1, 3, 5],
      time: "18:00",
      harshness: 2,
      coaches: true,
      notifications: "later",
    };
    for (let guard = 0; guard < 20; guard += 1) {
      const step = nextStep(draft);
      if (!step) break;
      seen.push(step);
      draft = applyAnswer(draft, step, answers[step]);
    }
    expect(seen).toEqual([...STEP_ORDER]);
    expect(nextStep(draft)).toBeNull();
    expect(answeredCount(draft)).toBe(STEP_ORDER.length);
  });

  it("неверный ответ не продвигает анкету", () => {
    const draft = applyAnswer({}, "name", "<b>");
    expect(nextStep(draft)).toBe("name");
  });

  it("в профиль попадают только заполненные поля", () => {
    const draft: Draft = { name: "Алекс", ageBand: "18+", harshness: 3, minutesPerDay: 15 };
    expect(toProfilePatch(draft)).toEqual({
      name: "Алекс",
      ageBand: "18+",
      harshness: 3,
      minutesPerDay: 15,
    });
  });
});
