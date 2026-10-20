import { describe, expect, it } from "vitest";
import { createCounter } from "@/lib/exercises";
import type { CounterEvent, CounterSnapshot, ExerciseCounter } from "@/lib/exercises/types";
import type { ExerciseId } from "@/lib/data/types";
import { createSim, squatFrame } from "@/lib/pose/simulator";
import type { PoseFrame } from "@/lib/pose/types";
import { PLANS, getPlan, type WorkoutPlan } from "@/lib/workout/plans";
import { WorkoutRunner, buildSteps, type RunnerEvent } from "@/lib/workout/runner";

const FRAME: PoseFrame = squatFrame({ kneeAngle: 172 });

/** Управляемый счётчик: тест сам «подсовывает» события. */
class FakeCounter implements ExerciseCounter {
  total = 0;
  clean = 0;
  shallow = 0;
  visible = true;
  private queue: CounterEvent[] = [];
  constructor(
    readonly id: ExerciseId,
    readonly unit: "reps" | "sec" = "reps",
  ) {}
  push(...events: CounterEvent[]) {
    this.queue.push(...events);
  }
  rep(clean = true) {
    this.push({
      type: "rep",
      index: this.total + 1,
      clean,
      errors: clean ? [] : ["too_fast"],
      durationMs: 2000,
      depth: 80,
    });
  }
  update(): CounterEvent[] {
    const events = this.queue.splice(0);
    for (const e of events) {
      if (e.type === "rep") {
        this.total += 1;
        if (e.clean) this.clean += 1;
      }
      if (e.type === "second") {
        this.total = e.seconds;
        if (e.clean) this.clean += 1;
      }
      if (e.type === "shallow") this.shallow += 1;
    }
    return events;
  }
  snapshot(): CounterSnapshot {
    return {
      exerciseId: this.id,
      unit: this.unit,
      total: this.total,
      clean: this.clean,
      shallow: this.shallow,
      streak: 0,
      bestStreak: this.clean,
      errors: {},
      phase: "up",
      visible: this.visible,
      measure: null,
      debug: {},
    };
  }
  reset() {}
}

function harness(plan: WorkoutPlan, records: Partial<Record<ExerciseId, number>> = {}) {
  const counters: FakeCounter[] = [];
  const runner = new WorkoutRunner(plan, {
    records,
    createCounter: (id) => {
      const c = new FakeCounter(id, id === "plank" ? "sec" : "reps");
      counters.push(c);
      return c;
    },
  });
  let now = 0;
  const log: RunnerEvent[] = [];
  const tick = (ms = 33, frame: PoseFrame | null = FRAME) => {
    now += ms;
    const events = runner.update(frame, now);
    log.push(...events);
    return events;
  };
  const start = () => {
    const events = runner.start(now);
    log.push(...events);
    return events;
  };
  const current = () => counters[counters.length - 1]!;
  const types = () => log.map((e) => e.type);
  return {
    runner,
    counters,
    log,
    tick,
    start,
    current,
    types,
    now: () => now,
    advance: (ms: number) => (now += ms),
  };
}

const plan = (blocks: WorkoutPlan["blocks"]): WorkoutPlan => ({
  id: "t",
  title: "t",
  cardTitle: "t",
  durationMin: 1,
  blocks,
});

describe("сборка шагов из JSON-плана", () => {
  it("legs-20: разминка → отдых → 3 подхода → … → «добивание», без отдыха в конце", () => {
    const steps = buildSteps(getPlan("legs-20"));
    expect(steps.map((s) => `${s.kind}:${s.exercise}`)).toEqual([
      "warmup:jumping_jack",
      "rest:squat",
      "set:squat",
      "rest:squat",
      "set:squat",
      "rest:squat",
      "set:squat",
      "rest:lunge",
      "set:lunge",
      "rest:lunge",
      "set:lunge",
      "rest:squat",
      "finisher:squat",
    ]);
    expect(steps[0]).toMatchObject({ seconds: 40 });
    expect(steps[2]).toMatchObject({ reps: 10, setIndex: 0, setsTotal: 3 });
    expect(steps[1]).toMatchObject({ seconds: 15 });
    expect(steps[3]).toMatchObject({ seconds: 40 });
    expect(steps.at(-1)?.kind).toBe("finisher");
  });

  it("план из одного подхода — один шаг, без отдыха", () => {
    expect(buildSteps(getPlan("quick-check"))).toHaveLength(1);
    expect(buildSteps(getPlan("first-squats"))).toMatchObject([{ kind: "set", reps: 10 }]);
  });

  it("планка: подходы по времени", () => {
    const steps = buildSteps(getPlan("core-10")).filter(
      (s) => s.kind === "set" && s.exercise === "plank",
    );
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.seconds === 25 && s.reps === undefined)).toBe(true);
  });

  it("все планы из content/plans собираются и содержат хотя бы один рабочий шаг", () => {
    for (const p of Object.values(PLANS)) {
      const steps = buildSteps(p);
      expect(
        steps.some((s) => s.kind !== "rest"),
        p.id,
      ).toBe(true);
      expect(steps.at(-1)?.kind, p.id).not.toBe("rest");
    }
  });
});

describe("ход тренировки", () => {
  const squats = plan([{ kind: "sets", exercise: "squat", sets: 2, reps: 10, restSec: 30 }]);

  it("старт → подход → цель достигнута → отдых → следующий подход → конец", () => {
    const h = harness(squats);
    expect(h.start().map((e) => e.type)).toEqual(["set_start"]);
    for (let i = 0; i < 10; i += 1) {
      h.current().rep();
      h.tick(2000);
    }
    expect(h.types()).toContain("set_end");
    expect(h.types()).toContain("rest_start");
    expect(h.runner.view(h.now()).phase).toBe("rest");
    expect(h.runner.view(h.now()).restLeftSec).toBe(30);

    h.advance(29_000);
    h.tick(0);
    expect(h.runner.view(h.now()).phase).toBe("rest");
    h.tick(1500);
    expect(h.types().filter((t) => t === "set_start")).toHaveLength(2);
    expect(h.runner.view(h.now()).phase).toBe("active");

    for (let i = 0; i < 10; i += 1) {
      h.current().rep();
      h.tick(2000);
    }
    expect(h.types().at(-1)).toBe("workout_complete");
    expect(h.runner.isDone).toBe(true);
    expect(h.runner.results()).toEqual([
      expect.objectContaining({ exerciseId: "squat", total: 20, clean: 20 }),
    ]);
  });

  it("«половина» на 5-м повторе и «осталось три» на 7-м, по одному разу", () => {
    const h = harness(squats);
    h.start();
    const seen: string[] = [];
    for (let i = 1; i <= 10; i += 1) {
      h.current().rep();
      for (const e of h.tick(2000))
        if (e.type === "halfway" || e.type === "last_3") seen.push(`${e.type}@${i}`);
    }
    expect(seen).toEqual(["halfway@5", "last_3@7"]);
  });

  it("в коротких подходах нет ни «половины», ни «осталось три»", () => {
    const h = harness(plan([{ kind: "sets", exercise: "squat", sets: 1, reps: 5, restSec: 0 }]));
    h.start();
    for (let i = 0; i < 5; i += 1) {
      h.current().rep();
      h.tick(2000);
    }
    expect(h.types()).not.toContain("halfway");
    expect(h.types()).not.toContain("last_3");
    expect(h.types().at(-1)).toBe("workout_complete");
  });

  it("личный рекорд: один раз, только если рекорд уже был, и не в разминке", () => {
    const h = harness(squats, { squat: 8 });
    h.start();
    const records: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      h.current().rep();
      for (const e of h.tick(2000)) if (e.type === "personal_record") records.push(e.value);
    }
    expect(records).toEqual([9]);
    expect(h.runner.recordsBeaten()).toEqual(["squat"]);

    const first = harness(squats, {});
    first.start();
    for (let i = 0; i < 10; i += 1) {
      first.current().rep();
      first.tick(2000);
    }
    expect(first.types()).not.toContain("personal_record");

    const warm = harness(plan([{ kind: "warmup", exercise: "jumping_jack", seconds: 30 }]), {
      jumping_jack: 2,
    });
    warm.start();
    for (let i = 0; i < 6; i += 1) {
      warm.current().rep();
      warm.tick(1000);
    }
    expect(warm.types()).not.toContain("personal_record");
  });

  it("простой 10 секунд — «idle», один раз, пока не появится движение", () => {
    const h = harness(squats);
    h.start();
    h.tick(9_000);
    expect(h.types()).not.toContain("idle");
    h.tick(1_500);
    expect(h.types().filter((t) => t === "idle")).toHaveLength(1);
    h.tick(30_000);
    expect(h.types().filter((t) => t === "idle")).toHaveLength(1);
    h.current().rep();
    h.tick(100);
    h.tick(10_500);
    expect(h.types().filter((t) => t === "idle")).toHaveLength(2);
  });

  it("человека не видно: через 3 секунды «not_in_frame», повтор не чаще раза в 8 секунд, вместо «idle»", () => {
    const h = harness(squats);
    h.start();
    h.current().visible = false;
    h.tick(100, null); // с этого кадра человека не видно
    h.tick(2_000, null);
    expect(h.types()).not.toContain("not_in_frame");
    h.tick(1_000, null);
    expect(h.types().filter((t) => t === "not_in_frame")).toHaveLength(1);
    h.tick(5_000, null);
    expect(h.types().filter((t) => t === "not_in_frame")).toHaveLength(1);
    h.tick(3_500, null);
    expect(h.types().filter((t) => t === "not_in_frame")).toHaveLength(2);
    // пока человека не видно, «простой» не объявляется
    expect(h.types()).not.toContain("idle");
    // вернулся в кадр: время отсутствия простоем не считается
    h.current().visible = true;
    h.tick(100);
    h.tick(5_000);
    expect(h.types()).not.toContain("idle");
    expect(h.types().filter((t) => t === "not_in_frame")).toHaveLength(2);
  });

  it("ошибки техники и неглубокие проходят наружу", () => {
    const h = harness(squats);
    h.start();
    h.current().push({ type: "error", code: "knees_cave_in" }, { type: "shallow", depth: 120 });
    const events = h.tick();
    expect(events.map((e) => e.type)).toEqual(["technique", "shallow"]);
    expect(events[0]).toMatchObject({ code: "knees_cave_in" });
  });

  it("пауза замораживает время: подход «добивания» на 45 с длится 45 с активного времени", () => {
    const h = harness(plan([{ kind: "finisher", exercise: "squat", seconds: 45 }]));
    h.start();
    h.tick(30_000);
    h.runner.pause(h.now());
    expect(h.runner.update(FRAME, h.now() + 100_000)).toEqual([]);
    h.advance(100_000);
    h.runner.resume(h.now());
    h.tick(10_000);
    expect(h.types()).not.toContain("set_end");
    h.tick(5_500);
    expect(h.types()).toContain("set_end");
    expect(h.types().at(-1)).toBe("workout_complete");
  });

  it("время подхода по таймеру: разминка заканчивается по времени и считает повторы", () => {
    const h = harness(plan([{ kind: "warmup", exercise: "jumping_jack", seconds: 40 }]));
    h.start();
    for (let i = 0; i < 12; i += 1) {
      h.current().rep();
      h.tick(1500);
    }
    expect(h.runner.view(h.now()).timeLeftSec).toBe(22);
    h.tick(23_000);
    const end = h.log.find((e) => e.type === "set_end");
    expect(end).toMatchObject({ reason: "time", result: { total: 12 } });
  });

  it("если подход не получается слишком долго, он закрывается по таймауту", () => {
    const h = harness(plan([{ kind: "sets", exercise: "squat", sets: 1, reps: 10, restSec: 0 }]));
    h.start();
    h.tick(60_000);
    expect(h.log.find((e) => e.type === "set_end")).toBeUndefined();
    h.tick(61_000);
    expect(h.log.find((e) => e.type === "set_end")).toMatchObject({ reason: "timeout" });
  });

  it("планка: цель в секундах, считаются секунды удержания", () => {
    const h = harness(
      plan([{ kind: "sets", exercise: "plank", sets: 1, seconds: 25, restSec: 0 }]),
    );
    h.start();
    for (let s = 1; s <= 25; s += 1) {
      h.current().push({ type: "second", seconds: s, clean: true });
      h.tick(1000);
    }
    expect(h.log.find((e) => e.type === "set_end")).toMatchObject({
      reason: "target",
      result: { exerciseId: "plank", unit: "sec", total: 25 },
    });
    const counts = h.log.filter((e) => e.type === "count");
    expect(counts).toHaveLength(25);
  });

  it("«Завершить» досрочно сохраняет текущий подход в итог", () => {
    const h = harness(squats);
    h.start();
    for (let i = 0; i < 4; i += 1) {
      h.current().rep(i !== 1);
      h.tick(2000);
    }
    h.runner.finish();
    expect(h.runner.isDone).toBe(true);
    expect(h.runner.results()).toEqual([
      expect.objectContaining({ exerciseId: "squat", total: 4, clean: 3 }),
    ]);
  });

  it("можно пропустить отдых", () => {
    const h = harness(squats);
    h.start();
    for (let i = 0; i < 10; i += 1) {
      h.current().rep();
      h.tick(2000);
    }
    expect(h.runner.view(h.now()).phase).toBe("rest");
    const events = h.runner.skipRest(h.now());
    expect(events.map((e) => e.type)).toEqual(["rest_end", "set_start"]);
    expect(h.runner.view(h.now()).phase).toBe("active");
  });

  it("результаты разных упражнений не смешиваются, лучший подход считается без разминки", () => {
    const h = harness(
      plan([
        { kind: "warmup", exercise: "jumping_jack", seconds: 10 },
        { kind: "sets", exercise: "squat", sets: 2, reps: 5, restSec: 0 },
      ]),
    );
    h.start();
    for (let i = 0; i < 20; i += 1) {
      h.current().rep();
      h.tick(400);
    }
    h.tick(10_000); // разминка закончилась по времени, идёт переходный отдых
    h.tick(16_000); // отдых закончился, начался первый подход
    for (let i = 0; i < 10; i += 1) {
      h.current().rep();
      h.tick(1000);
    }
    const results = h.runner.results();
    expect(results.map((r) => r.exerciseId).sort()).toEqual(["jumping_jack", "squat"]);
    expect(results.find((r) => r.exerciseId === "squat")?.total).toBe(10);
    expect(results.find((r) => r.exerciseId === "jumping_jack")?.total).toBe(20);
    expect(h.runner.bestSets().jumping_jack).toBeUndefined();
    expect(h.runner.bestSets().squat).toBe(5);
  });
});

describe("тренировка целиком на настоящем счётчике и симуляторе", () => {
  it("10 приседаний: старт, половина, «осталось три», конец", () => {
    const runner = new WorkoutRunner(getPlan("first-squats"), { createCounter });
    const sim = createSim({ exercise: "squat", kinds: ["good"], view: "front" });
    const log: RunnerEvent[] = [];
    let t = 0;
    log.push(...runner.start(t));
    const origin = t;
    while (!runner.isDone && t < 120_000) {
      t += 33;
      log.push(...runner.update({ ...sim.frameAt(t - origin), t }, t));
    }
    expect(runner.isDone).toBe(true);
    const order = log
      .map((e) => e.type)
      .filter((x) => ["set_start", "halfway", "last_3", "set_end", "workout_complete"].includes(x));
    expect(order).toEqual(["set_start", "halfway", "last_3", "set_end", "workout_complete"]);
    expect(log.filter((e) => e.type === "rep")).toHaveLength(10);
    expect(runner.results()).toEqual([
      expect.objectContaining({ exerciseId: "squat", total: 10, clean: 10 }),
    ]);
  });
});
