import { COACH_IDS, type CoachId, type UserCoach } from "@/lib/data/types";
import { getCoach } from "@/lib/coach/coaches";
import { t, tUnit } from "@/lib/i18n";
import { levelIndex } from "@/lib/relationship/levels";

/** Серия дней, открывающая Макса. */
export const UNLOCK_STREAK_DAYS = 7;

/**
 * Кто должен быть открыт по правилам:
 * Громов — сразу; Марина — «Терпит» с Громовым; Палыч — «Уважает» с любым; Макс — серия 7 дней.
 * Открытый тренер остаётся открытым (за этим следит вызывающий код).
 */
export function unlockedByRules(coaches: readonly UserCoach[], streak: number): CoachId[] {
  const ids: CoachId[] = ["gromov"];
  const gromov = coaches.find((c) => c.coachId === "gromov");
  if (gromov && levelIndex(gromov.level) >= levelIndex("tolerates")) ids.push("marina");
  if (coaches.some((c) => levelIndex(c.level) >= levelIndex("respects"))) ids.push("palych");
  if (streak >= UNLOCK_STREAK_DAYS) ids.push("max");
  return ids;
}

/** Подсказка «Откроется, когда…» для закрытого тренера. */
export function unlockHint(coachId: CoachId): string {
  switch (coachId) {
    case "marina":
      return t("unlock.marina", { coach: getCoach("gromov").name });
    case "palych":
      return t("unlock.palych");
    case "max":
      return t("unlock.max", {
        n: UNLOCK_STREAK_DAYS,
        unit: tUnit("plural.days", UNLOCK_STREAK_DAYS),
      });
    default:
      return "";
  }
}

/** Первый ещё закрытый тренер в порядке открытия. */
export function nextLockedCoach(coaches: readonly UserCoach[]): CoachId | null {
  for (const id of COACH_IDS) {
    const row = coaches.find((c) => c.coachId === id);
    if (row && !row.unlocked) return id;
  }
  return null;
}
