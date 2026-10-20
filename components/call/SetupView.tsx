import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import type { CameraErrorKind } from "@/lib/pose/camera";
import type { CameraStatus } from "@/lib/pose/usePoseSource";
import { t } from "@/lib/i18n";

export interface BodyParts {
  shoulders: boolean;
  hips: boolean;
  knees: boolean;
  ankles: boolean;
}

interface SetupViewProps {
  status: CameraStatus;
  error: CameraErrorKind | null;
  parts: BodyParts;
  /** Сколько миллисекунд человек уже стоит в кадре целиком. */
  heldMs: number;
  holdTargetMs: number;
  countdown: number | null;
  /** Строка-«ворчание» тренера, если человека не видно. */
  grumble: string | null;
  exerciseHint: string;
  onRetry: () => void;
  onFlip: () => void;
  onSim: () => void;
  onClose: () => void;
}

const PART_LABELS: Record<keyof BodyParts, () => string> = {
  shoulders: () => t("call.setup.shoulders"),
  hips: () => t("call.setup.hips"),
  knees: () => t("call.setup.knees"),
  ankles: () => t("call.setup.ankles"),
};

/** Экран настройки камеры: подсказка, как поставить телефон, и живая проверка «видно ли тебя целиком». */
export function SetupView({
  status,
  error,
  parts,
  heldMs,
  holdTargetMs,
  countdown,
  grumble,
  exerciseHint,
  onRetry,
  onFlip,
  onSim,
  onClose,
}: SetupViewProps) {
  const progress = Math.min(1, heldMs / holdTargetMs);
  const allVisible = Object.values(parts).every(Boolean);
  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-ink/85 via-ink/35 to-ink/90 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] text-white">
      <div className="flex items-center justify-between">
        <IconButton icon="cross" label={t("call.close")} tone="glass" round onClick={onClose} />
        {status === "ready" ? (
          <IconButton
            icon="flip"
            label={t("call.setup.flip")}
            tone="glass"
            round
            onClick={onFlip}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <h1 className="font-display text-[24px] leading-tight font-extrabold">
          {t("call.setup.title")}
        </h1>
        <p className="text-[16px] leading-snug font-bold text-white/90">{t("call.setup.body")}</p>
        <p className="text-[14px] leading-snug font-semibold text-white/80">{exerciseHint}</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {status === "error" && error ? (
          <div
            className="flex w-full flex-col gap-3 rounded-hero bg-white p-5 text-ink"
            role="alert"
          >
            <p className="text-[15px] leading-snug font-bold">{t(`call.camera.${error}`)}</p>
            <Button fullWidth height={48} onClick={onRetry}>
              {t("call.camera.retry")}
            </Button>
            <Button variant="secondary" fullWidth height={48} onClick={onSim}>
              {t("call.camera.sim")}
            </Button>
          </div>
        ) : status !== "ready" ? (
          <p
            className="rounded-full bg-black/35 px-4 py-2 text-[15px] font-bold backdrop-blur"
            role="status"
          >
            {t("call.setup.loadingModel")}
          </p>
        ) : countdown !== null ? (
          <div className="flex flex-col items-center gap-2" role="status">
            <p className="font-display text-[120px] leading-none font-extrabold drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
              {countdown}
            </p>
            <p className="text-[16px] font-bold">{t("call.setup.ready")}</p>
          </div>
        ) : (
          <>
            <ul className="grid w-full grid-cols-2 gap-2" data-testid="body-parts">
              {(Object.keys(PART_LABELS) as (keyof BodyParts)[]).map((key) => (
                <li
                  key={key}
                  data-visible={parts[key]}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-[14px] font-extrabold backdrop-blur ${
                    parts[key] ? "bg-white text-ink" : "bg-black/40 text-white"
                  }`}
                >
                  <Icon
                    name={parts[key] ? "check" : "cross"}
                    size={16}
                    strokeWidth={3}
                    className={parts[key] ? "text-good" : "text-white/80"}
                  />
                  <span>{PART_LABELS[key]()}</span>
                  <span className="sr-only">
                    {parts[key] ? t("call.setup.visible") : t("call.setup.hidden")}
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/25"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="text-[15px] font-bold" role="status">
              {allVisible ? t("call.setup.holdStill") : t("call.setup.searching")}
            </p>
          </>
        )}
      </div>

      <div
        aria-live="polite"
        data-testid="grumble"
        className={`min-h-[64px] rounded-2xl px-4 py-3 text-center text-[20px] leading-tight font-extrabold ${
          grumble ? "bg-[var(--call-plate)]" : ""
        }`}
      >
        {grumble}
      </div>
    </div>
  );
}
