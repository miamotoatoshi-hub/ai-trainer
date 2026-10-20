import { getCoach } from "@/lib/coach/coaches";
import { avatarSvgString } from "@/lib/coach/avatars";
import type { CoachId, Emotion } from "@/lib/data/types";

interface CoachAvatarProps {
  coachId: CoachId;
  emotion?: Emotion;
  size?: number;
  /** Точка «в сети» в правом нижнем углу. */
  online?: boolean;
  /** Белая обводка 3px (35% прозрачности) — для карточки-героя на синем фоне. */
  ring?: boolean;
  className?: string;
}

/** Плоский SVG-портрет тренера; выражение лица меняется под эмоцию. */
export function CoachAvatar({
  coachId,
  emotion = "neutral",
  size = 54,
  online = false,
  ring = false,
  className = "",
}: CoachAvatarProps) {
  const svg = avatarSvgString(coachId, emotion, size);
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        role="img"
        aria-label={getCoach(coachId).fullName}
        className={`block overflow-hidden rounded-full ${ring ? "ring-[3px] ring-white/35" : ""}`}
        style={{ width: size, height: size }}
        // Разметка строится только из наших констант (lib/coach/face.ts), пользовательского текста в ней нет.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {online ? (
        <span
          aria-hidden="true"
          className="absolute -right-px -bottom-px h-[14px] w-[14px] rounded-full border-[3px] border-white bg-accent"
        />
      ) : null}
    </span>
  );
}
