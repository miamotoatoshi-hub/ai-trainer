import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminAllowed } from "@/lib/server/admin";
import { buildCostReport, MONTHLY_PER_USER_WARN_USD } from "@/lib/server/costReport";
import type { UsageData } from "@/lib/server/usage";

const data: UsageData = {
  days: {
    "2026-10-19": {
      chat_llm: { calls: 40, units: 80_000, costUsd: 0.02 },
      tts_eleven: { calls: 5, units: 300, costUsd: 0.036 },
    },
    "2026-10-20": {
      chat_llm: { calls: 10, units: 20_000, costUsd: 0.005 },
      chat_scripted: { calls: 7, units: 7, costUsd: 0 },
    },
  },
  perUser: {
    "2026-10-19|aaaaaaaa|chat_llm": 60,
    "2026-10-19|bbbbbbbb|chat_llm": 20,
    "2026-10-19|aaaaaaaa|tts_eleven": 20,
    "2026-10-20|aaaaaaaa|chat_llm": 10,
  },
};

describe("сводка расходов", () => {
  it("считает по дням, людям и ловит упор в лимиты", () => {
    const report = buildCostReport(data);
    expect(report.days.map((d) => d.day)).toEqual(["2026-10-20", "2026-10-19"]);
    const day19 = report.days[1]!;
    expect(day19.totalUsd).toBeCloseTo(0.056, 5);
    expect(day19.activeUsers).toBe(2);
    expect(report.totalUsd).toBeCloseTo(0.061, 5);
    expect(report.limitHits).toMatchObject({ chat_llm: 1, tts_eleven: 1 });
  });

  it("прогноз на человека и предупреждение при превышении $0.30 в месяц", () => {
    const cheap = buildCostReport(data);
    expect(cheap.perUserMonthUsd).toBeLessThan(MONTHLY_PER_USER_WARN_USD);
    expect(cheap.warn).toBe(false);
    const expensive = buildCostReport({
      days: { "2026-10-20": { chat_llm: { calls: 60, units: 1, costUsd: 0.2 } } },
      perUser: { "2026-10-20|aaaaaaaa|chat_llm": 60 },
    });
    expect(expensive.warn).toBe(true);
  });

  it("пустые данные — пустая сводка", () => {
    const report = buildCostReport({ days: {}, perUser: {} });
    expect(report.days).toEqual([]);
    expect(report.warn).toBe(false);
  });
});

describe("доступ владельца", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("с ADMIN_TOKEN пускает только с правильным токеном", () => {
    vi.stubEnv("ADMIN_TOKEN", "s3cret-token");
    expect(isAdminAllowed("s3cret-token")).toBe(true);
    expect(isAdminAllowed("wrong")).toBe(false);
    expect(isAdminAllowed("s3cret-token!")).toBe(false);
    expect(isAdminAllowed(undefined)).toBe(false);
  });

  it("без ADMIN_TOKEN: открыто только в разработке", () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminAllowed(undefined)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isAdminAllowed(undefined)).toBe(false);
    expect(isAdminAllowed("anything")).toBe(false);
  });
});
