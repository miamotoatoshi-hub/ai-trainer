import { addDays, dayKey, startOfDay } from "@/lib/time";

/**
 * Серия дней: сколько дней подряд была хотя бы одна завершённая тренировка.
 * Серия «жива», если последняя тренировка сегодня или вчера.
 */
export function computeStreak(workoutTimestamps: readonly number[], now: number): number {
  if (workoutTimestamps.length === 0) return 0;
  const days = new Set(workoutTimestamps.map((ts) => dayKey(ts)));

  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!days.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
