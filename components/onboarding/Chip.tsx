import type { ButtonHTMLAttributes } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Главная кнопка шага («Готово»). */
  primary?: boolean;
}

/** Быстрый ответ в анкете: нажимаемая «пилюля» не меньше 44 пикселей в высоту. */
export function Chip({
  selected = false,
  primary = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ChipProps) {
  const tone = primary
    ? "bg-accent text-white"
    : selected
      ? "border-accent bg-accent-tint text-accent"
      : "border-line-2 bg-white text-ink";
  return (
    <button
      type={type}
      aria-pressed={primary ? undefined : selected}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-extrabold transition-opacity disabled:opacity-40 ${
        primary ? "border-transparent" : ""
      } ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
