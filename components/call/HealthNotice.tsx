import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

/** Экран перед первой тренировкой: здоровье, место вокруг, приватность видео. */
export function HealthNotice({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-white px-6 pt-[max(32px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("call.close")}
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-icon text-ink"
      >
        <Icon name="cross" size={22} strokeWidth={2.4} />
      </button>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-icon bg-accent-tint text-accent">
          <Icon name="shield" size={28} />
        </span>
        <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
          {t("call.health.title")}
        </h1>
        <ul className="flex flex-col gap-3 text-[17px] leading-snug font-bold text-ink-2">
          <li>{t("call.health.line1")}</li>
          <li>{t("call.health.line2")}</li>
          <li>{t("call.health.line3")}</li>
        </ul>
        <p className="rounded-row bg-surface px-4 py-3 text-[14px] leading-snug font-semibold text-ink-2">
          {t("call.health.videoNote")}
        </p>
      </div>
      <Button fullWidth height={52} onClick={onAccept}>
        {t("call.health.accept")}
      </Button>
    </div>
  );
}
