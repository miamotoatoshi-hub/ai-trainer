import type { AgeBand, Goal, Harshness, Profile } from "@/lib/data/types";
import { maxHarshness } from "@/lib/safety/age";
import { checkCoachReply } from "@/lib/safety/guard";

/**
 * Анкета знакомства — переписка с тренером, а не форма (раздел 6.5 ТЗ).
 * Здесь только данные и правила; экран — components/onboarding.
 */
export type StepId =
  "name" | "age" | "goal" | "minutes" | "days" | "time" | "harshness" | "coaches" | "notifications";

export const STEP_ORDER: readonly StepId[] = [
  "name",
  "age",
  "goal",
  "minutes",
  "days",
  "time",
  "harshness",
  "coaches",
  "notifications",
];

export type NotifAnswer = "allowed" | "later" | "denied" | "unsupported";

export interface Draft {
  name?: string;
  ageBand?: AgeBand;
  goal?: Goal;
  minutesPerDay?: number;
  scheduleDays?: number[];
  scheduleTime?: string;
  harshness?: Harshness;
  coaches?: true;
  notifications?: NotifAnswer;
}

export const AGE_BANDS: readonly AgeBand[] = ["13-15", "16-17", "18+"];
export const GOALS: readonly Goal[] = ["strength", "weight", "endurance", "shape"];
export const MINUTES: readonly number[] = [10, 15, 20, 30];
export const TIMES: readonly string[] = ["07:00", "12:00", "16:00", "18:00", "20:00"];
/** Порядок дней в интерфейсе: с понедельника. Числа — как в Date.getDay (0 = воскресенье). */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
/** Быстрый выбор «три дня через день». */
export const DAYS_PRESET: readonly number[] = [1, 3, 5];

export const NAME_MAX = 24;

export type NameCheck = { ok: true; name: string } | { ok: false };

/** Имя: 1–24 символа, буквы, цифры, пробел и дефис; без оскорблений. Это не кличка и не личные данные. */
export function checkName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > NAME_MAX) return { ok: false };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u.test(name)) return { ok: false };
  if (!checkCoachReply(name).ok) return { ok: false };
  return { ok: true, name };
}

/** Какие уровни жёсткости можно выбрать при этом возрасте. */
export function allowedHarshness(ageBand: AgeBand | undefined | null): Harshness[] {
  const max = maxHarshness(ageBand ?? null);
  return ([1, 2, 3] as const).filter((h) => h <= max);
}

/** Следующий неотвеченный шаг или null, если анкета заполнена. */
export function nextStep(draft: Draft): StepId | null {
  for (const id of STEP_ORDER) {
    if (draft[answerKey(id)] === undefined) return id;
  }
  return null;
}

function answerKey(id: StepId): keyof Draft {
  switch (id) {
    case "name":
      return "name";
    case "age":
      return "ageBand";
    case "goal":
      return "goal";
    case "minutes":
      return "minutesPerDay";
    case "days":
      return "scheduleDays";
    case "time":
      return "scheduleTime";
    case "harshness":
      return "harshness";
    case "coaches":
      return "coaches";
    case "notifications":
      return "notifications";
  }
}

/** Сколько шагов уже пройдено (для индикатора). */
export function answeredCount(draft: Draft): number {
  return STEP_ORDER.filter((id) => draft[answerKey(id)] !== undefined).length;
}

/** Чистит и сортирует дни недели: только 0–6, без повторов, с понедельника. */
export function sanitizeDays(days: readonly number[]): number[] {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return WEEK_ORDER.filter((d) => set.has(d));
}

export function isValidClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Применяет ответ к черновику. Если возраст изменился так, что выбранная жёсткость стала
 * недоступной, она понижается.
 */
export function applyAnswer(draft: Draft, id: StepId, value: unknown): Draft {
  const next: Draft = { ...draft };
  switch (id) {
    case "name": {
      const check = typeof value === "string" ? checkName(value) : { ok: false as const };
      if (check.ok) next.name = check.name;
      break;
    }
    case "age":
      if (AGE_BANDS.includes(value as AgeBand)) {
        next.ageBand = value as AgeBand;
        const allowed = allowedHarshness(next.ageBand);
        if (next.harshness !== undefined && !allowed.includes(next.harshness)) {
          next.harshness = allowed[allowed.length - 1];
        }
      }
      break;
    case "goal":
      if (GOALS.includes(value as Goal)) next.goal = value as Goal;
      break;
    case "minutes":
      if (MINUTES.includes(value as number)) next.minutesPerDay = value as number;
      break;
    case "days": {
      const days = Array.isArray(value) ? sanitizeDays(value as number[]) : [];
      if (days.length > 0) next.scheduleDays = days;
      break;
    }
    case "time":
      if (typeof value === "string" && isValidClock(value)) next.scheduleTime = value;
      break;
    case "harshness":
      if (allowedHarshness(next.ageBand).includes(value as Harshness)) {
        next.harshness = value as Harshness;
      }
      break;
    case "coaches":
      next.coaches = true;
      break;
    case "notifications":
      if (["allowed", "later", "denied", "unsupported"].includes(value as string)) {
        next.notifications = value as NotifAnswer;
      }
      break;
  }
  return next;
}

/** Данные, которые анкета записывает в профиль. */
export function toProfilePatch(draft: Draft): Partial<Omit<Profile, "id">> {
  const patch: Partial<Omit<Profile, "id">> = {};
  if (draft.name) patch.name = draft.name;
  if (draft.ageBand) patch.ageBand = draft.ageBand;
  if (draft.goal) patch.goal = draft.goal;
  if (draft.minutesPerDay) patch.minutesPerDay = draft.minutesPerDay;
  if (draft.scheduleDays) patch.scheduleDays = draft.scheduleDays;
  if (draft.scheduleTime) patch.scheduleTime = draft.scheduleTime;
  if (draft.harshness) patch.harshness = draft.harshness;
  // Если пользователь отказал в уведомлениях, частота остаётся «обычная», но слать нечем;
  // в профиле он сможет включить их позже.
  return patch;
}
