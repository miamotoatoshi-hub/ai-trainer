import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { isAdminAllowed } from "@/lib/server/admin";
import { buildCostReport } from "@/lib/server/costReport";
import { readUsage } from "@/lib/server/usage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "ПИНОК · расходы",
  robots: { index: false, follow: false },
};

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/** Расходы на платные сервисы по дням — только для владельца (см. lib/server/admin.ts). */
export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!isAdminAllowed(token)) {
    return (
      <main className="p-6" data-testid="admin-locked">
        <p className="text-[16px] font-bold">{t("admin.locked")}</p>
      </main>
    );
  }
  const report = buildCostReport(await readUsage());
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-5" data-testid="admin-costs">
      <h1 className="font-display text-[26px] font-extrabold">{t("admin.title")}</h1>
      <p className="text-[13px] font-semibold text-muted">{t("admin.note")}</p>

      {report.days.length === 0 ? (
        <p className="text-[15px] font-bold">{t("admin.empty")}</p>
      ) : (
        <>
          <section
            className={`rounded-row border-2 p-4 ${report.warn ? "border-warn" : "border-accent"}`}
          >
            <p className="text-[14px] font-bold">
              {t("admin.total")}: <span data-testid="total">{usd(report.totalUsd)}</span>
            </p>
            <p className="text-[14px] font-bold">
              {t("admin.perUser")}: {usd(report.perUserDayUsd)} {t("admin.perDay")} ·{" "}
              {usd(report.perUserMonthUsd)} {t("admin.perMonth")}
            </p>
            <p className="mt-2 text-[14px] font-extrabold" data-testid="verdict">
              {report.warn ? t("admin.warn") : t("admin.ok")}
            </p>
          </section>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line font-extrabold">
                  <th className="py-2 pr-3">{t("admin.day")}</th>
                  <th className="pr-3">{t("admin.chat")}</th>
                  <th className="pr-3">{t("admin.scripted")}</th>
                  <th className="pr-3">{t("admin.tts")}</th>
                  <th className="pr-3">{t("admin.users")}</th>
                  <th>{t("admin.sum")}</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.day} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-bold">{d.day}</td>
                    <td className="pr-3">
                      {t("admin.calls", { n: d.chat.calls })},{" "}
                      {t("admin.tokens", { n: d.chat.units })}
                      <br />
                      {usd(d.chat.costUsd)}
                    </td>
                    <td className="pr-3">{t("admin.calls", { n: d.chatScripted.calls })}</td>
                    <td className="pr-3">
                      {t("admin.calls", { n: d.tts.calls })}, {t("admin.chars", { n: d.tts.units })}
                      <br />
                      {usd(d.tts.costUsd)}
                    </td>
                    <td className="pr-3">{d.activeUsers}</td>
                    <td className="font-extrabold">{usd(d.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] font-semibold text-muted">
            {t("admin.limits")}:{" "}
            {(Object.entries(report.limitHits) as [string, number][])
              .map(([kind, n]) => t("admin.limitLine", { kind, n }))
              .join(" · ")}
          </p>
        </>
      )}
    </main>
  );
}
