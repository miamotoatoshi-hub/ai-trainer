import type { RelationshipLevel } from "@/lib/data/types";
import { addDays, dayKey, daysBetween, startOfDay } from "@/lib/time";
import { LEVEL_RANGES, RELATIONSHIP_CONFIG } from "./config";
import { levelFromScore, levelIndex } from "./levels";

/**
 * Движок отношений — только детерминированный код. Нейросеть очки не меняет и не придумывает:
 * она лишь получает текущий уровень как контекст.
 */

export type RelationshipEventType =
  | "workout_completed"
  | "clean_bonus"
  | "personal_record"
  | "on_time"
  | "streak_7"
  | "workout_abandoned"
  | "missed_workout"
  | "day_without_workout"
  | "apology";

export interface ScoredEvent {
  type: RelationshipEventType;
  /** Сколько очков положено по таблице (до потолка за сутки и границ 0..100). */
  raw: number;
}

export interface AppliedEvent extends ScoredEvent {
  /** Сколько очков реально применено. */
  delta: number;
}

export interface RelationshipState {
  score: number;
  level: RelationshipLevel;
}

const D = RELATIONSHIP_CONFIG.deltas;

export function clampScore(score: number): number {
  return Math.min(RELATIONSHIP_CONFIG.maxScore, Math.max(RELATIONSHIP_CONFIG.minScore, score));
}

/**
 * Новый уровень после изменения очков. Вверх — сразу; вниз — только когда очки ушли ниже границы
 * текущего уровня больше чем на «буфер» (3 очка), чтобы уровень не дёргался туда-сюда.
 */
export function resolveLevel(previous: RelationshipLevel, score: number): RelationshipLevel {
  const byScore = levelFromScore(score);
  if (levelIndex(byScore) >= levelIndex(previous)) return byScore;
  const floor = LEVEL_RANGES[previous].min - RELATIONSHIP_CONFIG.demotionBuffer;
  return score < floor ? byScore : previous;
}

export interface WorkoutOutcomeInput {
  status: "done" | "abandoned";
  /** Доля чистых повторов 0..1. */
  cleanRatio: number;
  /** Побит прежний личный рекорд. */
  personalRecord: boolean;
  /** Начата в запланированное время (±30 минут). */
  onTime: boolean;
  /** Длина серии дней после этой тренировки. */
  streakDays: number;
}

/** События отношения за одну тренировку, в порядке начисления. */
export function eventsForWorkout(input: WorkoutOutcomeInput): ScoredEvent[] {
  if (input.status === "abandoned") return [{ type: "workout_abandoned", raw: D.workoutAbandoned }];
  const events: ScoredEvent[] = [{ type: "workout_completed", raw: D.workoutCompleted }];
  if (input.cleanRatio >= RELATIONSHIP_CONFIG.cleanThreshold) {
    events.push({ type: "clean_bonus", raw: D.cleanBonus });
  }
  if (input.personalRecord) events.push({ type: "personal_record", raw: D.personalRecord });
  if (input.onTime) events.push({ type: "on_time", raw: D.onTime });
  // Бонус за серию — разово, в день, когда серия дошла ровно до 7.
  if (input.streakDays === RELATIONSHIP_CONFIG.streakBonusDays) {
    events.push({ type: "streak_7", raw: D.streak7 });
  }
  return events;
}

export interface ApplyResult {
  state: RelationshipState;
  applied: AppliedEvent[];
  /** Потолок прироста в сутки обрезал часть очков. */
  capped: boolean;
  levelUp: boolean;
  levelDown: boolean;
  /** Сколько положительных очков за сутки набрано после применения. */
  gainedToday: number;
}

/**
 * Применяет события к состоянию. Начисления ограничены потолком +15 в сутки
 * (защита от накрутки), штрафы потолком не ограничены. Очки держатся в границах 0..100.
 */
export function applyEvents(
  state: RelationshipState,
  events: readonly ScoredEvent[],
  gainedToday: number,
): ApplyResult {
  let score = state.score;
  let gained = gainedToday;
  let capped = false;
  const applied: AppliedEvent[] = [];

  for (const event of events) {
    let delta = event.raw;
    if (delta > 0) {
      const room = Math.max(0, RELATIONSHIP_CONFIG.maxGainPerDay - gained);
      if (delta > room) {
        delta = room;
        capped = true;
      }
    }
    const next = clampScore(score + delta);
    delta = next - score;
    if (delta > 0) gained += delta;
    score = next;
    applied.push({ ...event, delta });
  }

  const level = resolveLevel(state.level, score);
  return {
    state: { score, level },
    applied,
    capped,
    levelUp: levelIndex(level) > levelIndex(state.level),
    levelDown: levelIndex(level) < levelIndex(state.level),
    gainedToday: gained,
  };
}

/**
 * За какие дни ещё не начислен штраф «день без тренировки».
 * Первый день без тренировки — льгота (decayGraceDays), штраф идёт со следующего и дальше по −2 за день.
 */
export function daysToCharge(
  lastWorkoutTs: number,
  lastChargedDay: string | null,
  nowTs: number,
): string[] {
  const days: string[] = [];
  const since = daysBetween(lastWorkoutTs, nowTs);
  for (let offset = RELATIONSHIP_CONFIG.decayGraceDays + 1; offset <= since; offset += 1) {
    const day = dayKey(addDays(startOfDay(lastWorkoutTs), offset));
    if (lastChargedDay === null || day > lastChargedDay) days.push(day);
  }
  return days;
}

/** Штрафные события за перечисленные дни. */
export function decayEvents(days: readonly string[]): ScoredEvent[] {
  return days.map(() => ({ type: "day_without_workout" as const, raw: D.dayWithoutWorkout }));
}
