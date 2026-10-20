import { DAILY_LIMITS, type Bucket, type UsageData, type UsageKind } from "./usage";

/** Порог из ТЗ: бесплатный активный пользователь должен обходиться в $0.10–0.30 в месяц. */
export const MONTHLY_PER_USER_WARN_USD = 0.3;

export interface DayRow {
  day: string;
  chat: Bucket;
  chatScripted: Bucket;
  tts: Bucket;
  totalUsd: number;
  activeUsers: number;
}

export interface CostReport {
  days: DayRow[];
  totalUsd: number;
  /** Сколько в среднем стоит один активный пользователь за день (по дням с активностью). */
  perUserDayUsd: number;
  /** Прогноз на месяц на одного активного пользователя. */
  perUserMonthUsd: number;
  warn: boolean;
  /** Сколько пользователей упёрлись в лимит хотя бы раз (по дням). */
  limitHits: Record<UsageKind, number>;
}

const EMPTY: Bucket = { calls: 0, units: 0, costUsd: 0 };

/** Сводка расходов по дням. Данные — оценка (см. lib/server/costs.ts), а не счёт от сервиса. */
export function buildCostReport(data: UsageData, maxDays = 30): CostReport {
  const users = new Map<string, Set<string>>();
  const hits: Record<UsageKind, number> = { chat_llm: 0, chat_scripted: 0, tts_eleven: 0 };
  for (const [key, count] of Object.entries(data.perUser)) {
    const [day, anonId, kind] = key.split("|") as [string, string, UsageKind];
    if (!day || !anonId) continue;
    (users.get(day) ?? users.set(day, new Set()).get(day)!).add(anonId);
    if (kind in DAILY_LIMITS && count >= DAILY_LIMITS[kind]) hits[kind] += 1;
  }
  const dayKeys = [...new Set([...Object.keys(data.days), ...users.keys()])]
    .sort()
    .reverse()
    .slice(0, maxDays);
  const days: DayRow[] = dayKeys.map((day) => {
    const row = data.days[day] ?? {};
    const chat = row.chat_llm ?? EMPTY;
    const chatScripted = row.chat_scripted ?? EMPTY;
    const tts = row.tts_eleven ?? EMPTY;
    return {
      day,
      chat,
      chatScripted,
      tts,
      totalUsd: chat.costUsd + tts.costUsd,
      activeUsers: users.get(day)?.size ?? 0,
    };
  });
  const totalUsd = days.reduce((sum, d) => sum + d.totalUsd, 0);
  const perUserSamples = days
    .filter((d) => d.activeUsers > 0)
    .map((d) => d.totalUsd / d.activeUsers);
  const perUserDayUsd = perUserSamples.length
    ? perUserSamples.reduce((a, b) => a + b, 0) / perUserSamples.length
    : 0;
  // Активный пользователь заходит не каждый день: берём 10 активных дней в месяц.
  const perUserMonthUsd = perUserDayUsd * 10;
  return {
    days,
    totalUsd,
    perUserDayUsd,
    perUserMonthUsd,
    warn: perUserMonthUsd > MONTHLY_PER_USER_WARN_USD,
    limitHits: hits,
  };
}
