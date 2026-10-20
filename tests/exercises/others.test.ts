import { describe, expect, it } from "vitest";
import { createCounter } from "@/lib/exercises";
import {
  createSim,
  sampleSim,
  simDuration,
  type RepKind,
  type SimScriptOptions,
} from "@/lib/pose/simulator";
import { errorCodes, feed, reps } from "./helpers";

function frames(options: SimScriptOptions, count: number) {
  return sampleSim(createSim(options), simDuration(options, count));
}

describe("отжимания", () => {
  it("8 нормальных = 8", () => {
    const counter = createCounter("pushup");
    feed(counter, frames({ exercise: "pushup", kinds: ["good"] }, 8));
    const snap = counter.snapshot();
    expect(snap.total).toBe(8);
    expect(snap.clean).toBe(8);
    expect(snap.shallow).toBe(0);
  });

  it("неглубокие помечены, провисание таза — hips_sag", () => {
    const counter = createCounter("pushup");
    const kinds: RepKind[] = ["good", "shallow", "sag", "good"];
    const events = feed(counter, frames({ exercise: "pushup", kinds }, 4));
    const snap = counter.snapshot();
    expect(snap.total).toBe(3);
    expect(snap.shallow).toBe(1);
    expect(errorCodes(events)).toContain("hips_sag");
    expect(reps(events).map((r) => r.clean)).toEqual([true, false, true]);
  });

  it("дрожание локтя на месте не засчитывается", () => {
    const counter = createCounter("pushup");
    feed(
      counter,
      sampleSim(createSim({ exercise: "pushup", leadMs: 60_000, jitterDeg: 4, seed: 3 }), 15_000),
    );
    expect(counter.snapshot().total).toBe(0);
    expect(counter.snapshot().shallow).toBe(0);
  });
});

describe("выпады", () => {
  it("6 нормальных = 6", () => {
    const counter = createCounter("lunge");
    feed(counter, frames({ exercise: "lunge", kinds: ["good"] }, 6));
    expect(counter.snapshot().total).toBe(6);
    expect(counter.snapshot().clean).toBe(6);
  });

  it("колено за носок — knee_over_toe, неглубокий помечен", () => {
    const counter = createCounter("lunge");
    const events = feed(
      counter,
      frames({ exercise: "lunge", kinds: ["good", "over", "shallow"] }, 3),
    );
    expect(errorCodes(events)).toContain("knee_over_toe");
    expect(counter.snapshot().shallow).toBe(1);
    expect(reps(events).map((r) => r.clean)).toEqual([true, false]);
  });
});

describe("планка", () => {
  it("12 секунд удержания ≈ 12 секунд, все чистые", () => {
    const counter = createCounter("plank");
    const events = feed(counter, sampleSim(createSim({ exercise: "plank" }), 12_000));
    const snap = counter.snapshot();
    expect(snap.unit).toBe("sec");
    expect(snap.total).toBeGreaterThanOrEqual(11);
    expect(snap.total).toBeLessThanOrEqual(12);
    expect(snap.clean).toBe(snap.total);
    expect(errorCodes(events)).toEqual([]);
  });

  it("провисший таз — hips_sag, секунды не чистые", () => {
    const counter = createCounter("plank");
    const events = feed(
      counter,
      sampleSim(createSim({ exercise: "plank", kinds: ["sag"] }), 8_000),
    );
    const snap = counter.snapshot();
    expect(errorCodes(events)).toContain("hips_sag");
    expect(snap.total).toBeGreaterThanOrEqual(7);
    expect(snap.clean).toBe(0);
  });

  it("если человек не в планке (стоит), время не идёт", () => {
    const counter = createCounter("plank");
    feed(counter, sampleSim(createSim({ exercise: "squat", leadMs: 60_000 }), 8_000));
    expect(counter.snapshot().total).toBe(0);
  });
});

describe("джампинг джек", () => {
  it("10 повторений = 10", () => {
    const counter = createCounter("jumping_jack");
    feed(counter, frames({ exercise: "jumping_jack", kinds: ["good"], restMs: 100 }, 10));
    expect(counter.snapshot().total).toBe(10);
    expect(counter.snapshot().clean).toBe(10);
  });

  it("если ноги остались вместе — это не повтор, а «неполный»", () => {
    const counter = createCounter("jumping_jack");
    const kinds: RepKind[] = ["good", "partial", "good"];
    const events = feed(counter, frames({ exercise: "jumping_jack", kinds, restMs: 100 }, 3));
    const snap = counter.snapshot();
    expect(snap.total).toBe(2);
    expect(snap.shallow).toBe(1);
    expect(events.some((e) => e.type === "shallow")).toBe(true);
  });
});
