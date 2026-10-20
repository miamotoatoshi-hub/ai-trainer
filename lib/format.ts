import { t, tUnit } from "./i18n";
import { addDays, daysBetween, formatClock } from "./time";

const weekdayShortFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const weekdayLongFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
const dateShortFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const dateLongFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Пн" */
export function weekdayShort(ts: number): string {
  return capitalize(weekdayShortFmt.format(ts).replace(".", ""));
}

/** "Понедельник" */
export function weekdayLong(ts: number): string {
  return capitalize(weekdayLongFmt.format(ts));
}

/** Время в списке чатов: сегодня — "07:12", вчера — "Вчера", эта неделя — "Пн", раньше — "12 окт." */
export function formatListTime(ts: number, now: number): string {
  const diff = daysBetween(ts, now);
  if (diff <= 0) return formatClock(ts);
  if (diff === 1) return t("common.yesterday");
  if (diff < 7) return weekdayShort(ts);
  return dateShortFmt.format(ts);
}

/** Плашка даты в переписке: "Сегодня", "Вчера", "12 октября". */
export function formatDayLabel(ts: number, now: number): string {
  const diff = daysBetween(ts, now);
  if (diff === 0) return t("common.today");
  if (diff === 1) return t("common.yesterday");
  return dateLongFmt.format(ts);
}

/** "Сегодня, 18:00" / "Завтра, 18:00" / "Среда, 18:00" */
export function formatWhen(ts: number, now: number): string {
  const diff = daysBetween(now, ts);
  const time = formatClock(ts);
  if (diff === 0) return t("chat.cardWhenToday", { time });
  if (diff === 1) return t("chat.cardWhenTomorrow", { time });
  return t("chat.cardWhenDay", { day: weekdayLong(ts), time });
}

/** Подпись в карточке-герое: "СЕГОДНЯ · 18:00" / "ЗАВТРА · 18:00" / "ПН · 18:00" */
export function formatHeroLabel(ts: number, now: number): string {
  const diff = daysBetween(now, ts);
  const time = formatClock(ts);
  if (diff <= 0) return t("home.heroToday", { time });
  if (diff === 1) return t("home.heroTomorrow", { time });
  return t("home.heroDay", { day: weekdayShort(ts).toUpperCase(), time });
}

/** "20 минут" */
export function formatMinutes(n: number): string {
  return `${n} ${tUnit("plural.minutes", n)}`;
}

/** "3 часа назад" / "15 минут назад" / "2 дня назад" */
export function formatAgo(fromTs: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - fromTs) / 60_000));
  if (minutes < 60)
    return t("common.agoWhen", { n: minutes, unit: tUnit("plural.minutes", minutes) });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("common.agoWhen", { n: hours, unit: tUnit("plural.hours", hours) });
  const days = Math.round(hours / 24);
  return t("common.agoWhen", { n: days, unit: tUnit("plural.days", days) });
}

/** Следующее время тренировки по расписанию (после moment), либо null, если дней нет. */
export function nextScheduleSlot(
  moment: number,
  days: readonly number[],
  clock: string,
): number | null {
  if (days.length === 0) return null;
  const [h, m] = clock.split(":").map(Number);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(addDays(moment, offset));
    day.setHours(h ?? 18, m ?? 0, 0, 0);
    if (days.includes(day.getDay()) && day.getTime() > moment) return day.getTime();
  }
  return null;
}
