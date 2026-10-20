import type { RelationshipLevel } from "@/lib/data/types";
import { t, tUnit } from "@/lib/i18n";
import { nextLevel, workoutsToNextLevel } from "./levels";

interface HintInput {
  level: RelationshipLevel;
  score: number;
  ignoring: boolean;
  gender: "m" | "f";
}

/** Подсказка под шкалой: «Ещё 3 тренировки без пропусков — и он начнёт тебя терпеть». */
export function levelHint({ level, score, ignoring, gender }: HintInput): string {
  if (ignoring) return t("chat.levelHint.ignoring");
  const who = gender === "f" ? t("common.she") : t("common.he");
  const next = nextLevel(level);
  const workouts = workoutsToNextLevel(score, level);
  if (!next || workouts === null) return t("chat.levelHint.max", { who });
  const unit = tUnit("plural.workouts", workouts);
  switch (next) {
    case "tolerates":
      return t("chat.levelHint.tolerates", { n: workouts, unit, who });
    case "respects":
      return t("chat.levelHint.respects", { n: workouts, unit, who });
    default:
      return t("chat.levelHint.proud", { n: workouts, unit, who });
  }
}
