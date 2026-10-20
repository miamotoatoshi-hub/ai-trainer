import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

type Tone = "surface" | "accent" | "danger" | "glass" | "white";

const TONES: Record<Tone, string> = {
  surface: "bg-surface text-ink",
  accent: "bg-accent text-white",
  danger: "bg-bad text-white",
  glass: "bg-white/20 text-white backdrop-blur",
  white: "bg-white text-ink",
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Подпись для скринридера (обязательна: у кнопки нет текста). */
  label: string;
  tone?: Tone;
  /** 44 — стандарт, 46 — круглая кнопка звонка, 52 — крупные кнопки в звонке. */
  size?: 44 | 46 | 52;
  round?: boolean;
  iconSize?: number;
}

export function IconButton({
  icon,
  label,
  tone = "surface",
  size = 44,
  round = false,
  iconSize = 20,
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center transition-opacity disabled:opacity-50 ${
        round ? "rounded-full" : "rounded-icon"
      } ${TONES[tone]} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
