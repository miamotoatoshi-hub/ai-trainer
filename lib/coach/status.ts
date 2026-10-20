import type { UserCoach } from "@/lib/data/types";
import { formatAgo } from "@/lib/format";
import { t } from "@/lib/i18n";
import { HOUR } from "@/lib/time";
import { getCoach } from "./coaches";

export type PendingKind = "typing" | "recording" | null;

interface StatusInput {
  userCoach: UserCoach;
  now: number;
  /** Есть ли у этого тренера плановая тренировка в ближайшее время. */
  waitingForWorkout: boolean;
  pending?: PendingKind;
}

/** Строка статуса в шапке чата: «в сети · ждёт тебя», «печатает…», «был 3 часа назад». */
export function coachStatusText({
  userCoach,
  now,
  waitingForWorkout,
  pending,
}: StatusInput): string {
  const meta = getCoach(userCoach.coachId);
  if (pending === "typing") return t("chat.typing");
  if (pending === "recording") return t("chat.recording");
  if (userCoach.state === "ignoring") return meta.status.ignoring;
  if (waitingForWorkout) return meta.status.waiting;
  const last = userCoach.lastInteractionAt;
  if (last !== null && now - last >= 2 * HOUR) {
    return meta.status.away.replace("{when}", formatAgo(last, now));
  }
  return meta.status.busy;
}

/** Показывать ли точку «в сети» на аватаре. */
export function isOnline(userCoach: UserCoach, waitingForWorkout: boolean): boolean {
  return userCoach.unlocked && (userCoach.state !== "ignoring" || waitingForWorkout);
}
