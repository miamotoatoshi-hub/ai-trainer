import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import legal from "@/content/legal.json";
import { t } from "@/lib/i18n";

/** Черновики политики и условий (разделы из content/legal.json). */
export function LegalScreen({ kind }: { kind: "privacy" | "terms" }) {
  const sections = legal[kind];
  return (
    <main
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white"
      data-testid={`legal-${kind}`}
    >
      <div className="flex items-center px-3 pt-[max(18px,env(safe-area-inset-top))]">
        <Link
          href="/profile"
          aria-label={t("legal.back")}
          className="flex h-11 w-11 items-center justify-center rounded-icon bg-surface text-ink"
        >
          <Icon name="back" size={22} strokeWidth={2.4} />
        </Link>
      </div>
      <article className="flex flex-col gap-4 px-5 pt-3 pb-10">
        <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
          {kind === "privacy" ? t("legal.privacyTitle") : t("legal.termsTitle")}
        </h1>
        <p className="rounded-row bg-surface px-4 py-3 text-[13px] font-bold text-ink-2">
          {t("legal.draftNote")}
        </p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-[16px] font-extrabold">{section.title}</h2>
            <p className="mt-1 text-[15px] leading-[1.5] font-semibold text-ink-2">
              {section.text}
            </p>
          </section>
        ))}
      </article>
    </main>
  );
}
