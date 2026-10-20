"use client";

import Link from "next/link";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

/** Если экран упал, человек видит спокойное сообщение, а не пустую страницу. Данные на устройстве целы. */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Только тип ошибки: текст может содержать личное.
    console.error("[pinok] ошибка экрана:", error.name);
  }, [error]);
  return (
    <main
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-white p-8 text-center"
    >
      <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("common.errorTitle")}
      </h1>
      <p className="text-[16px] leading-snug font-semibold text-ink-2">{t("common.errorBody")}</p>
      <button
        type="button"
        onClick={reset}
        className="flex h-12 items-center justify-center rounded-icon bg-accent px-6 text-[15px] font-extrabold text-white"
      >
        {t("common.retry")}
      </button>
      <Link href="/" className="flex h-11 items-center text-[15px] font-extrabold text-accent">
        {t("common.toHome")}
      </Link>
    </main>
  );
}
