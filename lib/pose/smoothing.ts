import { LANDMARK_COUNT, type Landmark, type PoseFrame } from "./types";

/** Фильтр «One Euro»: убирает дрожание точек, но не отстаёт при быстром движении. */
export class OneEuroFilter {
  private lastValue: number | null = null;
  private lastDerivative = 0;
  private lastT = 0;

  constructor(
    private readonly minCutoff = 1.5,
    private readonly beta = 0.02,
    private readonly derivativeCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dtSec: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dtSec);
  }

  filter(value: number, tMs: number): number {
    if (this.lastValue === null) {
      this.lastValue = value;
      this.lastT = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
    const derivative = (value - this.lastValue) / dt;
    const dAlpha = OneEuroFilter.alpha(this.derivativeCutoff, dt);
    this.lastDerivative = dAlpha * derivative + (1 - dAlpha) * this.lastDerivative;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.lastDerivative);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.lastValue = a * value + (1 - a) * this.lastValue;
    this.lastT = tMs;
    return this.lastValue;
  }

  reset(): void {
    this.lastValue = null;
    this.lastDerivative = 0;
  }
}

function makeBank(): OneEuroFilter[][] {
  return Array.from({ length: LANDMARK_COUNT }, () => [
    new OneEuroFilter(),
    new OneEuroFilter(),
    new OneEuroFilter(),
  ]);
}

/** Сглаживает все 33 точки позы (картинка и мировые координаты). */
export class PoseSmoother {
  private image = makeBank();
  private world = makeBank();
  private lastT: number | null = null;

  /** После потери позы дольше этого времени фильтры начинают с нуля. */
  private static readonly GAP_MS = 1000;

  smooth(frame: PoseFrame): PoseFrame {
    if (this.lastT !== null && frame.t - this.lastT > PoseSmoother.GAP_MS) this.reset();
    this.lastT = frame.t;
    const apply = (points: Landmark[], bank: OneEuroFilter[][]): Landmark[] =>
      points.map((p, i) => {
        const f = bank[i];
        if (!f) return p;
        return {
          x: f[0]!.filter(p.x, frame.t),
          y: f[1]!.filter(p.y, frame.t),
          z: f[2]!.filter(p.z, frame.t),
          visibility: p.visibility,
        };
      });
    return {
      ...frame,
      landmarks: apply(frame.landmarks, this.image),
      world: frame.world ? apply(frame.world, this.world) : undefined,
    };
  }

  reset(): void {
    for (const bank of [this.image, this.world]) for (const f of bank) for (const x of f) x.reset();
    this.lastT = null;
  }
}
