import type { ScheduledWorkout } from "@/lib/data/types";
import { MINUTE } from "@/lib/time";

/** Окно, в течение которого ещё можно начать плановую тренировку после её времени. */
export const WORKOUT_GRACE_MS = 30 * MINUTE;

/** Ближайшая плановая тренировка: ещё не наступила или наступила не больше 30 минут назад. */
export function pickNextWorkout(
  scheduled: readonly ScheduledWorkout[],
  now: number,
): ScheduledWorkout | null {
  const upcoming = scheduled
    .filter((s) => s.status === "planned" && s.scheduledAt >= now - WORKOUT_GRACE_MS)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
  return upcoming[0] ?? null;
}
