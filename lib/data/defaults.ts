import { COACH_IDS, type CoachId, type Profile, type UserCoach } from "./types";

export function newAnonId(): string {
  return globalThis.crypto.randomUUID();
}

export function defaultProfile(now: number): Profile {
  return {
    id: "me",
    anonId: newAnonId(),
    name: "",
    ageBand: null,
    goal: null,
    minutesPerDay: 20,
    scheduleDays: [1, 3, 5],
    scheduleTime: "18:00",
    harshness: 2,
    voiceEnabled: true,
    notifFrequency: "normal",
    quietStart: "22:00",
    quietEnd: "08:00",
    activeCoachId: "gromov",
    onboardingDone: false,
    ageConfirmed13: false,
    safetyAccepted: false,
    clipPrivacyAccepted: false,
    debug: false,
    demo: false,
    supportPausedUntil: null,
    lastOpenedAt: null,
    createdAt: now,
  };
}

/** Начальное состояние отношений: Громов открыт сразу, остальные ждут своих условий. */
export function defaultUserCoach(coachId: CoachId, now: number): UserCoach {
  const unlocked = coachId === "gromov";
  return {
    coachId,
    score: 0,
    level: "despises",
    state: "normal",
    ignoringUntil: null,
    ignoreStartedAt: null,
    coldMessageDueAt: null,
    coldMessageSent: false,
    unlocked,
    unlockedAt: unlocked ? now : null,
    lastInteractionAt: null,
    lastWorkoutAt: null,
    lastDecayDay: null,
    statusPostedAt: null,
  };
}

export function allDefaultUserCoaches(now: number): UserCoach[] {
  return COACH_IDS.map((id) => defaultUserCoach(id, now));
}
