import type { Emotion, UserCoach } from "@/lib/data/types";

/** Настроение тренера по умолчанию — зависит от отношения к пользователю. */
export function coachMood(coach: Pick<UserCoach, "state" | "level">): Emotion {
  if (coach.state === "ignoring") return "contempt";
  switch (coach.level) {
    case "despises":
      return "angry";
    case "tolerates":
      return "neutral";
    case "respects":
      return "neutral";
    case "proud":
      return "proud";
  }
}
