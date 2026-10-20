import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import type { ChatListItem } from "@/lib/game/chatList";
import { t } from "@/lib/i18n";

/** Строка списка чатов: аватар, имя, бейдж отношения, превью, время, счётчик. */
export function ChatRow({ item }: { item: ChatListItem }) {
  const unread = item.unread > 0;
  const { preview } = item;
  return (
    <li>
      <Link
        href={`/chat/${item.coachId}`}
        aria-label={t("home.openChat", { name: item.name })}
        className={`flex min-h-[72px] items-center gap-3 rounded-row px-3 py-[9px] ${
          unread ? "bg-surface" : ""
        }`}
      >
        <CoachAvatar coachId={item.coachId} size={54} online={item.online} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] leading-tight font-extrabold">{item.name}</span>
            <Badge kind={item.state === "ignoring" ? "ignoring" : item.level} />
          </span>
          <span
            className={`flex items-center gap-1.5 text-[14px] leading-tight ${
              unread ? "font-bold text-ink" : "font-semibold text-muted"
            }`}
          >
            {preview.mine ? (
              <>
                <Icon
                  name="checks"
                  size={16}
                  className={preview.read ? "text-accent" : "text-muted"}
                />
                <span className="shrink-0">{t("chat.youPrefix").trim()}</span>
              </>
            ) : null}
            {preview.kind === "voice" ? <Icon name="mic" size={15} className="shrink-0" /> : null}
            {preview.kind === "card" ? (
              <Icon name="dumbbell" size={15} className="shrink-0" />
            ) : null}
            <span className="truncate">{preview.text}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 self-stretch py-0.5">
          <span
            className={`text-[12px] leading-none font-bold ${unread ? "text-accent" : "text-muted"}`}
          >
            {item.timeLabel}
          </span>
          {unread ? (
            <span
              aria-label={t("home.unread", { n: item.unread })}
              className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-[12px] leading-none font-extrabold text-white"
            >
              {item.unread}
            </span>
          ) : item.noAnswer ? (
            <span className="text-[12px] leading-none font-bold text-muted">
              {t("chat.noAnswer")}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
