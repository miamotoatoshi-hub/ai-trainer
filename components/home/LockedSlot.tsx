import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

/** Заблокированный слот: пунктирный круг с замком и условием открытия. */
export function LockedSlot({ hint }: { hint: string }) {
  return (
    <li className="flex min-h-[72px] items-center gap-3 px-3 py-[9px]">
      <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-locked text-locked">
        <Icon name="lock" size={22} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[16px] leading-tight font-extrabold text-ink-2">
          {t("home.lockedTitle")}
        </span>
        <span className="text-[13px] leading-tight font-semibold text-muted">{hint}</span>
      </span>
    </li>
  );
}
