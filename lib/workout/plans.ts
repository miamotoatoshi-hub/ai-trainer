import core10 from "@/content/plans/core-10.json";
import firstSquats from "@/content/plans/first-squats.json";
import legs20 from "@/content/plans/legs-20.json";
import quickCheck from "@/content/plans/quick-check.json";
import upper15 from "@/content/plans/upper-15.json";
import { EXERCISE_IDS, type ExerciseId } from "@/lib/data/types";
import { t, tUnit } from "@/lib/i18n";

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

export type FreePreset = "quick" | "standard";

/** Сколько на подход в свободной тренировке (повторения или секунды удержания). */
const FREE_TARGETS: Record<ExerciseId, { reps?: number; seconds?: number }> = {
  squat: { reps: 10 },
  pushup: { reps: 8 },
  lunge: { reps: 8 },
  plank: { seconds: 30 },
  jumping_jack: { reps: 20 },
};

const FREE_SETS: Record<FreePreset, number> = { quick: 1, standard: 3 };
const FREE_REST_SEC = 30;

/** Свободная тренировка: одно упражнение, один или три подхода. Адрес вида `free:squat:standard`. */
export function freePlanId(exercise: ExerciseId, preset: FreePreset): string {
  return `free:${exercise}:${preset}`;
}

/** Дуэль: максимум чистых повторений за N секунд. Адрес вида `duel:squat:60`. */
export function duelPlanId(exercise: ExerciseId, seconds: number): string {
  return `duel:${exercise}:${seconds}`;
}

function isExercise(value: string): value is ExerciseId {
  return (EXERCISE_IDS as readonly string[]).includes(value);
}

/** Собирает план «на лету» из адреса free:/duel:. null — адрес не похож на такой план. */
function dynamicPlan(id: string): WorkoutPlan | null {
  const [kind, exercise, param] = id.split(":");
  if (!exercise || !param || !isExercise(exercise)) return null;
  const name = t(`exercises.${exercise}.name`);
  if (kind === "free" && (param === "quick" || param === "standard")) {
    const sets = FREE_SETS[param];
    const target = FREE_TARGETS[exercise];
    const perSet = target.seconds ?? 40;
    return {
      id,
      title: `${name}. ${sets} ${tUnit("plural.sets", sets)}.`,
      cardTitle: `${t("workouts.freeCard")}: ${name.toLowerCase()}`,
      durationMin: Math.max(1, Math.round((sets * perSet + (sets - 1) * FREE_REST_SEC) / 60)),
      blocks: [{ kind: "sets", exercise, sets, ...target, restSec: FREE_REST_SEC }],
    };
  }
  if (kind === "duel") {
    const seconds = Number(param);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180) return null;
    return {
      id,
      title: t("duel.planTitle", { exercise: name, n: seconds }),
      cardTitle: t("duel.cardTitle"),
      durationMin: Math.max(1, Math.ceil(seconds / 60)),
      blocks: [{ kind: "sets", exercise, sets: 1, seconds, restSec: 0 }],
    };
  }
  return null;
}

export function getPlan(id: string): WorkoutPlan {
  return PLANS[id] ?? dynamicPlan(id) ?? PLANS[DEFAULT_PLAN_ID]!;
}

/** Какие упражнения встречаются в плане (по порядку, без повторов). */
export function planExercises(plan: WorkoutPlan): ExerciseId[] {
  return [...new Set(plan.blocks.map((b) => b.exercise))];
}
