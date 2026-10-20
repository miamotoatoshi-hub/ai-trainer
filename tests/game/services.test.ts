import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCRIPTED_BANKS } from "@/lib/coach/scripted";
import { DexieRepository } from "@/lib/data/dexieRepository";
import type { CoachId, ExerciseResult, WorkoutSession } from "@/lib/data/types";
import { runAppOpen } from "@/lib/game/appOpen";
import { finishWorkout } from "@/lib/game/finishWorkout";
import {
  deliverColdMessageIfDue,
  isIgnoring,
  onUserMessageWhileIgnoring,
} from "@/lib/game/ignoring";
import { ensureSchedule, rebuildSchedule, slotsForProfile } from "@/lib/game/schedule";
import { applyUnlocks } from "@/lib/game/unlockService";
import { DAY, HOUR, MINUTE } from "@/lib/time";

// вторник, 20 октября 2026
const at = (m: number, d: number, h = 12, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();
const TODAY = at(10, 20, 10);

let repo: DexieRepository;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  repo = new DexieRepository(`pinok-services-${counter}`);
  await repo.updateProfile({
    name: "Алекс",
    onboardingDone: true,
    ageBand: "18+",
    scheduleDays: [],
    harshness: 2,
    createdAt: TODAY - DAY,
  });
});

afterEach(async () => {
  await repo.destroy();
});

function results(total: number, clean: number): ExerciseResult[] {
  return [
    {
      exerciseId: "squat",
      unit: "reps",
      total,
      clean,
      shallow: 0,
      bestStreak: clean,
      errors: {},
    },
  ];
}

async function newSession(
  coachId: CoachId,
  scheduledId: string | null = null,
): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id: globalThis.crypto.randomUUID(),
    coachId,
    planId: "legs-20",
    mode: "plan",
    startedAt: 0,
    endedAt: null,
    status: "active",
    scheduledId,
    totalReps: 0,
    cleanReps: 0,
    shallowReps: 0,
    bestStreak: 0,
    durationSec: 0,
    results: [],
    personalRecords: [],
    outcome: null,
  };
  await repo.putSession(session);
  return session;
}

async function plan(coachId: CoachId, scheduledAt: number): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  await repo.putScheduled({ id, coachId, planId: "legs-20", scheduledAt, status: "planned" });
  return id;
}

async function setCoach(coachId: CoachId, patch: Record<string, unknown>) {
  const c = await repo.getUserCoach(coachId);
  await repo.putUserCoach({ ...c, ...patch });
}

async function workout(
  coachId: CoachId,
  now: number,
  r: ExerciseResult[],
  status: "done" | "abandoned" = "done",
  scheduledId: string | null = null,
) {
  const session = await newSession(coachId, scheduledId);
  return finishWorkout(repo, {
    session,
    results: r,
    bestSets: { squat: r[0]?.total ?? 0 },
    recordsBeaten: [],
    status,
    durationSec: 600,
    now,
  });
}

describe("расписание", () => {
  it("создаёт слоты на две недели по дням и времени из профиля; планы идут по кругу", async () => {
    await repo.updateProfile({ scheduleDays: [1, 3, 5], scheduleTime: "18:00" });
    const created = await ensureSchedule(repo, TODAY);
    const list = await repo.listScheduled();
    expect(created).toBe(list.length);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((s) => [1, 3, 5].includes(new Date(s.scheduledAt).getDay()))).toBe(true);
    expect(list.every((s) => new Date(s.scheduledAt).getHours() === 18)).toBe(true);
    const byWeekday = Object.fromEntries(
      list.map((s) => [new Date(s.scheduledAt).getDay(), s.planId]),
    );
    expect(byWeekday).toEqual({ 1: "legs-20", 3: "upper-15", 5: "core-10" });
    // повторный вызов ничего не добавляет
    expect(await ensureSchedule(repo, TODAY)).toBe(0);
  });

  it("не создаёт расписание до онбординга и учитывает уже прошедшее время сегодняшнего слота", async () => {
    await repo.updateProfile({ onboardingDone: false, scheduleDays: [2] });
    expect(await ensureSchedule(repo, TODAY)).toBe(0);
    const slots = slotsForProfile({ scheduleDays: [2], scheduleTime: "08:00" }, TODAY);
    expect(slots[0]?.scheduledAt).toBeGreaterThan(TODAY); // 08:00 сегодня давно прошло — берём следующий вторник
  });

  it("пересборка после смены расписания", async () => {
    await repo.updateProfile({ scheduleDays: [1], scheduleTime: "18:00" });
    await ensureSchedule(repo, TODAY);
    await repo.updateProfile({ scheduleDays: [4], scheduleTime: "19:30" });
    await rebuildSchedule(repo, TODAY);
    const list = await repo.listScheduled();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => new Date(s.scheduledAt).getDay() === 4)).toBe(true);
    expect(list.every((s) => new Date(s.scheduledAt).getHours() === 19)).toBe(true);
  });
});

describe("пропуск тренировки и игнор", () => {
  it("пропуск: −8 очков и игнор на 12 часов (у Марины — на 24)", async () => {
    await setCoach("gromov", { score: 20, level: "despises" });
    await setCoach("marina", { score: 30, level: "tolerates", unlocked: true });
    const slot = at(10, 20, 18);
    const g = await plan("gromov", slot);
    const m = await plan("marina", slot);

    const now = slot + 31 * MINUTE;
    const report = await runAppOpen(repo, now);
    expect(report.missed.map((x) => x.scheduledId).sort()).toEqual([g, m].sort());
    expect((await repo.listScheduled()).every((s) => s.status === "missed")).toBe(true);

    const gromov = await repo.getUserCoach("gromov");
    expect(gromov.score).toBe(12);
    expect(gromov.state).toBe("ignoring");
    expect(gromov.ignoringUntil).toBe(slot + 30 * MINUTE + 12 * HOUR);
    expect(isIgnoring(gromov, now)).toBe(true);

    const marina = await repo.getUserCoach("marina");
    expect(marina.ignoringUntil).toBe(slot + 30 * MINUTE + 24 * HOUR);
    expect(marina.score).toBe(22);
    expect(marina.level).toBe("tolerates"); // буфер: 22 ≥ 25−3
  });

  it("в течение 30 минут после времени тренировки ещё не пропуск", async () => {
    const slot = at(10, 20, 18);
    await plan("gromov", slot);
    const report = await runAppOpen(repo, slot + 29 * MINUTE);
    expect(report.missed).toEqual([]);
    expect((await repo.getUserCoach("gromov")).state).toBe("normal");
  });

  it("давний пропуск: штраф есть, а игнор уже закончился — не начинается", async () => {
    await setCoach("gromov", { score: 40, level: "tolerates" });
    await plan("gromov", at(10, 17, 18));
    const report = await runAppOpen(repo, at(10, 20, 10));
    expect(report.missed).toHaveLength(1);
    expect(report.ignoringStarted).toEqual([]);
    expect((await repo.getUserCoach("gromov")).state).toBe("normal");
  });

  it("при сигнале кризиса игнор не включается", async () => {
    await repo.updateProfile({ supportPausedUntil: TODAY + 7 * DAY });
    const slot = at(10, 20, 8);
    await plan("gromov", slot);
    const report = await runAppOpen(repo, slot + 40 * MINUTE);
    expect(report.missed).toHaveLength(1);
    expect(report.ignoringStarted).toEqual([]);
    expect((await repo.getUserCoach("gromov")).state).toBe("normal");
  });

  it("игнор заканчивается сам по истечении срока", async () => {
    const slot = at(10, 20, 8);
    await plan("gromov", slot);
    await runAppOpen(repo, slot + 40 * MINUTE);
    expect((await repo.getUserCoach("gromov")).state).toBe("ignoring");
    const report = await runAppOpen(repo, slot + 13 * HOUR);
    expect(report.ignoringEnded).toContain("gromov");
    expect((await repo.getUserCoach("gromov")).state).toBe("normal");
  });

  it("сообщения во время игнора: «прочитано», ответа нет, одно холодное сообщение за период", async () => {
    const slot = at(10, 20, 8);
    await plan("gromov", slot);
    await runAppOpen(repo, slot + 40 * MINUTE);

    const sentAt = slot + 2 * HOUR;
    await repo.addMessage({
      coachId: "gromov",
      sender: "user",
      type: "text",
      text: "Прости, был занят",
      emotion: null,
      durationSec: null,
      meta: {},
      readAt: null,
      createdAt: sentAt,
    });
    await onUserMessageWhileIgnoring(repo, "gromov", sentAt, () => 0.5);
    const mine = (await repo.listMessages("gromov")).find((m) => m.sender === "user");
    expect(mine?.readAt).toBe(sentAt);

    const coach = await repo.getUserCoach("gromov");
    expect(coach.coldMessageDueAt).toBe(sentAt + 5 * MINUTE);
    // не раньше срока
    expect(await deliverColdMessageIfDue(repo, "gromov", sentAt + 4 * MINUTE)).toBeNull();
    // ровно одно холодное сообщение
    const cold = await deliverColdMessageIfDue(repo, "gromov", sentAt + 6 * MINUTE, () => 0);
    expect(cold?.sender).toBe("coach");
    expect(SCRIPTED_BANKS.gromov.ignore_cold.map((l) => l.text)).toContain(cold?.text);
    expect(await deliverColdMessageIfDue(repo, "gromov", sentAt + 20 * MINUTE)).toBeNull();
    // новое сообщение в тот же период новых холодных не запускает
    await onUserMessageWhileIgnoring(repo, "gromov", sentAt + 30 * MINUTE);
    expect((await repo.getUserCoach("gromov")).coldMessageDueAt).toBeNull();
    expect((await repo.listMessages("gromov")).filter((m) => m.sender === "coach")).toHaveLength(1);
  });
});

describe("сценарий: пропустил → игнор → потренировался → тренер ответил", () => {
  it("работает от начала до конца", async () => {
    await setCoach("gromov", { score: 20, level: "despises", unlocked: true });
    const slot = at(10, 20, 18);
    const scheduledId = await plan("gromov", slot);

    // 1) пропустил
    await runAppOpen(repo, slot + 45 * MINUTE);
    let gromov = await repo.getUserCoach("gromov");
    expect(gromov.state).toBe("ignoring");
    expect(gromov.score).toBe(12);

    // 2) написал — «прочитано», ответа нет
    const wrote = slot + 2 * HOUR;
    await repo.addMessage({
      coachId: "gromov",
      sender: "user",
      type: "text",
      text: "Простите!",
      emotion: null,
      durationSec: null,
      meta: {},
      readAt: null,
      createdAt: wrote,
    });
    await onUserMessageWhileIgnoring(repo, "gromov", wrote);
    expect((await repo.listMessages("gromov")).filter((m) => m.sender === "coach")).toHaveLength(0);

    // 3) брошенная тренировка игнор НЕ снимает
    const quitAt = slot + 3 * HOUR;
    await workout("gromov", quitAt, results(3, 3), "abandoned");
    gromov = await repo.getUserCoach("gromov");
    expect(gromov.state).toBe("ignoring");
    expect(gromov.score).toBe(9);

    // 4) завершённая — снимает; тренер отвечает в характере
    const doneAt = slot + 4 * HOUR;
    const finished = await workout("gromov", doneAt, results(10, 10));
    gromov = await repo.getUserCoach("gromov");
    expect(gromov.state).toBe("normal");
    expect(gromov.ignoringUntil).toBeNull();
    expect(finished.outcome?.ignoreEnded).toBe(true);
    expect(gromov.score).toBe(9 + 6 + 3);

    const coachLines = (await repo.listMessages("gromov"))
      .filter((m) => m.sender === "coach")
      .map((m) => m.text);
    const ignoreEnd = SCRIPTED_BANKS.gromov.ignore_end.map((l) => l.text);
    expect(coachLines.some((t) => ignoreEnd.includes(t))).toBe(true);
    expect(coachLines).toContain(finished.outcome?.verdictText);

    // 5) после этого тренер снова отвечает (состояние normal → чат может отвечать)
    expect(isIgnoring(gromov, doneAt + 1000)).toBe(false);
    // запланированная тренировка закрыта и второго штрафа за пропуск не будет
    const sched = (await repo.listScheduled()).find((s) => s.id === scheduledId);
    expect(["skipped", "done", "missed"]).toContain(sched?.status);
  });
});

describe("итоги тренировки", () => {
  it("обычная: +6, чистая техника +3, запись о событиях, вердикт в чате, плановая закрыта", async () => {
    await setCoach("gromov", { score: 8, level: "despises" });
    const slot = at(10, 20, 18);
    const scheduledId = await plan("gromov", slot);
    const now = slot + 25 * MINUTE; // начата примерно вовремя
    const session = await newSession("gromov", scheduledId);
    const finished = await finishWorkout(repo, {
      session,
      results: results(20, 18),
      bestSets: { squat: 20 },
      recordsBeaten: [],
      status: "done",
      durationSec: 600,
      now,
    });
    const o = finished.outcome!;
    expect(o.scoreBefore).toBe(8);
    expect(o.scoreDelta).toBe(6 + 3 + 1); // + вовремя (начата в 18:15)
    expect(o.verdictKind).toBe("great");
    expect(o.events.map((e) => e.type)).toEqual(["workout_completed", "clean_bonus", "on_time"]);
    expect((await repo.listScheduled()).find((s) => s.id === scheduledId)?.status).toBe("done");
    expect((await repo.listRelationshipEvents("gromov")).map((e) => e.type)).toEqual(
      expect.arrayContaining(["workout_completed", "clean_bonus", "on_time"]),
    );
    expect((await repo.getUserCoach("gromov")).lastWorkoutAt).toBe(now);
    expect((await repo.unreadCounts()).gromov).toBeGreaterThan(0);
  });

  it("потолок +15 в сутки: третья тренировка за день уже почти ничего не даёт", async () => {
    await setCoach("gromov", { score: 0, level: "despises" });
    const a = await workout("gromov", at(10, 20, 8), results(20, 20));
    const b = await workout("gromov", at(10, 20, 12), results(20, 20));
    const c = await workout("gromov", at(10, 20, 20), results(20, 20));
    expect(a.outcome?.scoreDelta).toBe(9);
    expect(b.outcome?.scoreDelta).toBe(6);
    expect(c.outcome?.scoreDelta).toBe(0);
    expect(c.outcome?.capped).toBe(true);
    expect((await repo.getUserCoach("gromov")).score).toBe(15);
    // на следующий день снова можно
    const d = await workout("gromov", at(10, 21, 9), results(20, 20));
    expect(d.outcome?.scoreDelta).toBe(9);
  });

  it("брошенная тренировка: −3, без бонусов, вердикт не выше «нормально»", async () => {
    await setCoach("gromov", { score: 30, level: "tolerates" });
    const s = await workout("gromov", TODAY, results(10, 10), "abandoned");
    expect(s.outcome?.scoreDelta).toBe(-3);
    expect(s.outcome?.verdictKind).toBe("ok");
    expect(s.status).toBe("abandoned");
  });

  it("повышение уровня: сообщение тренера в характере", async () => {
    await setCoach("gromov", { score: 20, level: "despises" });
    const s = await workout("gromov", TODAY, results(20, 20));
    expect(s.outcome?.levelUp).toBe(true);
    expect(s.outcome?.levelAfter).toBe("tolerates");
    const lines = (await repo.listMessages("gromov")).map((m) => m.text);
    expect(
      lines.some((t) => SCRIPTED_BANKS.gromov.level_up_tolerates.map((l) => l.text).includes(t)),
    ).toBe(true);
  });

  it("личные рекорды сохраняются и показываются в итогах", async () => {
    await repo.putRecord({ exerciseId: "squat", bestTotal: 10, bestClean: 8, updatedAt: 1 });
    const session = await newSession("gromov");
    const finished = await finishWorkout(repo, {
      session,
      results: results(14, 12),
      bestSets: { squat: 14 },
      recordsBeaten: ["squat"],
      status: "done",
      durationSec: 300,
      now: TODAY,
    });
    expect(finished.personalRecords).toEqual(["squat"]);
    expect(finished.outcome?.events.map((e) => e.type)).toContain("personal_record");
    expect((await repo.listRecords()).find((r) => r.exerciseId === "squat")?.bestTotal).toBe(14);
  });

  it("серия 7 дней: бонус +5 один раз и сообщение тренера", async () => {
    await setCoach("gromov", { score: 0, level: "despises" });
    let last = null as Awaited<ReturnType<typeof workout>> | null;
    for (let i = 6; i >= 0; i -= 1)
      last = await workout("gromov", at(10, 20 - i, 10), results(12, 12));
    expect(last?.outcome?.streak).toBe(7);
    expect(last?.outcome?.events.map((e) => e.type)).toContain("streak_7");
    const texts = (await repo.listMessages("gromov")).map((m) => m.text);
    expect(texts.some((t) => SCRIPTED_BANKS.gromov.streak7.map((l) => l.text).includes(t))).toBe(
      true,
    );
    const eighth = await workout("gromov", at(10, 21, 10), results(12, 12));
    expect(eighth.outcome?.events.map((e) => e.type)).not.toContain("streak_7");
  });
});

describe("дни без тренировки и статус", () => {
  it("−2 за каждый следующий день, один раз за день, у всех открытых тренеров", async () => {
    await repo.updateProfile({ createdAt: at(10, 1) });
    await setCoach("gromov", { score: 30, level: "tolerates" });
    await setCoach("marina", { score: 40, level: "tolerates", unlocked: true });
    await workout("gromov", at(10, 15, 10), results(10, 5));
    await repo.updateProfile({ lastOpenedAt: at(10, 15, 11) });

    await runAppOpen(repo, at(10, 16, 20)); // льготный день
    expect((await repo.getUserCoach("marina")).score).toBe(40);

    const report = await runAppOpen(repo, at(10, 18, 9)); // 17-е и 18-е
    expect(report.decayed.marina).toBe(-4);
    expect((await repo.getUserCoach("marina")).score).toBe(36);

    await runAppOpen(repo, at(10, 18, 22)); // тот же день — повторного штрафа нет
    expect((await repo.getUserCoach("marina")).score).toBe(36);
    await runAppOpen(repo, at(10, 19, 9));
    expect((await repo.getUserCoach("marina")).score).toBe(34);
    // закрытые тренеры не страдают
    expect((await repo.getUserCoach("max")).score).toBe(0);
  });

  it("если тренируешься — очки не тают", async () => {
    await setCoach("gromov", { score: 30, level: "tolerates" });
    await workout("gromov", at(10, 19, 10), results(10, 5));
    await runAppOpen(repo, at(10, 20, 10));
    expect((await repo.getUserCoach("gromov")).score).toBeGreaterThanOrEqual(30);
  });

  it("после 7+ дней молчания тренер выкладывает «статус» — не чаще раза в неделю", async () => {
    await repo.updateProfile({ lastOpenedAt: TODAY - 9 * DAY, activeCoachId: "gromov" });
    const first = await runAppOpen(repo, TODAY);
    expect(first.statusPosted).toEqual(["gromov"]);
    const status = (await repo.listMessages("gromov")).find((m) => m.type === "status");
    expect(SCRIPTED_BANKS.gromov.status_new_student.map((l) => l.text)).toContain(status?.text);

    await repo.updateProfile({ lastOpenedAt: TODAY - 8 * DAY });
    const second = await runAppOpen(repo, TODAY + 2 * DAY);
    expect(second.statusPosted).toEqual([]);
  });
});

describe("разблокировка тренеров", () => {
  it("Марина открывается, когда Громов начинает тебя терпеть", async () => {
    await setCoach("gromov", { score: 24, level: "despises" });
    const s = await workout("gromov", TODAY, results(20, 20)); // +9 → 33
    expect(s.outcome?.unlockedCoaches).toEqual(["marina"]);
    expect((await repo.getUserCoach("marina")).unlocked).toBe(true);
    const marinaChat = await repo.listMessages("marina");
    expect(marinaChat).toHaveLength(1);
    expect(SCRIPTED_BANKS.marina.greeting.map((l) => l.text)).toContain(marinaChat[0]?.text);
  });

  it("Палыч — при «Уважает» с любым; Макс — серия 7 дней", async () => {
    await setCoach("gromov", { score: 49, level: "tolerates" });
    await workout("gromov", TODAY, results(20, 20)); // 49+9=58 → уважает
    expect((await repo.getUserCoach("palych")).unlocked).toBe(true);
    expect((await repo.getUserCoach("max")).unlocked).toBe(false);

    for (let i = 6; i >= 1; i -= 1) await workout("gromov", at(10, 20 - i, 10), results(10, 10));
    expect(await applyUnlocks(repo, TODAY + 1)).toEqual(["max"]);
    // повторный вызов ничего не меняет
    expect(await applyUnlocks(repo, TODAY + 2)).toEqual([]);
  });

  it("брошенная тренировка тренеров не открывает", async () => {
    await setCoach("gromov", { score: 25, level: "tolerates" });
    await workout("gromov", TODAY, results(10, 10), "abandoned");
    expect((await repo.getUserCoach("marina")).unlocked).toBe(false);
  });
});
