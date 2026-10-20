import { describe, expect, it } from "vitest";
import {
  DAY,
  MINUTE,
  atClock,
  dayKey,
  daysBetween,
  formatClock,
  formatDuration,
  isQuietHour,
  parseClock,
  startOfDay,
} from "@/lib/time";

// Все даты — по локальному времени, поэтому строим их через конструктор Date(год, месяц, ...).
const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

describe("время", () => {
  it("dayKey даёт локальный день", () => {
    expect(dayKey(at(2026, 10, 20, 23, 59))).toBe("2026-10-20");
    expect(dayKey(at(2026, 1, 5, 0, 1))).toBe("2026-01-05");
  });

  it("parseClock разбирает HH:MM и терпит мусор", () => {
    expect(parseClock("18:30")).toBe(18 * 60 + 30);
    expect(parseClock("7:05")).toBe(7 * 60 + 5);
    expect(parseClock("абв")).toBe(0);
    expect(parseClock("99:99")).toBe(23 * 60 + 59);
  });

  it("daysBetween считает календарные дни, а не 24-часовые отрезки", () => {
    expect(daysBetween(at(2026, 10, 20, 23, 50), at(2026, 10, 21, 0, 10))).toBe(1);
    expect(daysBetween(at(2026, 10, 20, 8), at(2026, 10, 20, 22))).toBe(0);
    expect(daysBetween(at(2026, 10, 18, 12), at(2026, 10, 21, 1))).toBe(3);
  });

  it("atClock ставит время на нужный день", () => {
    const ts = at(2026, 10, 20, 9, 15);
    expect(formatClock(atClock(ts, "18:00"))).toBe("18:00");
    expect(dayKey(atClock(ts, "18:00"))).toBe("2026-10-20");
    expect(startOfDay(atClock(ts, "18:00"))).toBe(startOfDay(ts));
  });

  it("тихие часы работают и через полночь", () => {
    expect(isQuietHour(at(2026, 10, 20, 23, 0), "22:00", "08:00")).toBe(true);
    expect(isQuietHour(at(2026, 10, 20, 3, 0), "22:00", "08:00")).toBe(true);
    expect(isQuietHour(at(2026, 10, 20, 8, 0), "22:00", "08:00")).toBe(false);
    expect(isQuietHour(at(2026, 10, 20, 15, 0), "22:00", "08:00")).toBe(false);
    expect(isQuietHour(at(2026, 10, 20, 12, 0), "13:00", "14:00")).toBe(false);
    expect(isQuietHour(at(2026, 10, 20, 13, 30), "13:00", "14:00")).toBe(true);
    expect(isQuietHour(at(2026, 10, 20, 3, 0), "00:00", "00:00")).toBe(false);
  });

  it("formatDuration", () => {
    expect(formatDuration(14)).toBe("0:14");
    expect(formatDuration(125)).toBe("2:05");
    expect(formatDuration(-3)).toBe("0:00");
  });

  it("константы согласованы", () => {
    expect(DAY).toBe(24 * 60 * MINUTE);
  });
});
