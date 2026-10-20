import { describe, expect, it } from "vitest";
import { computeStreak } from "@/lib/game/streak";

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h, 0).getTime();

describe("серия дней", () => {
  const now = at(10, 20, 10);

  it("пустая история — серии нет", () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it("считает подряд идущие дни, включая сегодня", () => {
    expect(computeStreak([at(10, 20, 8), at(10, 19), at(10, 18)], now)).toBe(3);
  });

  it("серия жива, если последняя тренировка вчера", () => {
    expect(computeStreak([at(10, 19), at(10, 18), at(10, 17)], now)).toBe(3);
  });

  it("серия обрывается, если позавчера был последний день", () => {
    expect(computeStreak([at(10, 18), at(10, 17)], now)).toBe(0);
  });

  it("пропуск посередине ограничивает серию", () => {
    expect(computeStreak([at(10, 20), at(10, 19), at(10, 17), at(10, 16)], now)).toBe(2);
  });

  it("несколько тренировок за день считаются одним днём", () => {
    expect(computeStreak([at(10, 20, 7), at(10, 20, 9), at(10, 19, 8), at(10, 19, 20)], now)).toBe(
      2,
    );
  });

  it("переход через конец месяца", () => {
    expect(computeStreak([at(11, 1), at(10, 31), at(10, 30)], at(11, 1, 20))).toBe(3);
  });
});
