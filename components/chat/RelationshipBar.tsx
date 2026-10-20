import { LEVEL_TEXT_COLOR } from "@/components/ui/Badge";
import { LEVELS, type RelationshipLevel } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import { levelIndex, levelProgress } from "@/lib/relationship/levels";

interface RelationshipBarProps {
  level: RelationshipLevel;
  score: number;
  hint: string;
}

/** Блок «ОТНОШЕНИЕ»: название уровня, шкала из 4 сегментов, подписи уровней, подсказка. */
export function RelationshipBar({ level, score, hint }: RelationshipBarProps) {
  const current = levelIndex(level);
  const progress = levelProgress(score, level);
  return (
    <section className="flex flex-col gap-2 px-4 pt-3 pb-3.5" aria-label={t("chat.relation")}>
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] leading-none font-extrabold tracking-[0.06em] text-muted">
          {t("chat.relation")}
        </h2>
        <span
          className="font-display text-[14px] leading-none font-extrabold"
          style={{ color: LEVEL_TEXT_COLOR[level] }}
        >
          {t(`levels.${level}`)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={t("chat.scoreLabel", { score })}
        className="grid grid-cols-4 gap-1"
      >
        {LEVELS.map((id, i) => {
          const fill = i < current ? 1 : i === current ? progress : 0;
          const color = i === current && level === "despises" ? "var(--warn)" : "var(--accent)";
          return (
            <span key={id} className="h-2 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.round(fill * 100)}%`, background: color }}
              />
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1 text-[11px] leading-none font-bold">
        {LEVELS.map((id, i) => (
          <span key={id} className={i === current ? "text-ink" : "text-muted"}>
            {t(`levels.${id}`)}
          </span>
        ))}
      </div>
      <p className="text-[13px] leading-[1.35] font-semibold text-ink-2">{hint}</p>
    </section>
  );
}
