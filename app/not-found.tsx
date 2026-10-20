import Link from "next/link";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-white p-8 text-center">
      <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("common.notFoundTitle")}
      </h1>
      <p className="text-[16px] leading-snug font-semibold text-ink-2">
        {t("common.notFoundBody")}
      </p>
      <Link
        href="/"
        className="flex h-12 items-center justify-center rounded-icon bg-accent px-6 text-[15px] font-extrabold text-white"
      >
        {t("common.toHome")}
      </Link>
    </main>
  );
}
