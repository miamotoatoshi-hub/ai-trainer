import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

interface BubbleProps {
  mine: boolean;
  text: string;
  /** "07:12" */
  time: string;
  /** Для своих сообщений: тренер прочитал (две галочки). */
  read?: boolean;
  /** Без времени и галочек — для анкеты знакомства. */
  bare?: boolean;
}

/** Пузырь сообщения. Входящие — белые с рамкой, свои — синие; «хвостик» радиусом 6px. */
export function Bubble({ mine, text, time, read = false, bare = false }: BubbleProps) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] px-3 py-2.5 ${
          mine
            ? "rounded-[18px_18px_6px_18px] bg-accent text-white"
            : "rounded-[18px_18px_18px_6px] border border-line bg-white text-ink"
        }`}
      >
        <p className="text-[15px] leading-[1.4] font-semibold break-words whitespace-pre-wrap">
          {text}
        </p>
        {bare ? null : (
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[11px] leading-none font-bold ${
              mine ? "text-white/90" : "text-muted"
            }`}
          >
            <span>{time}</span>
            {mine ? (
              <>
                <Icon name={read ? "checks" : "check"} size={14} />
                <span className="sr-only">{read ? t("chat.read") : t("chat.sent")}</span>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** Пузырь «печатает…» — три прыгающие точки. */
export function TypingBubble() {
  return (
    <div className="flex justify-start" role="status" aria-label={t("chat.typing")}>
      <div className="flex items-center gap-1 rounded-[18px_18px_18px_6px] border border-line bg-white px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-muted"
            style={{ animation: `pinok-dot 1.2s ${i * 0.18}s infinite ease-in-out` }}
          />
        ))}
      </div>
    </div>
  );
}
