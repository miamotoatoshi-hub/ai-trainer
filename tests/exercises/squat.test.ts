import { describe, expect, it } from "vitest";
import { createCounter } from "@/lib/exercises";
import { PoseSmoother } from "@/lib/pose/smoothing";
import { LM } from "@/lib/pose/types";
import {
  createSim,
  sampleSim,
  simDuration,
  squatFrame,
  type RepKind,
  type SimScriptOptions,
} from "@/lib/pose/simulator";
import { errorCodes, feed, reps } from "./helpers";

function squats(kinds: RepKind[], count: number, extra: Partial<SimScriptOptions> = {}) {
  const options: SimScriptOptions = { exercise: "squat", kinds, ...extra };
  return sampleSim(createSim(options), simDuration(options, count));
}

describe("приседания", () => {
  for (const view of ["front", "side"] as const) {
    it(`10 нормальных приседаний = 10 (вид: ${view})`, () => {
      const counter = createCounter("squat");
      const events = feed(counter, squats(["good"], 10, { view }));
      const snap = counter.snapshot();
      expect(snap.total).toBe(10);
      expect(snap.clean).toBe(10);
      expect(snap.shallow).toBe(0);
      expect(snap.bestStreak).toBe(10);
      expect(errorCodes(events)).toEqual([]);
      expect(reps(events).map((r) => r.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  }

  it("неглубокие помечены и не засчитаны", () => {
    const counter = createCounter("squat");
    const events = feed(counter, squats(["good", "shallow", "good", "shallow", "good"], 5));
    const snap = counter.snapshot();
    expect(snap.total).toBe(3);
    expect(snap.shallow).toBe(2);
    expect(events.filter((e) => e.type === "shallow")).toHaveLength(2);
    expect(snap.errors.rep_shallow).toBe(2);
    // неглубокая попытка рвёт серию чистых повторов
    expect(snap.bestStreak).toBe(1);
  });

  it("дрожание на месте не засчитывается", () => {
    const counter = createCounter("squat");
    const frames = sampleSim(
      createSim({ exercise: "squat", kinds: ["good"], leadMs: 60_000, jitterDeg: 4, seed: 7 }),
      20_000,
    );
    feed(counter, frames);
    const snap = counter.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.shallow).toBe(0);
  });

  it("лёгкое приседание на 140° и обратно не считается ни повтором, ни «неглубоко»", () => {
    const counter = createCounter("squat");
    const frames = Array.from({ length: 300 }, (_, i) =>
      squatFrame({ kneeAngle: 156 + 15 * Math.sin(i / 4) }, i * 33, { view: "front" }),
    );
    feed(counter, frames);
    expect(counter.snapshot().total).toBe(0);
    expect(counter.snapshot().shallow).toBe(0);
  });

  it("колени внутрь — ошибка knees_cave_in, повтор засчитан, но не чистый", () => {
    const counter = createCounter("squat");
    const events = feed(counter, squats(["good", "cave", "good"], 3, { view: "front" }));
    expect(errorCodes(events)).toContain("knees_cave_in");
    const result = reps(events);
    expect(result.map((r) => r.clean)).toEqual([true, false, true]);
    expect(result[1]?.errors).toContain("knees_cave_in");
    expect(counter.snapshot().clean).toBe(2);
  });

  it("сильный наклон корпуса — torso_lean", () => {
    const counter = createCounter("squat");
    const events = feed(counter, squats(["lean"], 2, { view: "side" }));
    expect(errorCodes(events)).toContain("torso_lean");
    expect(reps(events).every((r) => !r.clean)).toBe(true);
  });

  it("слишком быстрый повтор — too_fast", () => {
    const counter = createCounter("squat");
    const events = feed(counter, squats(["good", "fast"], 2));
    const result = reps(events);
    expect(result).toHaveLength(2);
    expect(result[0]?.clean).toBe(true);
    expect(result[1]?.errors).toContain("too_fast");
    expect(result[1]?.durationMs).toBeLessThan(1000);
  });

  it("частичная видимость: без щиколоток тело «не видно», повторы не считаются", () => {
    const counter = createCounter("squat");
    const options: SimScriptOptions = {
      exercise: "squat",
      kinds: ["good"],
      camera: { hide: [LM.L_ANKLE, LM.R_ANKLE] },
    };
    feed(counter, sampleSim(createSim(options), simDuration(options, 4)));
    const snap = counter.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.visible).toBe(false);
  });

  it("если одна нога видна, а другая нет — счёт идёт по видимой", () => {
    const counter = createCounter("squat");
    const options: SimScriptOptions = {
      exercise: "squat",
      kinds: ["good"],
      camera: { hide: [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE] },
    };
    feed(counter, sampleSim(createSim(options), simDuration(options, 5)));
    expect(counter.snapshot().total).toBe(5);
  });

  it("со сглаживанием и шумом углов счёт остаётся верным", () => {
    const counter = createCounter("squat");
    const smoother = new PoseSmoother();
    const frames = squats(["good"], 8, { jitterDeg: 3, seed: 11 }).map((f) => smoother.smooth(f));
    feed(counter, frames);
    const snap = counter.snapshot();
    expect(snap.total).toBe(8);
    expect(snap.shallow).toBe(0);
  });

  it("reset обнуляет счёт", () => {
    const counter = createCounter("squat");
    feed(counter, squats(["good"], 3));
    expect(counter.snapshot().total).toBe(3);
    counter.reset();
    expect(counter.snapshot().total).toBe(0);
    expect(counter.snapshot().bestStreak).toBe(0);
  });
});
