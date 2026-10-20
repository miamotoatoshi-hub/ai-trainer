import type { Emotion, ExerciseResult } from "@/lib/data/types";

export type VerdictKind = "great" | "ok" | "bad";

/** Доля чистых: чистые / (засчитанные + неглубокие попытки). Неглубокие «весят», чтобы нельзя было набирать проценты халтурой. */
export function cleanRatio(results: readonly ExerciseResult[]): number {
  let clean = 0;
  let attempts = 0;
  for (const r of results) {
    clean += r.clean;
    attempts += r.total + r.shallow;
  }
  return attempts === 0 ? 0 : clean / attempts;
}

export const VERDICT_THRESHOLDS = { great: 0.8, ok: 0.5 } as const;

/** Вердикт по проценту чистых повторов. Прерванная тренировка выше «нормально» не бывает. */
export function verdictKind(
  ratio: number,
  totalUnits: number,
  status: "done" | "abandoned",
): VerdictKind {
  if (totalUnits === 0) return "bad";
  let kind: VerdictKind =
    ratio >= VERDICT_THRESHOLDS.great ? "great" : ratio >= VERDICT_THRESHOLDS.ok ? "ok" : "bad";
  if (status === "abandoned" && kind === "great") kind = "ok";
  return kind;
}

export function verdictEmotion(kind: VerdictKind): Emotion {
  switch (kind) {
    case "great":
      return "proud";
    case "ok":
      return "neutral";
    case "bad":
      return "contempt";
  }
}

export function totalUnits(results: readonly ExerciseResult[]): number {
  return results.reduce((sum, r) => sum + r.total, 0);
}
