import type { ExerciseId } from "@/lib/data/types";
import { JumpingJackCounter } from "./jumpingJack";
import { LungeCounter } from "./lunge";
import { PlankCounter } from "./plank";
import { PushupCounter } from "./pushup";
import { SquatCounter } from "./squat";
import type { ErrorCode, ExerciseCounter } from "./types";

/** Описание упражнения как данных: ракурс, единицы, возможные ошибки. Названия — в locales/ru.json. */
export interface ExerciseDefinition {
  id: ExerciseId;
  unit: "reps" | "sec";
  /** Как ставить телефон: лицом к камере или боком. */
  view: "front" | "side";
  errors: readonly ErrorCode[];
  create: () => ExerciseCounter;
}

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  squat: {
    id: "squat",
    unit: "reps",
    view: "front",
    errors: ["rep_shallow", "knees_cave_in", "torso_lean", "too_fast"],
    create: () => new SquatCounter(),
  },
  pushup: {
    id: "pushup",
    unit: "reps",
    view: "side",
    errors: ["rep_shallow", "hips_sag", "hips_high", "too_fast"],
    create: () => new PushupCounter(),
  },
  lunge: {
    id: "lunge",
    unit: "reps",
    view: "side",
    errors: ["rep_shallow", "knee_over_toe", "too_fast"],
    create: () => new LungeCounter(),
  },
  plank: {
    id: "plank",
    unit: "sec",
    view: "side",
    errors: ["hips_sag", "hips_high"],
    create: () => new PlankCounter(),
  },
  jumping_jack: {
    id: "jumping_jack",
    unit: "reps",
    view: "front",
    errors: ["rep_shallow"],
    create: () => new JumpingJackCounter(),
  },
};

export function createCounter(id: ExerciseId): ExerciseCounter {
  return EXERCISES[id].create();
}

export type { CounterEvent, CounterSnapshot, ErrorCode, ExerciseCounter } from "./types";
