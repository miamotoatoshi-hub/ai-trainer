/** Все числа движка отношений — в одном месте (стартовые значения из ТЗ). */
export const RELATIONSHIP_CONFIG = {
  /** Начисления и штрафы. */
  deltas: {
    workoutCompleted: 6,
    cleanBonus: 3,
    personalRecord: 2,
    onTime: 1,
    streak7: 5,
    workoutAbandoned: -3,
    missedWorkout: -8,
    dayWithoutWorkout: -2,
    /** Извинения в чате: тренер не верит словам, только делу. */
    apology: 0,
  },
  /** Доля чистых повторов, с которой даётся бонус. */
  cleanThreshold: 0.8,
  /** «Вовремя» — не позже и не раньше чем на столько минут от плана. */
  onTimeWindowMin: 30,
  /** Потолок прироста в сутки (защита от накрутки). */
  maxGainPerDay: 15,
  /** Уровень вниз падает не мгновенно: ниже границы уровня должно стать на столько очков. */
  demotionBuffer: 3,
  /** Сколько очков в среднем даёт одна тренировка — для подсказки под шкалой. */
  typicalWorkoutGain: 6,
  /** Серия дней, за которую один раз даётся бонус. */
  streakBonusDays: 7,
  /** Сколько дней без тренировки можно пропустить, прежде чем пойдёт штраф за каждый следующий. */
  decayGraceDays: 1,
  minScore: 0,
  maxScore: 100,
} as const;

/** Границы уровней по очкам. */
export const LEVEL_RANGES = {
  despises: { min: 0, max: 24 },
  tolerates: { min: 25, max: 49 },
  respects: { min: 50, max: 79 },
  proud: { min: 80, max: 100 },
} as const;
