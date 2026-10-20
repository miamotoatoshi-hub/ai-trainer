import { describe, expect, it } from "vitest";
import { RELATIONSHIP_CONFIG } from "@/lib/relationship/config";
import {
  applyEvents,
  clampScore,
  daysToCharge,
  decayEvents,
  eventsForWorkout,
  resolveLevel,
} from "@/lib/relationship/engine";
import { looksLikeApology } from "@/lib/relationship/apology";

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h, 0).getTime();
const base = {
  status: "done",
  cleanRatio: 0.5,
  personalRecord: false,
  onTime: false,
  streakDays: 1,
} as const;

describe("таблица очков из ТЗ", () => {
  it("стартовые значения", () => {
    expect(RELATIONSHIP_CONFIG.deltas).toMatchObject({
      workoutCompleted: 6,
      cleanBonus: 3,
      personalRecord: 2,
      onTime: 1,
      streak7: 5,
      workoutAbandoned: -3,
      missedWorkout: -8,
      dayWithoutWorkout: -2,
      apology: 0,
    });
    expect(RELATIONSHIP_CONFIG.maxGainPerDay).toBe(15);
    expect(RELATIONSHIP_CONFIG.demotionBuffer).toBe(3);
  });

  it("обычная тренировка даёт +6", () => {
    expect(eventsForWorkout(base)).toEqual([{ type: "workout_completed", raw: 6 }]);
  });

  it("≥ 80% чистых — ещё +3 (граница включена, 79% — нет)", () => {
    expect(eventsForWorkout({ ...base, cleanRatio: 0.8 }).map((e) => e.type)).toContain(
      "clean_bonus",
    );
    expect(eventsForWorkout({ ...base, cleanRatio: 0.79 }).map((e) => e.type)).not.toContain(
      "clean_bonus",
    );
  });

  it("рекорд +2, вовремя +1, серия 7 дней +5 — только ровно на 7-й день", () => {
    const all = eventsForWorkout({
      ...base,
      cleanRatio: 1,
      personalRecord: true,
      onTime: true,
      streakDays: 7,
    });
    expect(all.map((e) => `${e.type}:${e.raw}`)).toEqual([
      "workout_completed:6",
      "clean_bonus:3",
      "personal_record:2",
      "on_time:1",
      "streak_7:5",
    ]);
    expect(eventsForWorkout({ ...base, streakDays: 6 }).map((e) => e.type)).not.toContain(
      "streak_7",
    );
    expect(eventsForWorkout({ ...base, streakDays: 8 }).map((e) => e.type)).not.toContain(
      "streak_7",
    );
  });

  it("брошенная тренировка — только −3, без бонусов", () => {
    expect(
      eventsForWorkout({ ...base, status: "abandoned", cleanRatio: 1, personalRecord: true }),
    ).toEqual([{ type: "workout_abandoned", raw: -3 }]);
  });

  it("извинения в чате: 0 очков", () => {
    expect(RELATIONSHIP_CONFIG.deltas.apology).toBe(0);
    expect(looksLikeApology("Прости, завтра точно приду")).toBe(true);
    expect(looksLikeApology("извини, был занят")).toBe(true);
    expect(looksLikeApology("Привет, как дела?")).toBe(false);
  });
});

describe("применение событий", () => {
  it("складывает очки и пересчитывает уровень", () => {
    const r = applyEvents(
      { score: 8, level: "despises" },
      eventsForWorkout({ ...base, cleanRatio: 0.9 }),
      0,
    );
    expect(r.state).toEqual({ score: 17, level: "despises" });
    expect(r.applied.map((e) => e.delta)).toEqual([6, 3]);
    expect(r.capped).toBe(false);
    expect(r.levelUp).toBe(false);
  });

  it("повышение уровня — сразу", () => {
    const r = applyEvents({ score: 22, level: "despises" }, eventsForWorkout(base), 0);
    expect(r.state).toEqual({ score: 28, level: "tolerates" });
    expect(r.levelUp).toBe(true);
  });

  it("потолок +15 в сутки: лишнее обрезается и это видно в результате", () => {
    const events = eventsForWorkout({
      ...base,
      cleanRatio: 1,
      personalRecord: true,
      onTime: true,
      streakDays: 7,
    });
    // всего 17 очков, а за сутки уже набрано 10 → осталось место на 5
    const r = applyEvents({ score: 30, level: "tolerates" }, events, 10);
    expect(r.state.score).toBe(35);
    expect(r.applied.map((e) => e.delta)).toEqual([5, 0, 0, 0, 0]);
    expect(r.capped).toBe(true);
    expect(r.gainedToday).toBe(15);
  });

  it("за сутки не больше +15 даже при нескольких тренировках подряд", () => {
    let state = { score: 0, level: "despises" as const };
    let gained = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = applyEvents(
        state,
        eventsForWorkout({ ...base, cleanRatio: 1, onTime: true }),
        gained,
      );
      state = { score: r.state.score, level: r.state.level as "despises" };
      gained = r.gainedToday;
    }
    expect(gained).toBe(15);
    expect(state.score).toBe(15);
  });

  it("штрафы потолком не ограничиваются, очки не уходят ниже 0 и выше 100", () => {
    const r = applyEvents(
      { score: 3, level: "despises" },
      [{ type: "missed_workout", raw: -8 }],
      15,
    );
    expect(r.state.score).toBe(0);
    expect(r.applied[0]?.delta).toBe(-3);

    const top = applyEvents(
      { score: 98, level: "proud" },
      eventsForWorkout({ ...base, cleanRatio: 1 }),
      0,
    );
    expect(top.state.score).toBe(100);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
  });

  it("пропуск плановой −8, брошенная −3, штрафы идут по порядку", () => {
    const r = applyEvents(
      { score: 40, level: "tolerates" },
      [
        { type: "missed_workout", raw: -8 },
        { type: "workout_abandoned", raw: -3 },
      ],
      0,
    );
    expect(r.state.score).toBe(29);
  });
});

describe("буфер понижения уровня (3 очка)", () => {
  it("вниз уровень падает не сразу", () => {
    expect(resolveLevel("tolerates", 25)).toBe("tolerates");
    expect(resolveLevel("tolerates", 24)).toBe("tolerates");
    expect(resolveLevel("tolerates", 22)).toBe("tolerates");
    expect(resolveLevel("tolerates", 21)).toBe("despises");
  });

  it("то же на других границах", () => {
    expect(resolveLevel("respects", 47)).toBe("respects");
    expect(resolveLevel("respects", 46)).toBe("tolerates");
    expect(resolveLevel("proud", 77)).toBe("proud");
    expect(resolveLevel("proud", 76)).toBe("respects");
  });

  it("вверх — без буфера; при сильном падении перепрыгивает несколько уровней", () => {
    expect(resolveLevel("despises", 25)).toBe("tolerates");
    expect(resolveLevel("tolerates", 80)).toBe("proud");
    expect(resolveLevel("respects", 10)).toBe("despises");
  });

  it("уровень «дёргается» туда-сюда меньше: колебание вокруг границы не меняет уровень", () => {
    let level = resolveLevel("despises", 26); // tolerates
    for (const score of [24, 26, 23, 25, 22, 27]) level = resolveLevel(level, score);
    expect(level).toBe("tolerates");
  });

  it("applyEvents сообщает о понижении", () => {
    const r = applyEvents(
      { score: 22, level: "tolerates" },
      [{ type: "missed_workout", raw: -8 }],
      0,
    );
    expect(r.state).toEqual({ score: 14, level: "despises" });
    expect(r.levelDown).toBe(true);
  });
});

describe("штраф «день без тренировки»", () => {
  it("первый день без тренировки — льгота, штраф со второго", () => {
    const last = at(10, 15);
    expect(daysToCharge(last, null, at(10, 15, 20))).toEqual([]);
    expect(daysToCharge(last, null, at(10, 16, 20))).toEqual([]);
    expect(daysToCharge(last, null, at(10, 17, 8))).toEqual(["2026-10-17"]);
    expect(daysToCharge(last, null, at(10, 18, 8))).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("не начисляет дважды за один день", () => {
    const last = at(10, 15);
    expect(daysToCharge(last, "2026-10-17", at(10, 18, 8))).toEqual(["2026-10-18"]);
    expect(daysToCharge(last, "2026-10-18", at(10, 18, 23))).toEqual([]);
  });

  it("каждый день по −2", () => {
    const events = decayEvents(["2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(events.map((e) => e.raw)).toEqual([-2, -2, -2]);
    const r = applyEvents({ score: 30, level: "tolerates" }, events, 0);
    expect(r.state.score).toBe(24);
  });

  it("за месяц отсутствия очки доходят до нуля и там остаются", () => {
    const days = daysToCharge(at(9, 1), null, at(10, 1));
    const r = applyEvents({ score: 60, level: "respects" }, decayEvents(days), 0);
    expect(r.state.score).toBe(2);
    const more = applyEvents(r.state, decayEvents(["2026-10-02", "2026-10-03"]), 0);
    expect(more.state.score).toBe(0);
  });
});
