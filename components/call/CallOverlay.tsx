import { QualityBadge, type Quality } from "@/components/call/QualityBadge";
import { Button } from "@/components/ui/Button";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { IconButton } from "@/components/ui/IconButton";
import { getCoach } from "@/lib/coach/coaches";
import type { CoachId, Emotion } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import type { usePushToTalk } from "@/lib/speech/usePushToTalk";
import { formatDuration } from "@/lib/time";

interface CallOverlayProps {
  coachId: CoachId;
  emotion: Emotion;
  elapsedMs: number;
  /** Большой счётчик: повторения или секунды. */
  count: number;
  /** «из 10» / «осталось 22 с». */
  targetLabel: string | null;
  /** «Приседания · подход 1 из 3» */
  caption: string | null;
  quality: Quality | null;
  /** Фраза тренера крупными буквами для клипа и для режима без звука. */
  subtitle: string | null;
  paused: boolean;
  /** Идёт отдых между подходами: вместо счётчика — обратный отсчёт. */
  restLeftSec: number | null;
  restNext: string | null;
  restHint: string | null;
  simMode: boolean;
  debugLine: string | null;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  talk: ReturnType<typeof usePushToTalk>;
  onSkipRest: () => void;
}

/** Интерфейс поверх камеры в духе спортивной трансляции. */
export function CallOverlay({
  coachId,
  emotion,
  elapsedMs,
  count,
  targetLabel,
  caption,
  quality,
  subtitle,
  paused,
  restLeftSec,
  restNext,
  restHint,
  simMode,
  debugLine,
  onPause,
  onResume,
  onFinish,
  talk,
  onSkipRest,
}: CallOverlayProps) {
  const meta = getCoach(coachId);
  const resting = restLeftSec !== null;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] text-white">
      <div className="flex items-center gap-2.5">
        <CoachAvatar coachId={coachId} emotion={emotion} size={44} ring />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-extrabold drop-shadow">
            {meta.name}
          </p>
          <p
            className="text-[13px] leading-tight font-bold text-white/90 drop-shadow"
            data-testid="timer"
          >
            {formatDuration(elapsedMs / 1000)}
          </p>
        </div>
        {simMode ? (
          <span className="ml-auto rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur">
            {t("call.overlay.demoBadge")}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col items-center gap-2 text-center">
        {caption ? (
          <p
            data-testid="caption"
            className="rounded-full bg-black/30 px-3 py-1 text-[13px] font-bold backdrop-blur"
          >
            {caption}
          </p>
        ) : null}
        {resting ? (
          <>
            <p
              data-testid="rest"
              className="font-display text-[88px] leading-none font-extrabold drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]"
            >
              {restLeftSec}
            </p>
            {restNext ? (
              <p className="text-[16px] font-extrabold drop-shadow" data-testid="rest-next">
                {restNext}
              </p>
            ) : null}
            {restHint ? (
              <p className="max-w-[300px] text-[14px] leading-snug font-bold text-white/90 drop-shadow">
                {restHint}
              </p>
            ) : null}
            <div className="pointer-events-auto mt-1">
              <Button variant="white" pill height={44} onClick={onSkipRest}>
                {t("call.step.skipRest")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p
              data-testid="counter"
              className="font-display text-[112px] leading-none font-extrabold drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]"
            >
              {count}
            </p>
            {targetLabel ? (
              <p className="text-[15px] font-bold text-white/90 drop-shadow" data-testid="target">
                {targetLabel}
              </p>
            ) : null}
            <div className="h-9">{quality ? <QualityBadge quality={quality} /> : null}</div>
          </>
        )}
      </div>

      {debugLine ? (
        <p
          className="mt-2 rounded-lg bg-black/50 px-2 py-1 font-mono text-[12px]"
          data-testid="debug"
        >
          {debugLine}
        </p>
      ) : null}

      <div className="flex-1" />

      <div
        aria-live="polite"
        data-testid="subtitle"
        className={`mb-4 min-h-[64px] rounded-2xl px-4 py-3 text-center text-[22px] leading-tight font-extrabold ${
          subtitle || paused ? "bg-[var(--call-plate)]" : ""
        }`}
      >
        {paused ? t("call.overlay.paused") : subtitle}
      </div>

      <div className="pointer-events-auto flex items-center justify-center gap-5">
        <IconButton
          icon={paused ? "play" : "pause"}
          label={paused ? t("call.overlay.resume") : t("call.overlay.pause")}
          tone="glass"
          round
          size={52}
          iconSize={22}
          onClick={paused ? onResume : onPause}
        />
        <IconButton
          icon="mic"
          label={talk.supported ? t("call.overlay.talk") : t("stt.unsupported")}
          tone="accent"
          round
          size={52}
          iconSize={22}
          disabled={!talk.supported}
          aria-pressed={talk.state === "listening"}
          data-testid="talk-button"
          className={talk.state === "listening" ? "ring-4 ring-white/50" : ""}
          {...talk.buttonProps}
        />
        <IconButton
          icon="hangup"
          label={t("call.overlay.finish")}
          tone="danger"
          round
          size={52}
          iconSize={22}
          onClick={onFinish}
        />
      </div>
    </div>
  );
}
