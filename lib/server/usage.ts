import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Счётчики платных вызовов на сервере: дневные лимиты на пользователя и оценка расходов.
 * Аккаунтов нет, поэтому «пользователь» — анонимный id из браузера.
 * Хранится в памяти процесса и (по возможности) в .data/usage.json.
 */

export type UsageKind = "chat_llm" | "chat_scripted" | "tts_eleven";

export const DAILY_LIMITS: Record<UsageKind, number> = {
  chat_llm: 60,
  chat_scripted: 600,
  tts_eleven: 20,
};

export interface Bucket {
  calls: number;
  units: number;
  costUsd: number;
}

export interface UsageData {
  /** день → вид → итог */
  days: Record<string, Partial<Record<UsageKind, Bucket>>>;
  /** "день|пользователь|вид" → сколько раз */
  perUser: Record<string, number>;
}

const FILE = path.join(process.cwd(), ".data", "usage.json");
let state: UsageData | null = null;
let loading: Promise<UsageData> | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function load(): Promise<UsageData> {
  if (state) return state;
  loading ??= (async () => {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      state = JSON.parse(raw) as UsageData;
    } catch {
      state = { days: {}, perUser: {} };
    }
    return state;
  })();
  return loading;
}

async function persist(data: UsageData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data));
  } catch {
    // Нет прав на запись (например, на хостинге) — живём со счётчиками в памяти.
  }
}

/** Учитывает вызов от пользователя; false — дневной лимит исчерпан (вызов не засчитывается). */
export async function tryConsume(
  anonId: string,
  kind: UsageKind,
  limit: number = DAILY_LIMITS[kind],
): Promise<{ ok: boolean; used: number; limit: number }> {
  const data = await load();
  const key = `${today()}|${anonId}|${kind}`;
  const used = data.perUser[key] ?? 0;
  if (used >= limit) return { ok: false, used, limit };
  data.perUser[key] = used + 1;
  await persist(data);
  return { ok: true, used: used + 1, limit };
}

/** Общий потолок трат в день на весь сервер (в долларах, по оценке). Можно поменять DAILY_BUDGET_USD. */
export function dailyBudgetUsd(): number {
  const n = Number(process.env.DAILY_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** Сколько оценочно потрачено сегодня (все пользователи вместе). */
export async function spentTodayUsd(): Promise<number> {
  const data = await load();
  const row = data.days[today()] ?? {};
  return Object.values(row).reduce((sum, bucket) => sum + (bucket?.costUsd ?? 0), 0);
}

/** true — общий дневной бюджет исчерпан: платные вызовы временно заменяются бесплатными запасными. */
export async function budgetExhausted(): Promise<boolean> {
  return (await spentTodayUsd()) >= dailyBudgetUsd();
}

/** Записывает расход: сколько единиц (символов, токенов) и оценка в долларах. */
export async function recordCall(kind: UsageKind, units: number, costUsd: number): Promise<void> {
  const data = await load();
  const day = (data.days[today()] ??= {});
  const bucket = (day[kind] ??= { calls: 0, units: 0, costUsd: 0 });
  bucket.calls += 1;
  bucket.units += units;
  bucket.costUsd += costUsd;
  await persist(data);
}

export async function readUsage(): Promise<UsageData> {
  return load();
}

/** Только для тестов. */
export function resetUsageForTests(): void {
  state = { days: {}, perUser: {} };
  loading = null;
}
