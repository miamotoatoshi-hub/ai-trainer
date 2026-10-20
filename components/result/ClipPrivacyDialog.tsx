import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

/** Перед первым «Поделиться»: в клипе видно человека и комнату. */
export function ClipPrivacyDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-end bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-privacy-title"
    >
      <div className="flex w-full flex-col gap-4 rounded-[24px] bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-icon bg-accent-tint text-accent">
          <Icon name="shield" size={26} />
        </span>
        <h2
          id="clip-privacy-title"
          className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
        >
          {t("clip.privacy.title")}
        </h2>
        <p className="text-[16px] leading-snug font-semibold text-ink-2">
          {t("clip.privacy.body")}
        </p>
        <div className="flex flex-col gap-2">
          <Button fullWidth height={52} onClick={onConfirm}>
            {t("clip.privacy.confirm")}
          </Button>
          <Button variant="secondary" fullWidth height={48} onClick={onCancel}>
            {t("clip.privacy.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
