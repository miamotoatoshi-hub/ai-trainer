import { Icon, type IconName } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

export type Quality = "good" | "okay" | "bad";

const CONFIG: Record<Quality, { icon: IconName; color: string; label: () => string }> = {
  good: { icon: "check", color: "var(--good)", label: () => t("call.overlay.good") },
  okay: { icon: "alert", color: "var(--okay)", label: () => t("call.overlay.okay") },
  bad: { icon: "cross", color: "var(--bad)", label: () => t("call.overlay.bad") },
};

/** Качество техники повтора. Различается не только цветом, но и значком (галочка / ! / крестик) и словом. */
export function QualityBadge({ quality }: { quality: Quality }) {
  const { icon, color, label } = CONFIG[quality];
  return (
    <div
      role="status"
      data-testid="quality"
      data-quality={quality}
      className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[14px] leading-none font-extrabold"
      style={{ color }}
    >
      <Icon name={icon} size={18} strokeWidth={2.8} />
      <span className="text-ink">{label()}</span>
    </div>
  );
}
