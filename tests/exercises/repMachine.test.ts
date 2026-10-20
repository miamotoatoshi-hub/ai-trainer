import { describe, expect, it } from "vitest";
import { ErrorGate, RepMachine } from "@/lib/exercises/repMachine";
import { SQUAT_CONFIG } from "@/lib/exercises/squat";

/** Прогоняет последовательность углов (30 кадров в секунду) и собирает результаты автомата. */
function run(angles: number[], hz = 30) {
  const machine = new RepMachine(SQUAT_CONFIG.thresholds);
  const out = { completed: 0, shallow: 0, aborted: 0, started: 0, depths: [] as number[] };
  angles.forEach((angle, i) => {
    const r = machine.update(angle, (i * 1000) / hz);
    if (r.completed) {
      out.completed += 1;
      out.depths.push(r.completed.depth);
    }
    if (r.shallow) out.shallow += 1;
    if (r.aborted) out.aborted += 1;
    if (r.started) out.started += 1;
  });
  return out;
}

const ramp = (from: number, to: number, steps: number) =>
  Array.from({ length: steps }, (_, i) => from + ((to - from) * (i + 1)) / steps);

describe("автомат повторения", () => {
  it("засчитывает полный повтор: вверху 170 → внизу 85 → снова вверху", () => {
    const out = run([170, ...ramp(170, 85, 30), ...ramp(85, 170, 30)]);
    expect(out.completed).toBe(1);
    expect(out.shallow).toBe(0);
    expect(out.depths[0]).toBeCloseTo(85, 0);
  });

  it("неглубокий присед (до 118°) не засчитывается, а помечается — сразу при развороте вверх", () => {
    const machine = new RepMachine(SQUAT_CONFIG.thresholds);
    let shallowAt = -1;
    const angles = [170, ...ramp(170, 118, 20), ...ramp(118, 170, 20)];
    angles.forEach((angle, i) => {
      const r = machine.update(angle, i * 33);
      if (r.shallow && shallowAt < 0) shallowAt = i;
      expect(r.completed).toBeUndefined();
    });
    expect(shallowAt).toBeGreaterThan(0);
    // «Ниже!» прозвучало, пока человек ещё поднимается, а не после возврата наверх
    expect(angles[shallowAt]).toBeLessThan(150);
  });

  it("лёгкое покачивание (до 140°) не даёт ни повторов, ни «неглубоко»", () => {
    const wobble = Array.from({ length: 300 }, (_, i) => 152 + 12 * Math.sin(i / 3));
    const out = run(wobble);
    expect(out.completed).toBe(0);
    expect(out.shallow).toBe(0);
  });

  it("дрожание на пороге не даёт ложных повторов (гистерезис)", () => {
    // человек стоит и «дрожит» вокруг 150°, не уходя ниже порога начала спуска (145°)
    const jitter = Array.from({ length: 400 }, (_, i) => 150 + (i % 2 === 0 ? 4.9 : -4.9));
    const out = run(jitter);
    expect(out.completed).toBe(0);
    expect(out.started).toBe(0);
  });

  it("дребезг на дне не размножает повтор", () => {
    const down = ramp(170, 90, 25);
    const wobbleAtBottom = Array.from({ length: 30 }, (_, i) => 90 + (i % 2 === 0 ? 6 : -4));
    const up = ramp(90, 170, 25);
    const out = run([170, ...down, ...wobbleAtBottom, ...up]);
    expect(out.completed).toBe(1);
  });

  it("повтор не завершён, пока не вернулся наверх до 160°", () => {
    const out = run([170, ...ramp(170, 85, 30), ...ramp(85, 150, 30)]);
    expect(out.completed).toBe(0);
  });

  it("считает несколько повторов подряд", () => {
    const one = [...ramp(170, 85, 30), ...ramp(85, 170, 30), 170, 170, 170];
    const out = run([170, ...one, ...one, ...one, ...one, ...one]);
    expect(out.completed).toBe(5);
  });
});

describe("ErrorGate", () => {
  it("срабатывает один раз, когда признак держится нужное число кадров", () => {
    const gate = new ErrorGate();
    const fired = [false, true, true, true, true, true, true].map((active) =>
      gate.update("x", active, 3),
    );
    expect(fired.filter(Boolean)).toHaveLength(1);
    expect(fired.indexOf(true)).toBe(3);
  });

  it("сбрасывается, если признак пропал", () => {
    const gate = new ErrorGate();
    expect(gate.update("x", true, 3)).toBe(false);
    expect(gate.update("x", true, 3)).toBe(false);
    expect(gate.update("x", false, 3)).toBe(false);
    expect(gate.update("x", true, 3)).toBe(false);
    expect(gate.update("x", true, 3)).toBe(false);
    expect(gate.update("x", true, 3)).toBe(true);
  });
});
