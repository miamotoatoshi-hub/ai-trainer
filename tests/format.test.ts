import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatDayLabel,
  formatHeroLabel,
  formatListTime,
  formatMinutes,
  formatWhen,
  nextScheduleSlot,
} from "@/lib/format";

const at = (m: number, d: number, h = 12, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();
const NOW = at(10, 20, 12); // вторник

describe("подписи времени", () => {
  it("время в списке чатов", () => {
    expect(formatListTime(at(10, 20, 7, 12), NOW)).toBe("07:12");
    expect(formatListTime(at(10, 19, 22), NOW)).toBe("Вчера");
    expect(formatListTime(at(10, 17, 9), NOW)).toBe("Сб");
    expect(formatListTime(at(10, 12, 9), NOW)).toBe("12 окт.");
  });

  it("плашки дат в переписке", () => {
    expect(formatDayLabel(at(10, 20, 7), NOW)).toBe("Сегодня");
    expect(formatDayLabel(at(10, 19, 7), NOW)).toBe("Вчера");
    expect(formatDayLabel(at(10, 12, 7), NOW)).toBe("12 октября");
  });

  it("подпись карточки-героя", () => {
    expect(formatHeroLabel(at(10, 20, 18), NOW)).toBe("СЕГОДНЯ · 18:00");
    expect(formatHeroLabel(at(10, 21, 18), NOW)).toBe("ЗАВТРА · 18:00");
    expect(formatHeroLabel(at(10, 23, 18), NOW)).toBe("ПТ · 18:00");
  });

  it("когда тренировка", () => {
    expect(formatWhen(at(10, 20, 18), NOW)).toBe("Сегодня, 18:00");
    expect(formatWhen(at(10, 21, 18), NOW)).toBe("Завтра, 18:00");
    expect(formatWhen(at(10, 23, 18), NOW)).toBe("Пятница, 18:00");
  });

  it("минуты и «сколько назад»", () => {
    expect(formatMinutes(20)).toBe("20 минут");
    expect(formatMinutes(1)).toBe("1 минута");
    expect(formatAgo(NOW - 3 * 3_600_000, NOW)).toBe("3 часа назад");
    expect(formatAgo(NOW - 15 * 60_000, NOW)).toBe("15 минут назад");
    expect(formatAgo(NOW - 50 * 3_600_000, NOW)).toBe("2 дня назад");
  });

  it("следующее время тренировки по расписанию", () => {
    // вторник 12:00, расписание Пн/Ср/Пт в 18:00 → среда 18:00
    expect(nextScheduleSlot(NOW, [1, 3, 5], "18:00")).toBe(at(10, 21, 18));
    // вторник, расписание включает вторник и время ещё впереди → сегодня
    expect(nextScheduleSlot(NOW, [2], "18:00")).toBe(at(10, 20, 18));
    // вторник 19:00 при тренировках по вторникам в 18:00 → через неделю
    expect(nextScheduleSlot(at(10, 20, 19), [2], "18:00")).toBe(at(10, 27, 18));
    expect(nextScheduleSlot(NOW, [], "18:00")).toBeNull();
  });
});
