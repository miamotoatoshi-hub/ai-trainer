import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

interface WorkoutCardProps {
  title: string;
  /** «Сегодня, 18:00 · 20 минут · камера» */
  subtitle: string;
  onStart: () => void;
  busy?: boolean;
}

/** Карточка тренировки в ленте: рамка 2px accent, кнопка «Начать звонок». */
export function WorkoutCard({ title, subtitle, onStart, busy = false }: WorkoutCardProps) {
  return (
    <div className="flex justify-start">
      <div className="w-[88%] rounded-[20px] border-2 border-accent bg-white p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-icon bg-accent-tint text-accent">
            <Icon name="dumbbell" size={22} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight font-extrabold">{title}</p>
            <p className="mt-1 text-[13px] leading-tight font-semibold text-ink-2">{subtitle}</p>
          </div>
        </div>
        <Button
          fullWidth
          height={48}
          icon="video"
          className="mt-3"
          onClick={onStart}
          disabled={busy}
        >
          {t("chat.startCall")}
        </Button>
      </div>
    </div>
  );
}
