import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";
import { formatDuration } from "@/lib/time";

const BARS = 20;

/** Высоты столбиков волны 6–26px: детерминированно от id сообщения, чтобы волна не «прыгала». */
export function waveformHeights(seed: number): number[] {
  return Array.from(
    { length: BARS },
    (_, i) => 6 + ((seed * 37 + i * 53 + ((i * i) % 7) * 11) % 21),
  );
}

interface VoiceBubbleProps {
  seed: number;
  durationSec: number;
  time: string;
  transcript: string;
  playing: boolean;
  /** Доля проигранного, 0..1. */
  progress: number;
  onToggle: () => void;
}

/** Голосовое сообщение тренера: кнопка Play, волна (проигранная часть синяя), длительность. */
export function VoiceBubble({
  seed,
  durationSec,
  time,
  transcript,
  playing,
  progress,
  onToggle,
}: VoiceBubbleProps) {
  const heights = waveformHeights(seed);
  return (
    <div className="flex justify-start">
      <div className="max-w-[78%] min-w-[220px] rounded-[18px_18px_18px_6px] border border-line bg-white px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* Видимый круг 40px, но область нажатия 44px (минимум по ТЗ). */}
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? t("chat.stop") : t("chat.play")}
            className="-m-0.5 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">
              <Icon name={playing ? "pause" : "play"} size={18} />
            </span>
          </button>
          <div className="flex h-7 flex-1 items-center gap-[2px]" aria-hidden="true">
            {heights.map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full"
                style={{
                  height: h,
                  background: i / heights.length < progress ? "var(--accent)" : "var(--wave-rest)",
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] leading-none font-bold text-muted">
          <span>{formatDuration(durationSec)}</span>
          <span>{time}</span>
        </div>
        <details className="mt-1.5">
          <summary className="-my-2.5 flex min-h-11 min-w-11 w-fit cursor-pointer items-center text-[12px] font-bold text-accent">
            {t("chat.transcript")}
          </summary>
          <p className="mt-1 text-[14px] leading-[1.4] font-semibold text-ink-2">{transcript}</p>
        </details>
      </div>
    </div>
  );
}
