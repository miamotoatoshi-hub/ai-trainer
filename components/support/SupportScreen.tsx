import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";
import data from "@/content/support-resources.json";

const SECTIONS = [
  { key: "crisis", title: "support.crisisTitle" },
  { key: "eating", title: "support.eatingTitle" },
  { key: "pain", title: "support.painTitle" },
] as const;

/** Страница «Помощь рядом»: телефоны доверия и простые шаги. Ничего не собирает и не отправляет. */
export function SupportScreen() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" data-testid="support">
      <div className="flex items-center px-3 pt-[max(18px,env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label={t("support.back")}
          className="flex h-11 w-11 items-center justify-center rounded-icon bg-surface text-ink"
        >
          <Icon name="back" size={22} strokeWidth={2.4} />
        </Link>
      </div>

      <section className="flex flex-col gap-4 px-5 pt-3 pb-8">
        <div>
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
            {t("support.title")}
          </h1>
          <p className="mt-2 text-[15px] leading-[1.45] font-semibold text-ink-2">
            {t("support.intro")}
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {data.resources.map((r) => (
            <li key={r.id} className="rounded-row border-2 border-accent p-4">
              <h2 className="text-[16px] font-extrabold">{r.title}</h2>
              <p className="mt-1 text-[13px] font-bold text-muted">{r.hours}</p>
              <p className="mt-2 text-[14px] leading-[1.4] font-semibold text-ink-2">
                {r.description}
              </p>
              <a
                href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                className="mt-3 flex h-12 items-center justify-center gap-2 rounded-icon bg-accent text-[16px] font-extrabold text-white"
              >
                <Icon name="phone" size={20} />
                {t("support.call", { phone: r.phone })}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[13px] leading-[1.4] font-semibold text-muted">
          <span className="font-extrabold">{t("support.otherCountry")}. </span>
          {data.otherCountry}
        </p>

        <h2 className="mt-2 text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
          {t("support.stepsTitle").toUpperCase()}
        </h2>
        {SECTIONS.map(({ key, title }) => (
          <div key={key} className="rounded-row bg-surface p-4">
            <h3 className="text-[15px] font-extrabold">{t(title)}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {data.steps[key].map((step) => (
                <li key={step} className="text-[14px] leading-[1.4] font-semibold text-ink-2">
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[12px] font-semibold text-muted">{t("support.notDoctor")}</p>
      </section>
    </main>
  );
}
