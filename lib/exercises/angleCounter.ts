import type { ExerciseId } from "@/lib/data/types";
import type { PoseFrame } from "@/lib/pose/types";
import { ErrorGate, RepMachine, type RepThresholds } from "./repMachine";
import type { CounterEvent, CounterSnapshot, ErrorCode, ExerciseCounter } from "./types";

/** Сколько кадров подряд ошибка должна держаться, чтобы считаться ошибкой. */
export const ERROR_FRAMES = 4;

/**
 * Основа для упражнений с повторениями, где главное — один угол (колено, локоть).
 * Наследник говорит, как измерить угол и какие ошибки сейчас «активны».
 */
export abstract class AngleRepCounter implements ExerciseCounter {
  readonly unit = "reps" as const;
  protected readonly machine: RepMachine;
  private readonly gate = new ErrorGate();
  private repErrors = new Set<ErrorCode>();
  private total = 0;
  private clean = 0;
  private shallow = 0;
  private streak = 0;
  private bestStreak = 0;
  private errors: Record<string, number> = {};
  private visible = false;
  private lastMeasure: number | null = null;
  protected debug: Record<string, number> = {};

  constructor(
    readonly id: ExerciseId,
    thresholds: RepThresholds,
    /** Какие ошибки вообще отслеживаются этим упражнением. */
    private readonly watched: readonly ErrorCode[],
  ) {
    this.machine = new RepMachine(thresholds);
  }

  /** Главный угол в кадре; null — тело не видно достаточно хорошо. */
  protected abstract measure(frame: PoseFrame): number | null;

  /** Какие ошибки техники видны в этом кадре (во время повторения). */
  protected abstract activeErrors(frame: PoseFrame, angle: number): ReadonlySet<ErrorCode>;

  update(frame: PoseFrame): CounterEvent[] {
    const events: CounterEvent[] = [];
    this.debug = {};
    const angle = this.measure(frame);
    this.lastMeasure = angle;
    if (angle === null) {
      this.visible = false;
      return events;
    }
    this.visible = true;

    const before = this.machine.phase;
    const result = this.machine.update(angle, frame.t);

    if (result.started) {
      this.repErrors = new Set();
      this.gate.reset();
    }

    if (this.machine.phase !== "up" || result.completed || result.shallow) {
      const active = this.activeErrors(frame, angle);
      for (const code of this.watched) {
        if (this.gate.update(code, active.has(code), ERROR_FRAMES) && !this.repErrors.has(code)) {
          this.repErrors.add(code);
          events.push({ type: "error", code });
        }
      }
    }

    if (result.shallow) {
      this.shallow += 1;
      this.streak = 0;
      this.errors.rep_shallow = (this.errors.rep_shallow ?? 0) + 1;
      events.push({ type: "shallow", depth: result.shallow.depth });
    }

    if (result.completed) {
      const { durationMs, depth } = result.completed;
      if (durationMs < this.machine.cfg.minRepMs && this.watched.includes("too_fast")) {
        this.repErrors.add("too_fast");
        events.push({ type: "error", code: "too_fast" });
      }
      const clean = this.repErrors.size === 0;
      this.total += 1;
      if (clean) {
        this.clean += 1;
        this.streak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
      } else {
        this.streak = 0;
      }
      for (const code of this.repErrors) this.errors[code] = (this.errors[code] ?? 0) + 1;
      events.push({
        type: "rep",
        index: this.total,
        clean,
        errors: [...this.repErrors],
        durationMs,
        depth,
      });
      this.repErrors = new Set();
    }

    if (this.machine.phase !== before) events.push({ type: "phase", phase: this.machine.phase });
    return events;
  }

  snapshot(): CounterSnapshot {
    return {
      exerciseId: this.id,
      unit: this.unit,
      total: this.total,
      clean: this.clean,
      shallow: this.shallow,
      streak: this.streak,
      bestStreak: this.bestStreak,
      errors: { ...this.errors },
      phase: this.machine.phase,
      visible: this.visible,
      measure: this.lastMeasure,
      debug: { ...this.debug },
    };
  }

  reset(): void {
    this.machine.reset();
    this.gate.reset();
    this.repErrors = new Set();
    this.total = 0;
    this.clean = 0;
    this.shallow = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.errors = {};
    this.visible = false;
    this.lastMeasure = null;
  }
}
