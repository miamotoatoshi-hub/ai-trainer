import { PhrasePicker } from "@/lib/coach/phrasePicker";
import type { Repository } from "@/lib/data/repository";
import type { ExerciseId, ExerciseResult, SessionOutcome, WorkoutSession } from "@/lib/data/types";
import { cleanRatio, totalUnits, verdictEmotion, verdictKind } from "./verdict";

export interface FinishInput {
  session: WorkoutSession;
  results: ExerciseResult[];
  /** Лучший подход по упражнениям в этой тренировке. */
  bestSets: Partial<Record<ExerciseId, number>>;
  /** Упражнения, где побит прежний рекорд. */
  recordsBeaten: ExerciseId[];
  status: "done" | "abandoned";
  /** Длительность самой тренировки в секундах (без пауз и настройки камеры). */
  durationSec: number;
  now: number;
}

/**
 * Подводит итог тренировки: считает цифры, выносит вердикт тренера, обновляет личные рекорды
 * и сохраняет всё в запись о тренировке. Только детерминированный код: нейросеть здесь не участвует.
 */
export async function finishWorkout(repo: Repository, input: FinishInput): Promise<WorkoutSession> {
  const { session, results, bestSets, recordsBeaten, status, durationSec, now } = input;
  const [profile, coach, records] = await Promise.all([
    repo.getProfile(),
    repo.getUserCoach(session.coachId),
    repo.listRecords(),
  ]);

  const total = totalUnits(results);
  const clean = results.reduce((s, r) => s + r.clean, 0);
  const shallow = results.reduce((s, r) => s + r.shallow, 0);
  const ratio = cleanRatio(results);
  const kind = verdictKind(ratio, total, status);

  const picker = new PhrasePicker({ coachId: session.coachId, harshness: profile.harshness });
  const picked = picker.pick(`verdict_${kind}`, now, { name: profile.name, count: total });

  for (const [exerciseId, value] of Object.entries(bestSets) as [ExerciseId, number][]) {
    const previous = records.find((r) => r.exerciseId === exerciseId);
    if (value > (previous?.bestTotal ?? 0)) {
      const result = results.find((r) => r.exerciseId === exerciseId);
      await repo.putRecord({
        exerciseId,
        bestTotal: value,
        bestClean: Math.min(value, result?.clean ?? 0),
        updatedAt: now,
      });
    }
  }

  const outcome: SessionOutcome = {
    scoreBefore: coach.score,
    scoreAfter: coach.score,
    scoreDelta: 0,
    levelBefore: coach.level,
    levelAfter: coach.level,
    levelUp: false,
    capped: false,
    events: [],
    verdictKind: kind,
    verdictText: picked?.text ?? "",
    verdictPhraseId: picked && !picked.phrase.template ? picked.phrase.id : undefined,
    emotion: verdictEmotion(kind),
    ignoreEnded: false,
    streak: 0,
  };

  const finished: WorkoutSession = {
    ...session,
    status,
    // Начало — когда тренировка реально пошла, а не когда открыли экран звонка.
    startedAt: now - durationSec * 1000,
    endedAt: now,
    totalReps: total,
    cleanReps: clean,
    shallowReps: shallow,
    bestStreak: Math.max(0, ...results.map((r) => r.bestStreak)),
    durationSec: Math.max(0, durationSec),
    results,
    personalRecords: recordsBeaten,
    outcome,
  };
  await repo.putSession(finished);
  return finished;
}
