import { t } from "@/lib/i18n";
import type { ExerciseId } from "@/lib/data/types";
import type { RunnerView } from "./runner";

export function exerciseName(id: ExerciseId): string {
  return t(`exercises.${id}.name`);
}

export interface StepLabels {
  /** «Приседания · подход 1 из 3» */
  caption: string | null;
  /** «из 10», «осталось 22 с» или null */
  targetLabel: string | null;
  /** Во время отдыха: «Дальше: Выпады» */
  restNext: string | null;
  /** Подсказка, как встать (во время отдыха). */
  restHint: string | null;
}

/** Подписи на экране звонка для текущего шага тренировки. */
export function stepLabels(view: RunnerView): StepLabels {
  const { step } = view;
  if (!step) return { caption: null, targetLabel: null, restNext: null, restHint: null };
  const exercise = exerciseName(step.exercise);

  if (step.kind === "rest") {
    return {
      caption: t("call.step.rest"),
      targetLabel: null,
      restNext: t("call.step.next", { exercise }),
      restHint: t(`exercises.${step.exercise}.hint`),
    };
  }

  let caption: string;
  if (step.kind === "warmup") caption = t("call.step.warmup", { exercise });
  else if (step.kind === "finisher") caption = t("call.step.finisher", { exercise });
  else if (step.setsTotal > 1) {
    caption = t("call.step.set", { exercise, n: step.setIndex + 1, total: step.setsTotal });
  } else caption = t("call.step.setSingle", { exercise });

  let targetLabel: string | null = null;
  if (step.reps !== undefined) targetLabel = t("call.step.targetReps", { n: step.reps });
  else if (view.timeLeftSec !== null)
    targetLabel = t("call.step.timeLeft", { n: view.timeLeftSec });
  else if (view.unit === "sec" && step.seconds !== undefined) {
    targetLabel = t("call.step.targetSec", { n: step.seconds });
  }
  return { caption, targetLabel, restNext: null, restHint: null };
}
