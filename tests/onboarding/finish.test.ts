import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/lib/data/dexieRepository";
import { startWorkoutSession } from "@/lib/workout/startSession";
import { finishWorkout } from "@/lib/game/finishWorkout";
import {
  daysLabel,
  finishOnboarding,
  loadOnboardingState,
  saveOnboardingState,
} from "@/lib/onboarding/finish";
import type { Draft } from "@/lib/onboarding/anketa";

// вторник, 20 октября 2026, 10:00
const NOW = new Date(2026, 9, 20, 10, 0).getTime();

const DRAFT: Draft = {
  name: "Алекс",
  ageBand: "16-17",
  goal: "strength",
  minutesPerDay: 20,
  scheduleDays: [1, 3, 5],
  scheduleTime: "18:00",
  harshness: 2,
  coaches: true,
  notifications: "later",
};

let repo: DexieRepository;
let counter = 0;
beforeEach(() => {
  counter += 1;
  repo = new DexieRepository(`pinok-onboarding-${counter}`);
});
afterEach(async () => {
  await repo.destroy();
});

describe("состояние знакомства", () => {
  it("сохраняется между экранами и возвращается", async () => {
    expect((await loadOnboardingState(repo)).step).toBe("hello");
    await saveOnboardingState(repo, { step: "chat", draft: { name: "Алекс" }, sessionId: "s1" });
    const state = await loadOnboardingState(repo);
    expect(state).toEqual({ step: "chat", draft: { name: "Алекс" }, sessionId: "s1" });
  });
});

describe("finishOnboarding", () => {
  it("записывает анкету в профиль и строит расписание", async () => {
    const next = await finishOnboarding(repo, DRAFT, { now: NOW });
    const profile = await repo.getProfile();
    expect(profile).toMatchObject({
      name: "Алекс",
      ageBand: "16-17",
      goal: "strength",
      minutesPerDay: 20,
      scheduleDays: [1, 3, 5],
      scheduleTime: "18:00",
      harshness: 2,
      onboardingDone: true,
      ageConfirmed13: true,
      safetyAccepted: true,
      activeCoachId: "gromov",
    });
    const scheduled = await repo.listScheduled();
    expect(scheduled.length).toBeGreaterThan(3);
    expect(scheduled.every((s) => s.coachId === "gromov" && s.status === "planned")).toBe(true);
    // вторник 20-го: ближайшая тренировка — среда 21-го, 18:00
    expect(next && new Date(next.scheduledAt).getDate()).toBe(21);
  });

  it("оставляет в чате приветствие и карточку первой тренировки", async () => {
    await finishOnboarding(repo, DRAFT, { now: NOW });
    const messages = await repo.listMessages("gromov");
    expect(messages.map((m) => m.type)).toEqual(["text", "workout_card"]);
    expect(messages[0]!.text).toContain("Пн, Ср, Пт");
    expect(messages[0]!.text).toContain("18:00");
    expect(messages[1]!.meta.scheduledId).toBeTruthy();
    expect(messages.every((m) => m.readAt !== null)).toBe(true);
  });

  it("если были приседания, вердикт Громова идёт первым", async () => {
    await repo.updateProfile({ safetyAccepted: true, ageConfirmed13: true });
    const id = await startWorkoutSession(
      repo,
      { coachId: "gromov", planId: "first-squats", mode: "onboarding" },
      NOW - 5 * 60_000,
    );
    const session = (await repo.getSession(id))!;
    // до завершения онбординга finishWorkout работает как обычно
    const finished = await finishWorkout(repo, {
      session,
      results: [
        {
          exerciseId: "squat",
          unit: "reps",
          total: 10,
          clean: 7,
          shallow: 3,
          bestStreak: 4,
          errors: {},
        },
      ],
      bestSets: { squat: 10 },
      recordsBeaten: [],
      status: "done",
      durationSec: 120,
      now: NOW - 3 * 60_000,
    });
    await finishOnboarding(repo, DRAFT, { now: NOW, sessionId: id });
    const messages = await repo.listMessages("gromov");
    const verdict = finished.outcome!.verdictText;
    const texts = messages.map((m) => m.text);
    expect(texts[texts.indexOf(verdict)]).toBe(verdict);
    expect(messages[0]!.text).toBe(verdict);
    expect(messages[0]!.createdAt).toBeLessThan(messages[1]!.createdAt);
  });

  it("убирает временное состояние", async () => {
    await saveOnboardingState(repo, { step: "chat", draft: DRAFT });
    await finishOnboarding(repo, DRAFT, { now: NOW });
    expect((await loadOnboardingState(repo)).step).toBe("hello");
  });

  it("жёсткость 3 несовершеннолетнему не записывается, даже если попала в черновик", async () => {
    await finishOnboarding(repo, { ...DRAFT, harshness: 3 }, { now: NOW });
    expect((await repo.getProfile()).harshness).toBe(2);
  });
});

describe("подписи дней", () => {
  it("идут с понедельника", () => {
    expect(daysLabel([0, 5, 1])).toBe("Пн, Пт, Вс");
  });
});
