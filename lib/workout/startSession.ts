import type { CoachId, WorkoutSession } from "@/lib/data/types";
import type { Repository } from "@/lib/data/repository";

interface StartOptions {
  coachId: CoachId;
  planId: string;
  scheduledId?: string | null;
  mode?: WorkoutSession["mode"];
}

/** Создаёт запись о тренировке (статус «идёт») и возвращает её id для адреса /call/[id]. */
export async function startWorkoutSession(
  repo: Repository,
  { coachId, planId, scheduledId = null, mode = "plan" }: StartOptions,
  now: number = Date.now(),
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  await repo.putSession({
    id,
    coachId,
    planId,
    mode,
    startedAt: now,
    endedAt: null,
    status: "active",
    scheduledId,
    totalReps: 0,
    cleanReps: 0,
    shallowReps: 0,
    bestStreak: 0,
    durationSec: 0,
    results: [],
    personalRecords: [],
    outcome: null,
  });
  return id;
}
