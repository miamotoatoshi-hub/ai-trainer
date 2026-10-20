import type { AgeBand, Harshness } from "@/lib/data/types";

/**
 * Жёсткость тренера по возрасту (раздел 10 ТЗ): 13–17 лет — не выше 2, третий уровень только с 18.
 * Пока возраст неизвестен, считаем пользователя младше 18.
 */
export function maxHarshness(ageBand: AgeBand | null): Harshness {
  return ageBand === "18+" ? 3 : 2;
}

export function clampHarshness(harshness: Harshness, ageBand: AgeBand | null): Harshness {
  return Math.min(harshness, maxHarshness(ageBand)) as Harshness;
}
