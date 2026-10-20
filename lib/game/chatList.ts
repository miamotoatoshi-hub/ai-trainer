import { getCoach } from "@/lib/coach/coaches";
import { isOnline } from "@/lib/coach/status";
import type { CoachId, CoachState, Message, RelationshipLevel, UserCoach } from "@/lib/data/types";
import { formatListTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { formatClock, formatDuration } from "@/lib/time";
import { getPlan } from "@/lib/workout/plans";

export type PreviewKind = "text" | "voice" | "card" | "empty";

export interface ChatListItem {
  coachId: CoachId;
  name: string;
  state: CoachState;
  level: RelationshipLevel;
  online: boolean;
  preview: { kind: PreviewKind; text: string; mine: boolean; read: boolean };
  timeLabel: string;
  unread: number;
  /** Последнее сообщение — моё, а тренер игнорирует: «без ответа». */
  noAnswer: boolean;
  lastAt: number;
}

function buildPreview(message: Message | undefined): ChatListItem["preview"] {
  if (!message) return { kind: "empty", text: t("home.noMessages"), mine: false, read: false };
  const mine = message.sender === "user";
  const read = message.readAt !== null;
  if (message.type === "voice") {
    const text = t("chat.voiceWithTime", { time: formatDuration(message.durationSec ?? 0) });
    return { kind: "voice", text, mine, read };
  }
  if (message.type === "workout_card") {
    const plan = getPlan(message.meta.planId ?? "");
    const time = message.meta.scheduledAt ? formatClock(message.meta.scheduledAt) : "";
    return {
      kind: "card",
      text: t("chat.workoutPreview", { title: plan.cardTitle, time }).replace(/ · $/, ""),
      mine,
      read,
    };
  }
  return { kind: "text", text: message.text, mine, read };
}

interface BuildInput {
  coaches: readonly UserCoach[];
  lastMessages: Partial<Record<CoachId, Message>>;
  unread: Partial<Record<CoachId, number>>;
  /** Тренеры, у которых запланирована тренировка в ближайшее время. */
  waiting: ReadonlySet<CoachId>;
  now: number;
}

/** Строки списка чатов: сначала с непрочитанными, потом по времени последнего сообщения. */
export function buildChatList({
  coaches,
  lastMessages,
  unread,
  waiting,
  now,
}: BuildInput): ChatListItem[] {
  const items = coaches
    .filter((c) => c.unlocked)
    .map<ChatListItem>((c) => {
      const last = lastMessages[c.coachId];
      const preview = buildPreview(last);
      return {
        coachId: c.coachId,
        name: getCoach(c.coachId).name,
        state: c.state,
        level: c.level,
        online: isOnline(c, waiting.has(c.coachId)),
        preview,
        timeLabel: last ? formatListTime(last.createdAt, now) : "",
        unread: unread[c.coachId] ?? 0,
        noAnswer: c.state === "ignoring" && preview.mine,
        lastAt: last?.createdAt ?? 0,
      };
    });
  return items.sort((a, b) => {
    if (a.unread > 0 !== b.unread > 0) return a.unread > 0 ? -1 : 1;
    return b.lastAt - a.lastAt;
  });
}
