import { PhrasePicker } from "@/lib/coach/phrasePicker";
import { pickScripted } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import type {
  Emotion,
  ExerciseId,
  ExerciseResult,
  RelationshipLevel,
  SessionOutcome,
  UserCoach,
  WorkoutSession,
} from "@/lib/data/types";
import { RELATIONSHIP_CONFIG } from "@/lib/relationship/config";
import { applyEvents, eventsForWorkout } from "@/lib/relationship/engine";
import { dayKey, MINUTE, startOfDay } from "@/lib/time";
import { liftIgnoring } from "./ignoring";
import { matchScheduled } from "./schedule";
import { computeStreak } from "./streak";
import { applyUnlocks } from "./unlockService";
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

function levelUpLine(
  level: RelationshipLevel,
): "level_up_tolerates" | "level_up_respects" | "level_up_proud" | null {
  switch (level) {
    case "tolerates":
      return "level_up_tolerates";
    case "respects":
      return "level_up_respects";
    case "proud":
      return "level_up_proud";
    default:
      return null;
  }
}

/**
 * Подводит итог тренировки и обновляет всё, что от неё зависит: очки отношения (с потолком +15 в сутки
 * и буфером понижения), игнор (выход из него — только делом), расписание, личные рекорды,
 * серию дней и разблокировку тренеров. Только детерминированный код: нейросеть здесь не участвует.
 */
export async function finishWorkout(repo: Repository, input: FinishInput): Promise<WorkoutSession> {
  const { session, results, bestSets, recordsBeaten, status, durationSec, now } = input;
  const startedAt = now - durationSec * 1000;

  const [profile, coach, records, scheduled, sessions] = await Promise.all([
    repo.getProfile(),
    repo.getUserCoach(session.coachId),
    repo.listRecords(),
    repo.listScheduled(),
    repo.listSessions(),
  ]);

  // --- цифры и вердикт ---
  const total = totalUnits(results);
  const clean = results.reduce((s, r) => s + r.clean, 0);
  const shallow = results.reduce((s, r) => s + r.shallow, 0);
  const ratio = cleanRatio(results);
  const kind = verdictKind(ratio, total, status);
  const picker = new PhrasePicker({ coachId: session.coachId, harshness: profile.harshness });
  const picked = picker.pick(`verdict_${kind}`, now, { name: profile.name, count: total });

  // --- личные рекорды ---
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

  // --- расписание, серия, вовремя ли ---
  const matched = matchScheduled(scheduled, session.coachId, session.scheduledId, startedAt);
  const onTime =
    status === "done" &&
    matched !== null &&
    Math.abs(startedAt - matched.scheduledAt) <= RELATIONSHIP_CONFIG.onTimeWindowMin * MINUTE;
  const doneTimes = sessions
    .filter((s) => s.status === "done" && s.id !== session.id)
    .map((s) => s.endedAt ?? s.startedAt);
  if (status === "done") doneTimes.push(now);
  const streak = computeStreak(doneTimes, now);

  // --- отношение ---
  const events = eventsForWorkout({
    status,
    cleanRatio: ratio,
    personalRecord: recordsBeaten.length > 0,
    onTime,
    streakDays: streak,
  });
  const today = await repo.listRelationshipEvents(session.coachId, startOfDay(now));
  const gainedToday = today.reduce((sum, e) => sum + Math.max(0, e.delta), 0);
  const result = applyEvents({ score: coach.score, level: coach.level }, events, gainedToday);
  for (const e of result.applied) {
    await repo.addRelationshipEvent({
      coachId: session.coachId,
      type: e.type,
      delta: e.delta,
      rawDelta: e.raw,
      day: dayKey(now),
      createdAt: now,
    });
  }

  // Игнор снимается ТОЛЬКО завершённой тренировкой.
  const ignoreEnded = status === "done" && coach.state === "ignoring";
  let updated: UserCoach = {
    ...coach,
    score: result.state.score,
    level: result.state.level,
    lastInteractionAt: now,
    lastWorkoutAt: status === "done" ? now : coach.lastWorkoutAt,
  };
  if (ignoreEnded) updated = liftIgnoring(updated);
  await repo.putUserCoach(updated);

  // Запланированная тренировка закрыта: сделана или (если бросили) снята без второго штрафа за пропуск.
  if (matched)
    await repo.putScheduled({ ...matched, status: status === "done" ? "done" : "skipped" });

  const outcome: SessionOutcome = {
    scoreBefore: coach.score,
    scoreAfter: result.state.score,
    scoreDelta: result.state.score - coach.score,
    levelBefore: coach.level,
    levelAfter: result.state.level,
    levelUp: result.levelUp,
    capped: result.capped,
    events: result.applied.map((e) => ({ type: e.type, delta: e.delta })),
    verdictKind: kind,
    verdictText: picked?.text ?? "",
    verdictPhraseId: picked && !picked.phrase.template ? picked.phrase.id : undefined,
    emotion: verdictEmotion(kind),
    ignoreEnded,
    streak,
  };

  const finished: WorkoutSession = {
    ...session,
    status,
    startedAt,
    endedAt: now,
    scheduledId: matched?.id ?? session.scheduledId,
    totalReps: total,
    cleanReps: clean,
    shallowReps: shallow,
    bestStreak: Math.max(0, ...results.map((r) => r.bestStreak)),
    durationSec: Math.max(0, durationSec),
    results,
    personalRecords: recordsBeaten,
    outcome,
  };
  // Сначала сохраняем тренировку: разблокировка тренеров смотрит на историю.
  await repo.putSession(finished);

  const unlocked = status === "done" ? await applyUnlocks(repo, now + 5) : [];
  if (unlocked.length > 0) {
    finished.outcome = { ...outcome, unlockedCoaches: unlocked };
    await repo.putSession(finished);
  }

  // --- сообщения тренера в чате ---
  let tick = 0;
  const say = async (text: string, emotion: Emotion) => {
    if (!text) return;
    tick += 1;
    await repo.addMessage({
      coachId: session.coachId,
      sender: "coach",
      type: "text",
      text,
      emotion,
      durationSec: null,
      meta: { source: "scripted" },
      readAt: null,
      createdAt: now + tick,
    });
  };
  if (ignoreEnded)
    await say(pickScripted(session.coachId, "ignore_end", profile.harshness), "neutral");
  await say(outcome.verdictText, outcome.emotion);
  const line = result.levelUp ? levelUpLine(result.state.level) : null;
  if (line) await say(pickScripted(session.coachId, line, profile.harshness), "proud");
  if (status === "done" && streak === RELATIONSHIP_CONFIG.streakBonusDays) {
    await say(pickScripted(session.coachId, "streak7", profile.harshness), "proud");
  }

  return finished;
}
