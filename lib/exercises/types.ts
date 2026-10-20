import type { ExerciseId } from "@/lib/data/types";
import type { PoseFrame } from "@/lib/pose/types";

/** Ошибки техники. Совпадают с событиями банка фраз тренера. */
export type ErrorCode =
  | "rep_shallow"
  | "knees_cave_in"
  | "torso_lean"
  | "too_fast"
  | "hips_sag"
  | "hips_high"
  | "knee_over_toe";

export type CounterEvent =
  /** Засчитанное повторение. */
  | {
      type: "rep";
      index: number;
      clean: boolean;
      errors: ErrorCode[];
      durationMs: number;
      /** Самый глубокий угол в повторе (для отладки). */
      depth: number;
    }
  /** Попытка с недостаточной глубиной: не засчитана, но замечена. */
  | { type: "shallow"; depth: number }
  /** Ошибка техники, замеченная прямо во время повтора (для мгновенной реакции тренера). */
  | { type: "error"; code: ErrorCode }
  /** Планка: ещё одна секунда удержания. */
  | { type: "second"; seconds: number; clean: boolean }
  /** Смена фазы движения (для интерфейса и отладки). */
  | { type: "phase"; phase: string };

export interface CounterSnapshot {
  exerciseId: ExerciseId;
  unit: "reps" | "sec";
  /** Засчитанные повторения (или секунды удержания). */
  total: number;
  clean: number;
  /** Неглубокие/неполные попытки. */
  shallow: number;
  /** Чистые повторы подряд сейчас и лучшая серия. */
  streak: number;
  bestStreak: number;
  errors: Record<string, number>;
  phase: string;
  /** Видно ли тело достаточно хорошо для счёта в последнем кадре. */
  visible: boolean;
  /** Главный измеряемый угол/величина (режим отладки). */
  measure: number | null;
  debug: Record<string, number>;
}

export interface ExerciseCounter {
  readonly id: ExerciseId;
  readonly unit: "reps" | "sec";
  update(frame: PoseFrame): CounterEvent[];
  snapshot(): CounterSnapshot;
  reset(): void;
}
