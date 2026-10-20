import core10 from "@/content/plans/core-10.json";
import firstSquats from "@/content/plans/first-squats.json";
import legs20 from "@/content/plans/legs-20.json";
import quickCheck from "@/content/plans/quick-check.json";
import upper15 from "@/content/plans/upper-15.json";
import type { ExerciseId } from "@/lib/data/types";

/** Блок плана. warmup/finisher — по времени; sets — подходы с повторениями или удержанием. */
export type PlanBlock =
  | { kind: "warmup" | "finisher"; exercise: ExerciseId; seconds: number }
  | {
      kind: "sets";
      exercise: ExerciseId;
      sets: number;
      reps?: number;
      seconds?: number;
      restSec: number;
    };

export interface WorkoutPlan {
  id: string;
  title: string;
  cardTitle: string;
  durationMin: number;
  blocks: PlanBlock[];
}

const ALL: WorkoutPlan[] = [
  legs20 as unknown as WorkoutPlan,
  upper15 as unknown as WorkoutPlan,
  core10 as unknown as WorkoutPlan,
  firstSquats as unknown as WorkoutPlan,
  quickCheck as unknown as WorkoutPlan,
];

export const PLANS: Record<string, WorkoutPlan> = Object.fromEntries(ALL.map((p) => [p.id, p]));

/** Планы, которые можно выбрать в расписании. */
export const SCHEDULABLE_PLAN_IDS = ["legs-20", "upper-15", "core-10"] as const;

export const DEFAULT_PLAN_ID = "legs-20";

export function getPlan(id: string): WorkoutPlan {
  return PLANS[id] ?? PLANS[DEFAULT_PLAN_ID]!;
}

/** Какие упражнения встречаются в плане (по порядку, без повторов). */
export function planExercises(plan: WorkoutPlan): ExerciseId[] {
  return [...new Set(plan.blocks.map((b) => b.exercise))];
}
