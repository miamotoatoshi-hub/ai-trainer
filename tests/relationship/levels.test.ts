import { describe, expect, it } from "vitest";
import {
  levelFromScore,
  levelProgress,
  nextLevel,
  pointsToNextLevel,
  workoutsToNextLevel,
} from "@/lib/relationship/levels";
import { levelHint } from "@/lib/relationship/hint";

describe("уровни отношения", () => {
  it.each([
    [0, "despises"],
    [24, "despises"],
    [25, "tolerates"],
    [49, "tolerates"],
    [50, "respects"],
    [79, "respects"],
    [80, "proud"],
    [100, "proud"],
  ] as const)("очки %i → %s", (score, level) => {
    expect(levelFromScore(score)).toBe(level);
  });

  it("следующий уровень и очки до него", () => {
    expect(nextLevel("despises")).toBe("tolerates");
    expect(nextLevel("proud")).toBeNull();
    expect(pointsToNextLevel(8, "despises")).toBe(17);
    expect(pointsToNextLevel(90, "proud")).toBeNull();
  });

  it("заполнение сегмента шкалы", () => {
    expect(levelProgress(0, "despises")).toBe(0);
    expect(levelProgress(25, "tolerates")).toBe(0);
    expect(levelProgress(37, "tolerates")).toBeCloseTo(12 / 25);
    expect(levelProgress(100, "proud")).toBe(1);
    // «буфер» понижения: очки ниже границы показанного уровня — сегмент пуст, а не отрицательный
    expect(levelProgress(23, "tolerates")).toBe(0);
  });

  it("сколько тренировок до следующего уровня", () => {
    expect(workoutsToNextLevel(8, "despises")).toBe(3);
    expect(workoutsToNextLevel(24, "despises")).toBe(1);
    expect(workoutsToNextLevel(100, "proud")).toBeNull();
  });
});

describe("подсказка под шкалой", () => {
  it("совпадает с примером из ТЗ", () => {
    expect(levelHint({ level: "despises", score: 8, ignoring: false, gender: "m" })).toBe(
      "Ещё 3 тренировки без пропусков — и он начнёт тебя терпеть",
    );
  });

  it("учитывает род тренера и склонение", () => {
    expect(levelHint({ level: "despises", score: 20, ignoring: false, gender: "f" })).toBe(
      "Ещё 1 тренировка без пропусков — и она начнёт тебя терпеть",
    );
    expect(levelHint({ level: "tolerates", score: 30, ignoring: false, gender: "m" })).toContain(
      "уважать",
    );
    expect(levelHint({ level: "respects", score: 55, ignoring: false, gender: "m" })).toContain(
      "гордиться",
    );
  });

  it("при игноре говорит, как его снять; на максимуме — просит не расслабляться", () => {
    expect(levelHint({ level: "tolerates", score: 30, ignoring: true, gender: "m" })).toContain(
      "Игнор снимается только делом",
    );
    expect(levelHint({ level: "proud", score: 95, ignoring: false, gender: "f" })).toContain(
      "она всё помнит",
    );
  });
});
