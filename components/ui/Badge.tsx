import { t } from "@/lib/i18n";
import type { RelationshipLevel } from "@/lib/data/types";

export type BadgeKind = RelationshipLevel | "ignoring";

const STYLES: Record<BadgeKind, string> = {
  despises: "bg-[var(--badge-despises-bg)] text-[var(--badge-despises-fg)]",
  ignoring: "bg-[var(--badge-ignoring-bg)] text-[var(--badge-ignoring-fg)]",
  tolerates: "bg-[var(--badge-tolerates-bg)] text-[var(--badge-tolerates-fg)]",
  respects: "bg-[var(--badge-respects-bg)] text-[var(--badge-respects-fg)]",
  proud: "bg-[var(--badge-proud-bg)] text-[var(--badge-proud-fg)]",
};

/** Бейдж отношения тренера: «Презирает», «Терпит», «Уважает», «Гордится» или временное «Игнорирует». */
export function Badge({ kind }: { kind: BadgeKind }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] leading-none font-extrabold ${STYLES[kind]}`}
    >
      {t(`levels.${kind}`)}
    </span>
  );
}

/** Цвет текста для названия уровня (у «Гордится» белый на белом не виден — берём акцент). */
export const LEVEL_TEXT_COLOR: Record<RelationshipLevel, string> = {
  despises: "var(--badge-despises-fg)",
  tolerates: "var(--badge-tolerates-fg)",
  respects: "var(--badge-respects-fg)",
  proud: "var(--accent)",
};
