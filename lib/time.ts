// Работа со временем. Все «дни» — по локальному времени устройства.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Ключ локального дня: "2026-10-20". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Сколько целых локальных дней между двумя моментами (по календарю, а не по 24 часа). */
export function daysBetween(fromTs: number, toTs: number): number {
  const a = new Date(startOfDay(fromTs));
  const b = new Date(startOfDay(toTs));
  const diff = (b.getTime() - a.getTime()) / DAY;
  return Math.round(diff);
}

/** "18:30" → минуты от полуночи. Некорректная строка → 0. */
export function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const h = Math.min(23, Number(match[1]));
  const m = Math.min(59, Number(match[2]));
  return h * 60 + m;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Момент "HH:MM" на локальном дне, к которому относится ts. */
export function atClock(ts: number, clock: string): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + parseClock(clock) * MINUTE;
}

/** Минуты от полуночи для момента ts. */
export function minutesOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/** Лежит ли момент в тихих часах (интервал может переходить через полночь). */
export function isQuietHour(ts: number, quietStart: string, quietEnd: string): boolean {
  const m = minutesOfDay(ts);
  const start = parseClock(quietStart);
  const end = parseClock(quietEnd);
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Длительность "0:14" / "12:05". */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
