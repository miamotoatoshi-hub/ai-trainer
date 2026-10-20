import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "white" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white",
  secondary: "bg-surface text-ink border border-line-2",
  white: "bg-white text-accent",
  ghost: "bg-transparent text-accent",
  danger: "bg-bad text-white",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Высота кнопки в пикселях (по макету: 44, 46 или 48). */
  height?: 44 | 46 | 48 | 52;
  /** Круглая «пилюля» (кнопка «Позвонить») вместо скруглённого прямоугольника. */
  pill?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  height = 48,
  pill = false,
  icon,
  fullWidth = false,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      style={{ height }}
      className={`inline-flex items-center justify-center gap-2 px-[18px] text-[15px] font-extrabold transition-opacity disabled:opacity-50 ${
        pill ? "rounded-full" : "rounded-icon"
      } ${fullWidth ? "w-full" : ""} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}
