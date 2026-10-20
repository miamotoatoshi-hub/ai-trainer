/** Пороги углов для упражнения с «опусканием» (угол уменьшается вниз и растёт вверх). */
export interface RepThresholds {
  /** Угол меньше этого — началось опускание. */
  startAngle: number;
  /** Вернулся выше этого, не дойдя до низа, — попытка отменена. */
  abortAngle: number;
  /** Угол не меньше этого вверху — повторение завершено. */
  upAngle: number;
  /** Угол не больше этого внизу — глубина достигнута. */
  downAngle: number;
  /** Выше этого внизу — началось подъём (гистерезис, чтобы дрожание не давало ложных повторов). */
  releaseAngle: number;
  /** Дошёл до этого, но не до downAngle — «неглубоко». */
  shallowAngle: number;
  /** Быстрее этого — «слишком быстро». */
  minRepMs: number;
}

export type RepPhase = "up" | "descending" | "bottom" | "ascending";

export interface MachineResult {
  started?: boolean;
  completed?: { durationMs: number; depth: number };
  shallow?: { depth: number };
  aborted?: boolean;
}

/** На сколько градусов угол должен «отскочить» от минимума, чтобы считать, что человек пошёл вверх. */
const TURNAROUND_DEG = 10;

/**
 * Конечный автомат повторения: up → descending → bottom → ascending → up.
 * Не знает ни про тело, ни про камеру — только про число (угол) и время.
 */
export class RepMachine {
  phase: RepPhase = "up";
  private minAngle = 180;
  private startT = 0;
  private shallowReported = false;

  constructor(readonly cfg: RepThresholds) {}

  update(angle: number, t: number): MachineResult {
    const c = this.cfg;
    const out: MachineResult = {};

    if (this.phase !== "up") this.minAngle = Math.min(this.minAngle, angle);

    if (this.phase === "up" && angle < c.startAngle) {
      this.phase = "descending";
      this.minAngle = angle;
      this.startT = t;
      this.shallowReported = false;
      out.started = true;
    }

    if (this.phase === "descending") {
      if (angle <= c.downAngle) {
        this.phase = "bottom";
      } else if (
        !this.shallowReported &&
        this.minAngle <= c.shallowAngle &&
        angle - this.minAngle >= TURNAROUND_DEG
      ) {
        // Развернулся вверх, не дойдя до нужной глубины: «Ниже!» говорим сразу, не дожидаясь верха.
        this.shallowReported = true;
        out.shallow = { depth: this.minAngle };
      } else if (angle > c.abortAngle) {
        if (!this.shallowReported && this.minAngle <= c.shallowAngle) {
          out.shallow = { depth: this.minAngle };
        } else if (!this.shallowReported) {
          out.aborted = true;
        }
        this.phase = "up";
      }
    } else if (this.phase === "bottom") {
      if (angle > c.releaseAngle) this.phase = "ascending";
    } else if (this.phase === "ascending") {
      if (angle <= c.downAngle) {
        this.phase = "bottom";
      } else if (angle >= c.upAngle) {
        out.completed = { durationMs: t - this.startT, depth: this.minAngle };
        this.phase = "up";
      }
    }
    return out;
  }

  reset(): void {
    this.phase = "up";
    this.minAngle = 180;
    this.shallowReported = false;
  }
}

/** Ошибка засчитывается, только если держится несколько кадров подряд (защита от шума). */
export class ErrorGate {
  private counts = new Map<string, number>();

  /** true ровно один раз — в кадр, когда признак продержался `need` кадров подряд. */
  update(code: string, active: boolean, need: number): boolean {
    if (!active) {
      this.counts.set(code, 0);
      return false;
    }
    const n = (this.counts.get(code) ?? 0) + 1;
    this.counts.set(code, n);
    return n === need;
  }

  reset(): void {
    this.counts.clear();
  }
}
