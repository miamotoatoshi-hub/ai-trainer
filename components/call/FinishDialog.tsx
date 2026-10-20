import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

/** Подтверждение «Завершить тренировку?» — чтобы случайно не бросить. */
export function FinishDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-title"
      className="absolute inset-0 z-20 flex items-end bg-black/55 p-4"
    >
      <div className="w-full rounded-hero bg-white p-5 text-ink">
        <h2 id="finish-title" className="font-display text-[20px] leading-tight font-extrabold">
          {t("call.finishConfirm.title")}
        </h2>
        <p className="mt-2 text-[15px] leading-snug font-semibold text-ink-2">
          {t("call.finishConfirm.body")}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" fullWidth height={48} onClick={onConfirm}>
            {t("call.finishConfirm.yes")}
          </Button>
          <Button variant="secondary" fullWidth height={48} onClick={onCancel}>
            {t("call.finishConfirm.no")}
          </Button>
        </div>
      </div>
    </div>
  );
}
