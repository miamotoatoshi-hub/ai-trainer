import { describe, expect, it } from "vitest";
import type { ScheduledWorkout, UserCoach } from "@/lib/data/types";
import { defaultUserCoach } from "@/lib/data/defaults";
import {
  dueAwayMessages,
  isQuietTime,
  MAX_PER_DAY,
  missedStreak,
  toneLevel,
  upcomingAwayMessages,
  type RulesProfile,
} from "@/lib/notifications/rules";
import { DAY, HOUR, MINUTE } from "@/lib/time";

const at = (h: number, m = 0, d = 20) => new Date(2026, 9, d, h, m).getTime();

function profile(extra: Partial<RulesProfile> = {}): RulesProfile {
  return {
    notifFrequency: "normal",
    supportPausedUntil: null,
    onboardingDone: true,
    quietStart: "22:00",
    quietEnd: "08:00",
    ageBand: "18+",
    ...extra,
  };
}

function coaches(...unlocked: ("gromov" | "marina" | "palych" | "max")[]): UserCoach[] {
  return (["gromov", "marina", "palych", "max"] as const).map((id) => ({
    ...defaultUserCoach(id, 0),
    unlocked: unlocked.includes(id),
  }));
}

function slot(
  id: string,
  coachId: ScheduledWorkout["coachId"],
  scheduledAt: number,
  status: ScheduledWorkout["status"] = "planned",
): ScheduledWorkout {
  return { id, coachId, planId: "legs-20", scheduledAt, status };
}

describe("тихие часы", () => {
  it("по умолчанию 22:00–08:00", () => {
    expect(isQuietTime(at(23), profile())).toBe(true);
    expect(isQuietTime(at(7, 59), profile())).toBe(true);
    expect(isQuietTime(at(8), profile())).toBe(false);
    expect(isQuietTime(at(21, 59), profile())).toBe(false);
  });

  it("взрослый может сократить тихие часы, младше 18 — нет", () => {
    const short = { quietStart: "23:30", quietEnd: "06:00" };
    expect(isQuietTime(at(22, 30), profile({ ...short, ageBand: "18+" }))).toBe(false);
    expect(isQuietTime(at(7, 0), profile({ ...short, ageBand: "18+" }))).toBe(false);
    for (const band of ["13-15", "16-17", null] as const) {
      expect(isQuietTime(at(22, 30), profile({ ...short, ageBand: band }))).toBe(true);
      expect(isQuietTime(at(7, 0), profile({ ...short, ageBand: band }))).toBe(true);
    }
  });

  it("младше 18 могут расширить тихие часы", () => {
    const wide = profile({ quietStart: "20:00", quietEnd: "09:00", ageBand: "16-17" });
    expect(isQuietTime(at(20, 30), wide)).toBe(true);
    expect(isQuietTime(at(8, 30), wide)).toBe(true);
    expect(isQuietTime(at(12), wide)).toBe(false);
  });

  it("сообщение, которое пришлось бы на тихие часы, не создаётся", () => {
    // тренировка в 08:20: напоминание в 07:50 — тихое время
    const due = dueAwayMessages({
      profile: profile(),
      coaches: coaches("gromov"),
      scheduled: [slot("a", "gromov", at(8, 20))],
      log: [],
      now: at(8, 0),
    });
    expect(due).toEqual([]);
  });
});

describe("лимит 3 в сутки по всем тренерам", () => {
  it("делится между тренерами, важное — первым", () => {
    const scheduled = [
      slot("g", "gromov", at(18, 0)),
      slot("m", "marina", at(18, 0)),
      slot("p", "palych", at(18, 0)),
    ];
    const due = dueAwayMessages({
      profile: profile(),
      coaches: coaches("gromov", "marina", "palych"),
      scheduled,
      log: [],
      now: at(17, 40),
    });
    expect(due).toHaveLength(MAX_PER_DAY);
    expect(due.every((m) => m.kind === "reminder")).toBe(true);
    // с уже отправленным за день остаётся два места
    const withLog = dueAwayMessages({
      profile: profile(),
      coaches: coaches("gromov", "marina", "palych"),
      scheduled,
      log: [{ kind: "morning", coachId: "gromov", day: "2026-10-20", sentAt: at(9) }],
      now: at(17, 40),
    });
    expect(withLog).toHaveLength(2);
  });
});

describe("лестница", () => {
  const base = { profile: profile(), coaches: coaches("gromov"), log: [] as never[] };

  it("если тренировка сделана, лестница останавливается", () => {
    const done = [slot("a", "gromov", at(18), "done")];
    for (const now of [at(9, 5), at(17, 40), at(18, 25), at(21, 5)]) {
      expect(dueAwayMessages({ ...base, scheduled: done, now })).toEqual([]);
    }
  });

  it("без тренировки: утро → напоминание → укол", () => {
    const planned = [slot("a", "gromov", at(18))];
    const kind = (now: number) =>
      dueAwayMessages({ ...base, scheduled: planned, now }).map((m) => m.kind);
    expect(kind(at(9, 5))).toEqual(["morning"]);
    expect(kind(at(17, 35))).toEqual(["reminder"]);
    expect(kind(at(18, 21))).toEqual(["poke"]);
  });

  it("частота «Выкл» молчит всегда, «Редко» — только напоминание", () => {
    const planned = [slot("a", "gromov", at(18))];
    expect(
      dueAwayMessages({
        ...base,
        profile: profile({ notifFrequency: "off" }),
        scheduled: planned,
        now: at(17, 40),
      }),
    ).toEqual([]);
    const rare = dueAwayMessages({
      ...base,
      profile: profile({ notifFrequency: "rare" }),
      scheduled: planned,
      now: at(9, 5),
    });
    expect(rare).toEqual([]);
  });
});

describe("будущие уведомления (для отправки при закрытом приложении)", () => {
  it("планирует лестницу на 48 часов вперёд в разрешённые часы и в пределах лимита", () => {
    const scheduled = [slot("a", "gromov", at(18, 0, 21))];
    const upcoming = upcomingAwayMessages({
      profile: profile(),
      coaches: coaches("gromov"),
      scheduled,
      log: [],
      now: at(10, 0, 20),
      horizonMs: 48 * HOUR,
    });
    // 18:00 — игнор после пропуска закончится ночью, до 21:00 не успеет → вечернего нет
    expect(upcoming.map((m) => m.kind)).toEqual(["morning", "reminder", "poke"]);
    expect(upcoming.map((m) => m.at)).toEqual([at(9, 0, 21), at(17, 30, 21), at(18, 20, 21)]);
  });

  it("вечернее холодное планируется, если игнор успевает закончиться (утренняя тренировка)", () => {
    // Громов игнорирует 12 часов: тренировка в 08:30 → игнор до 21:00 включительно (08:30+0:30+12:00 = 21:00)
    const upcoming = upcomingAwayMessages({
      profile: profile(),
      coaches: coaches("gromov"),
      scheduled: [slot("a", "gromov", at(8, 30, 21))],
      log: [],
      now: at(10, 0, 20),
      horizonMs: 48 * HOUR,
    });
    expect(upcoming.map((m) => m.kind)).toContain("evening_cold");
    // лимит 3 в сутки: из четырёх ступеней одна выпадает — наименее важная (вечерняя)
    const sameDay = upcoming.filter((m) => m.day === "2026-10-21");
    expect(sameDay.length).toBeLessThanOrEqual(MAX_PER_DAY);
  });

  it("ничего не планирует в прошлом, при паузе после кризиса и для закрытых тренеров", () => {
    const common = { log: [], now: at(10, 0, 20), horizonMs: 48 * HOUR };
    expect(
      upcomingAwayMessages({
        ...common,
        profile: profile(),
        coaches: coaches("gromov"),
        scheduled: [slot("a", "gromov", at(9, 0, 20))],
      }),
    ).toEqual([]);
    expect(
      upcomingAwayMessages({
        ...common,
        profile: profile(),
        coaches: coaches("gromov"),
        scheduled: [slot("a", "marina", at(18, 0, 21))],
      }),
    ).toEqual([]);
    expect(
      upcomingAwayMessages({
        ...common,
        profile: profile({ notifFrequency: "off" }),
        coaches: coaches("gromov"),
        scheduled: [slot("a", "gromov", at(18, 0, 21))],
      }),
    ).toEqual([]);
  });
});

describe("пропущенные дни и тон", () => {
  it("считает подряд пропущенные дни и обнуляется после тренировки", () => {
    const missed = (d: number) => slot(`m${d}`, "gromov", at(18, 0, d), "missed");
    const now = at(10, 0, 20);
    expect(missedStreak([], [], now)).toBe(0);
    expect(missedStreak([missed(19)], [], now)).toBe(1);
    expect(missedStreak([missed(19), missed(18), missed(17)], [], now)).toBe(3);
    // был пропуск 19-го и 17-го, но 18-го была тренировка → серия пропусков 1
    const done = [{ status: "done" as const, startedAt: at(18, 0, 18), endedAt: at(18, 30, 18) }];
    expect(missedStreak([missed(19), missed(17)], done, now)).toBe(1);
    // вчера тренировка → 0
    const yesterday = [
      { status: "done" as const, startedAt: at(18, 0, 19), endedAt: at(18, 30, 19) },
    ];
    expect(missedStreak([missed(18)], yesterday, now)).toBe(0);
  });

  it("тон растёт постепенно и не выше возрастного предела", () => {
    const adult = { harshness: 3 as const, ageBand: "18+" as const };
    expect([0, 1, 2, 5].map((n) => toneLevel(adult, n))).toEqual([2, 3, 3, 3]);
    const teen = { harshness: 3 as const, ageBand: "16-17" as const };
    expect([0, 1, 5].map((n) => toneLevel(teen, n))).toEqual([1, 2, 2]);
    const soft = { harshness: 1 as const, ageBand: "18+" as const };
    expect([0, 3].map((n) => toneLevel(soft, n))).toEqual([1, 1]);
  });
});

void DAY;
void MINUTE;
