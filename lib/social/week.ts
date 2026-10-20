import type { WorkoutSession } from "@/lib/data/types";
import { addDays, dayKey, startOfDay } from "@/lib/time";

/** Понедельник текущей недели ("YYYY-MM-DD"). */
export function weekKey(ts: number): string {
  const day = new Date(ts).getDay(); // 0 = воскресенье
  const sinceMonday = (day + 6) % 7;
  return dayKey(addDays(startOfDay(ts), -sinceMonday));
}

/** Сколько «чистых» повторений за неделю, которой принадлежит `now`. Секунды планки не считаются. */
export function weeklyClean(sessions: readonly WorkoutSession[], now: number): number {
  const key = weekKey(now);
  let total = 0;
  for (const s of sessions) {
    if (s.status !== "done") continue;
    if (weekKey(s.endedAt ?? s.startedAt) !== key) continue;
    for (const r of s.results) if (r.unit === "reps") total += r.clean;
  }
  return total;
}
