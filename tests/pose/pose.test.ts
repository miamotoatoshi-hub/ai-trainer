import { describe, expect, it } from "vitest";
import { angleAt, tiltFromVertical } from "@/lib/pose/geometry";
import { InFrameGate, bodyInFrame } from "@/lib/pose/inFrame";
import { OneEuroFilter, PoseSmoother } from "@/lib/pose/smoothing";
import { LM } from "@/lib/pose/types";
import { mulberry32, squatFrame } from "@/lib/pose/simulator";

describe("геометрия", () => {
  it("угол при вершине", () => {
    expect(angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(
      90,
    );
    expect(angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBeCloseTo(
      180,
    );
    expect(angleAt({ x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(
      0,
    );
    // вырожденный случай не даёт NaN
    expect(angleAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(180);
  });

  it("наклон от вертикали учитывает глубину", () => {
    expect(tiltFromVertical({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(0);
    expect(tiltFromVertical({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(45);
    expect(tiltFromVertical({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(45);
  });

  it("симулятор даёт заданный угол колена в мировых координатах, в любом ракурсе", () => {
    for (const view of ["front", "side"] as const) {
      for (const angle of [170, 120, 90]) {
        const frame = squatFrame({ kneeAngle: angle }, 0, { view });
        const w = frame.world!;
        const a = angleAt(w[LM.L_HIP]!, w[LM.L_KNEE]!, w[LM.L_ANKLE]!);
        expect(a).toBeCloseTo(angle, 0);
      }
    }
  });
});

describe("сглаживание", () => {
  it("подавляет шум на неподвижной точке", () => {
    const rand = mulberry32(5);
    const filter = new OneEuroFilter();
    let rawErr = 0;
    let smoothErr = 0;
    for (let i = 0; i < 300; i += 1) {
      const noisy = 0.5 + (rand() - 0.5) * 0.02;
      const smooth = filter.filter(noisy, i * 33);
      // первые кадры фильтр ещё «разгоняется» — их не считаем
      if (i < 20) continue;
      rawErr += Math.abs(noisy - 0.5);
      smoothErr += Math.abs(smooth - 0.5);
    }
    expect(smoothErr).toBeLessThan(rawErr * 0.5);
  });

  it("не отстаёт на быстром движении: рывок на 0.4 за секунду догоняется за 150 мс", () => {
    const filter = new OneEuroFilter();
    for (let i = 0; i < 30; i += 1) filter.filter(0.3, i * 33);
    let reachedAt = -1;
    for (let i = 0; i < 90; i += 1) {
      const t = 990 + i * 33;
      const truth = Math.min(0.7, 0.3 + (0.4 * (i * 33)) / 1000);
      const smooth = filter.filter(truth, t);
      if (reachedAt < 0 && Math.abs(smooth - truth) < 0.02) reachedAt = i * 33;
    }
    expect(reachedAt).toBeGreaterThanOrEqual(0);
    expect(reachedAt).toBeLessThanOrEqual(150);
  });

  it("после долгой потери позы начинает с нуля, а не тянется к старому положению", () => {
    const smoother = new PoseSmoother();
    const a = squatFrame({ kneeAngle: 170 }, 0);
    smoother.smooth(a);
    const b = { ...squatFrame({ kneeAngle: 170 }, 5000, { offsetX: 0.2 }) };
    const out = smoother.smooth(b);
    expect(out.landmarks[LM.L_KNEE]!.x).toBeCloseTo(b.landmarks[LM.L_KNEE]!.x, 5);
  });
});

describe("человек в кадре", () => {
  it("видны все ключевые точки", () => {
    expect(bodyInFrame(squatFrame({ kneeAngle: 170 }))).toBe(true);
    expect(bodyInFrame(squatFrame({ kneeAngle: 170 }, 0, { hide: [LM.L_ANKLE] }))).toBe(false);
  });

  it("человек за краем кадра — не в кадре", () => {
    expect(bodyInFrame(squatFrame({ kneeAngle: 170 }, 0, { offsetX: 0.7 }))).toBe(false);
  });

  it("готовность только после 1.5 секунд подряд; потеря сбрасывает отсчёт", () => {
    const gate = new InFrameGate();
    const ok = (t: number) => squatFrame({ kneeAngle: 170 }, t);
    const bad = (t: number) => squatFrame({ kneeAngle: 170 }, t, { hide: [LM.L_KNEE] });

    expect(gate.update(ok(0)).ready).toBe(false);
    expect(gate.update(ok(1000)).ready).toBe(false);
    expect(gate.update(ok(1499)).ready).toBe(false);
    expect(gate.update(ok(1500)).ready).toBe(true);

    expect(gate.update(bad(1600)).inFrame).toBe(false);
    expect(gate.update(ok(1700)).ready).toBe(false);
    expect(gate.update(ok(3300)).ready).toBe(true);
    expect(gate.update(null).ready).toBe(false);
  });
});
