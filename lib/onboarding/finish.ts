import type { Repository } from "@/lib/data/repository";
import type { NewMessage, ScheduledWorkout } from "@/lib/data/types";
import { pickNextWorkout } from "@/lib/game/hero";
import { ensureSchedule } from "@/lib/game/schedule";
import { t, type MessageKey } from "@/lib/i18n";
import { toProfilePatch, WEEK_ORDER, type Draft } from "./anketa";

export const ONBOARDING_META = "onboarding";

/** Что хранится между экранами знакомства (звонок с приседаниями — отдельная страница). */
export interface OnboardingState {
  step: "hello" | "gate" | "camera" | "chat";
  draft: Draft;
  /** Тренировка с приседаниями, после которой идёт анкета. */
  sessionId?: string;
  /** Пользователь отказался от камеры. */
  skippedCamera?: boolean;
}

export const INITIAL_STATE: OnboardingState = { step: "hello", draft: {} };

const WEEKDAY_KEYS: Record<number, MessageKey> = {
  0: "onboarding.weekdays.0",
  1: "onboarding.weekdays.1",
  2: "onboarding.weekdays.2",
  3: "onboarding.weekdays.3",
  4: "onboarding.weekdays.4",
  5: "onboarding.weekdays.5",
  6: "onboarding.weekdays.6",
};

export function weekdayLabel(day: number): string {
  return t(WEEKDAY_KEYS[day] ?? "onboarding.weekdays.1");
}

/** «Пн, Ср, Пт» */
export function daysLabel(days: readonly number[]): string {
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map(weekdayLabel)
    .join(", ");
}

export async function loadOnboardingState(repo: Repository): Promise<OnboardingState> {
  return (await repo.getMeta<OnboardingState>(ONBOARDING_META)) ?? INITIAL_STATE;
}

export async function saveOnboardingState(repo: Repository, state: OnboardingState): Promise<void> {
  await repo.setMeta(ONBOARDING_META, state);
}

/**
 * Завершает знакомство: записывает анкету в профиль, строит расписание и оставляет в чате
 * с Громовым вердикт за приседания, приветствие и карточку первой тренировки.
 */
export async function finishOnboarding(
  repo: Repository,
  draft: Draft,
  options: { sessionId?: string; now: number },
): Promise<ScheduledWorkout | null> {
  const { now } = options;
  await repo.updateProfile({
    ...toProfilePatch(draft),
    onboardingDone: true,
    ageConfirmed13: true,
    safetyAccepted: true,
    activeCoachId: "gromov",
    lastOpenedAt: now,
  });
  await ensureSchedule(repo, now);
  const profile = await repo.getProfile();
  const next = pickNextWorkout(
    (await repo.listScheduled()).filter((s) => s.coachId === "gromov"),
    now,
  );

  // Сообщения идут по возрастанию времени, даже если вердикт «старше» остальных.
  let at = 0;
  const say = async (partial: Partial<NewMessage> & Pick<NewMessage, "text">) => {
    at = Math.max(at + 1, partial.createdAt ?? now);
    await repo.addMessage({
      coachId: "gromov",
      sender: "coach",
      type: "text",
      emotion: "neutral",
      durationSec: null,
      meta: { source: "system" },
      readAt: now,
      ...partial,
      createdAt: at,
    });
  };

  if (options.sessionId) {
    const session = await repo.getSession(options.sessionId);
    if (session?.outcome) {
      await say({
        text: session.outcome.verdictText,
        emotion: session.outcome.emotion,
        createdAt: session.endedAt ?? now,
      });
    }
  }
  await say({
    text: t("onboarding.firstMessage", {
      days: daysLabel(profile.scheduleDays),
      time: profile.scheduleTime,
    }),
  });
  if (next) {
    await say({
      text: "",
      type: "workout_card",
      emotion: "neutral",
      meta: { planId: next.planId, scheduledId: next.id, scheduledAt: next.scheduledAt },
    });
  }
  await repo.setMeta(ONBOARDING_META, undefined);
  return next;
}
