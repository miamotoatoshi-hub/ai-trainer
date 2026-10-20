import { Button } from "@/components/ui/Button";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import type { CoachId, Emotion } from "@/lib/data/types";
import { t } from "@/lib/i18n";

interface HeroCardProps {
  coachId: CoachId;
  emotion: Emotion;
  /** «СЕГОДНЯ · 18:00» */
  label: string;
  /** «Ноги. 20 минут.» */
  title: string;
  /** Фраза тренера в его стиле. */
  phrase: string;
  /** «Серия 5 дней» или подсказка, что серии пока нет. */
  streakText: string;
  onCall: () => void;
  busy?: boolean;
}

/** Синяя карточка-герой на главном экране: ближайшая тренировка и кнопка «Позвонить». */
export function HeroCard({
  coachId,
  emotion,
  label,
  title,
  phrase,
  streakText,
  onCall,
  busy = false,
}: HeroCardProps) {
  return (
    <section className="mx-4 mt-1 flex flex-col gap-3.5 rounded-hero bg-accent p-[18px] text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-none font-bold tracking-[0.02em] text-accent-soft">
            {label}
          </p>
          <h2 className="mt-2 font-display text-[22px] leading-[1.15] font-extrabold">{title}</h2>
          <p className="mt-2 text-[14px] leading-[1.35] font-semibold">{phrase}</p>
        </div>
        <CoachAvatar coachId={coachId} emotion={emotion} size={56} ring />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-3 py-2 text-[14px] leading-none font-bold">
          <Icon name="flame" size={16} />
          {streakText}
        </span>
        <Button variant="white" pill height={46} icon="video" onClick={onCall} disabled={busy}>
          {t("home.call")}
        </Button>
      </div>
    </section>
  );
}
