import { LEVELS, type RelationshipLevel } from "@/lib/data/types";
import { LEVEL_RANGES, RELATIONSHIP_CONFIG } from "./config";

export function levelFromScore(score: number): RelationshipLevel {
  if (score >= LEVEL_RANGES.proud.min) return "proud";
  if (score >= LEVEL_RANGES.respects.min) return "respects";
  if (score >= LEVEL_RANGES.tolerates.min) return "tolerates";
  return "despises";
}

export function levelIndex(level: RelationshipLevel): number {
  return LEVELS.indexOf(level);
}

export function nextLevel(level: RelationshipLevel): RelationshipLevel | null {
  return LEVELS[levelIndex(level) + 1] ?? null;
}

/** Какая часть сегмента шкалы заполнена (0..1) для текущего уровня. */
export function levelProgress(score: number, level: RelationshipLevel): number {
  const { min, max } = LEVEL_RANGES[level];
  // У обычных уровней следующий начинается с max+1; у последнего шкала должна дойти до 100%.
  const span = nextLevel(level) ? max + 1 - min : max - min;
  return Math.min(1, Math.max(0, (score - min) / span));
}

/** Сколько очков осталось до следующего уровня (null — выше некуда). */
export function pointsToNextLevel(score: number, level: RelationshipLevel): number | null {
  const next = nextLevel(level);
  if (!next) return null;
  return Math.max(0, LEVEL_RANGES[next].min - score);
}

/** Сколько обычных тренировок осталось до следующего уровня (для подсказки под шкалой). */
export function workoutsToNextLevel(score: number, level: RelationshipLevel): number | null {
  const points = pointsToNextLevel(score, level);
  if (points === null) return null;
  return Math.max(1, Math.ceil(points / RELATIONSHIP_CONFIG.typicalWorkoutGain));
}
