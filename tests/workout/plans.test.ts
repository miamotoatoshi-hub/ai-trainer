import { describe, expect, it } from "vitest";
import { buildSteps } from "@/lib/workout/runner";
import { duelPlanId, freePlanId, getPlan, PLANS } from "@/lib/workout/plans";

describe("свободные тренировки", () => {
  it("один подход и три подхода по каждому упражнению", () => {
    const quick = getPlan(freePlanId("squat", "quick"));
    expect(quick.id).toBe("free:squat:quick");
    const steps = buildSteps(quick).filter((s) => s.kind === "set");
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ exercise: "squat", reps: 10 });

    const standard = getPlan(freePlanId("pushup", "standard"));
    const sets = buildSteps(standard).filter((s) => s.kind === "set");
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.reps === 8)).toBe(true);
    // между подходами — отдых
    expect(buildSteps(standard).filter((s) => s.kind === "rest")).toHaveLength(2);
  });

  it("планка — по времени, а не по повторениям", () => {
    const plan = getPlan(freePlanId("plank", "quick"));
    const [step] = buildSteps(plan);
    expect(step).toMatchObject({ exercise: "plank", seconds: 30 });
    expect(step!.reps).toBeUndefined();
  });

  it("у плана есть название и продолжительность, и это не запасной план", () => {
    for (const id of ["squat", "pushup", "lunge", "plank", "jumping_jack"] as const) {
      const plan = getPlan(freePlanId(id, "standard"));
      expect(plan.title.length).toBeGreaterThan(5);
      expect(plan.durationMin).toBeGreaterThanOrEqual(1);
      expect(plan.id).toBe(`free:${id}:standard`);
    }
  });
});

describe("дуэль", () => {
  it("максимум чистых повторений за заданное время: один подход с таймером", () => {
    const plan = getPlan(duelPlanId("squat", 60));
    expect(plan.id).toBe("duel:squat:60");
    const steps = buildSteps(plan);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "set", exercise: "squat", seconds: 60 });
    expect(steps[0]!.reps).toBeUndefined();
  });

  it("странные параметры дают запасной план, а не поломку", () => {
    const fallback = getPlan("legs-20");
    expect(getPlan("duel:squat:5").id).toBe(fallback.id);
    expect(getPlan("duel:squat:abc").id).toBe(fallback.id);
    expect(getPlan("duel:hack:60").id).toBe(fallback.id);
    expect(getPlan("free:squat:huge").id).toBe(fallback.id);
    expect(getPlan("nonsense").id).toBe(fallback.id);
  });

  it("готовые планы по-прежнему на месте", () => {
    expect(Object.keys(PLANS)).toContain("first-squats");
  });
});
