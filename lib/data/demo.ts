import { addDays, atClock, dayKey, DAY, HOUR, MINUTE } from "@/lib/time";
import { defaultUserCoach } from "./defaults";
import type { Repository } from "./repository";
import type {
  CoachId,
  Emotion,
  NewMessage,
  RelationshipLevel,
  UserCoach,
  WorkoutSession,
} from "./types";

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function message(
  coachId: CoachId,
  sender: NewMessage["sender"],
  createdAt: number,
  partial: Partial<NewMessage> & Pick<NewMessage, "text">,
): NewMessage {
  return {
    coachId,
    sender,
    type: "text",
    emotion: null,
    durationSec: null,
    meta: {},
    // Сообщения демо-переписки «давние» считаются прочитанными, если не указано иное.
    readAt: createdAt + MINUTE,
    createdAt,
    ...partial,
  };
}

function coachState(
  coachId: CoachId,
  now: number,
  score: number,
  level: RelationshipLevel,
  extra: Partial<UserCoach> = {},
): UserCoach {
  return {
    ...defaultUserCoach(coachId, now),
    score,
    level,
    unlocked: true,
    unlockedAt: now - 20 * DAY,
    lastInteractionAt: now - HOUR,
    ...extra,
  };
}

function doneSession(
  coachId: CoachId,
  planId: string,
  startedAt: number,
  total: number,
  clean: number,
): WorkoutSession {
  const exerciseId = planId === "upper-15" ? "pushup" : "squat";
  return {
    id: uuid(),
    coachId,
    planId,
    mode: "plan",
    startedAt,
    endedAt: startedAt + 18 * MINUTE,
    status: "done",
    scheduledId: null,
    totalReps: total,
    cleanReps: clean,
    shallowReps: 2,
    bestStreak: Math.max(3, clean - 4),
    durationSec: 18 * 60,
    results: [
      {
        exerciseId,
        unit: "reps",
        total,
        clean,
        shallow: 2,
        bestStreak: Math.max(3, clean - 4),
        errors: { rep_shallow: 2 },
      },
    ],
    personalRecords: [],
    outcome: null,
  };
}

/**
 * Режим демо: открывает всех тренеров и заполняет данные как на макетах —
 * чтобы было что показать друзьям. Стирает прежние данные.
 */
export async function seedDemo(repo: Repository, now: number = Date.now()): Promise<void> {
  await repo.deleteAll();

  await repo.updateProfile({
    name: "Алекс",
    ageBand: "18+",
    goal: "strength",
    minutesPerDay: 20,
    scheduleDays: [1, 3, 5],
    scheduleTime: "18:00",
    harshness: 2,
    onboardingDone: true,
    ageConfirmed13: true,
    safetyAccepted: true,
    activeCoachId: "gromov",
    demo: true,
    lastOpenedAt: now,
  });

  // --- тренеры ---
  const yesterday = addDays(now, -1);
  await repo.putUserCoach(
    coachState("gromov", now, 8, "despises", { lastWorkoutAt: now - 3 * DAY, lastDecayDay: null }),
  );
  await repo.putUserCoach(
    coachState("marina", now, 31, "tolerates", {
      state: "ignoring",
      ignoreStartedAt: now - 14 * HOUR,
      ignoringUntil: now + 10 * HOUR,
      lastWorkoutAt: now - 4 * DAY,
    }),
  );
  await repo.putUserCoach(coachState("palych", now, 38, "tolerates", { lastWorkoutAt: yesterday }));
  await repo.putUserCoach(coachState("max", now, 58, "respects", { lastWorkoutAt: now - 8 * DAY }));

  // --- расписание: сегодня тренировка с Громовым, вчерашнюю он не дождался ---
  let todaySlot = atClock(now, "18:00");
  if (todaySlot < now + 30 * MINUTE) todaySlot = atClock(addDays(now, 1), "18:00");
  const plannedId = uuid();
  await repo.putScheduled({
    id: plannedId,
    coachId: "gromov",
    planId: "legs-20",
    scheduledAt: todaySlot,
    status: "planned",
  });
  await repo.putScheduled({
    id: uuid(),
    coachId: "gromov",
    planId: "legs-20",
    scheduledAt: atClock(yesterday, "18:00"),
    status: "missed",
  });
  await repo.putScheduled({
    id: uuid(),
    coachId: "gromov",
    planId: "upper-15",
    scheduledAt: atClock(addDays(todaySlot, 2), "18:00"),
    status: "planned",
  });

  // Утреннее «подъём» в демо уже «отправлено» — в переписке ниже оно есть, повторять не нужно.
  await repo.addNotificationLog({
    kind: "morning",
    coachId: "gromov",
    day: dayKey(now),
    sentAt: now,
  });

  // --- переписки ---
  const emotionOf = (e: Emotion): Pick<NewMessage, "emotion"> => ({ emotion: e });

  // Громов: вчера ждал, сегодня три непрочитанных
  const gYesterdayA = atClock(yesterday, "18:07");
  const gYesterdayB = atClock(yesterday, "19:30");
  const base = Math.min(atClock(now, "07:12"), now - 2 * MINUTE);
  await repo.addMessage(
    message("gromov", "coach", gYesterdayA, {
      text: "18:00 прошло. Я стоял с секундомером, как дурак. Где ты?",
      ...emotionOf("angry"),
    }),
  );
  await repo.addMessage(
    message("gromov", "coach", gYesterdayB, {
      text: "Молчишь. Понятно.",
      ...emotionOf("contempt"),
    }),
  );
  await repo.addMessage(
    message("gromov", "user", base - 7 * MINUTE, {
      text: "Прости, был занят",
      readAt: base - 6 * MINUTE,
    }),
  );
  await repo.addMessage(
    message("gromov", "coach", base - 6 * MINUTE, {
      text: "Занят он. Сегодня в 18:00 — ноги. Опоздаешь — плюс 10 приседаний за каждую минуту.",
      ...emotionOf("angry"),
    }),
  );
  await repo.addMessage(
    message("gromov", "coach", base - 2 * MINUTE, {
      type: "workout_card",
      text: "Тренировка: ноги",
      meta: { planId: "legs-20", scheduledId: plannedId, scheduledAt: todaySlot, source: "away" },
      readAt: null,
    }),
  );
  await repo.addMessage(
    message("gromov", "coach", base - MINUTE, {
      type: "voice",
      text: "Слушай внимательно. Вечером ноги. Телефон на пол, сам — в кадр. Всё.",
      durationSec: 14,
      meta: { transcript: "Слушай внимательно. Вечером ноги. Телефон на пол, сам — в кадр. Всё." },
      ...emotionOf("neutral"),
      readAt: null,
    }),
  );
  await repo.addMessage(
    message("gromov", "coach", base, {
      text: "Ты где был вчера? В 18:00 жду. Опоздаешь — пожалеешь.",
      ...emotionOf("angry"),
      readAt: null,
    }),
  );

  // Марина: игнорирует, последнее сообщение — моё
  await repo.addMessage(
    message("marina", "coach", atClock(yesterday, "18:40"), {
      text: "Интересно. Расписание ты читать умеешь?",
      ...emotionOf("contempt"),
    }),
  );
  await repo.addMessage(
    message("marina", "user", atClock(yesterday, "21:40"), {
      text: "Прости, завтра точно приду",
      readAt: atClock(yesterday, "21:41"),
    }),
  );

  // Палыч: голосовое 0:14, одно непрочитанное, «Пн»-подобная дата (3 дня назад)
  const palychAt = now - 3 * DAY;
  await repo.addMessage(
    message("palych", "coach", palychAt, {
      type: "voice",
      text: "Внучок, слушай. В моё время такого лентяя и в зал бы не пустили. Но я добрый. Приходи завтра.",
      durationSec: 14,
      meta: {
        transcript:
          "Внучок, слушай. В моё время такого лентяя и в зал бы не пустили. Но я добрый. Приходи завтра.",
      },
      ...emotionOf("disappointed"),
      readAt: null,
    }),
  );

  // Макс: рекорд отжиманий, 8 дней назад
  await repo.addMessage(
    message("max", "coach", now - 8 * DAY, {
      text: "Целых 8 отжиманий. Рекорд века, поздравляю.",
      ...emotionOf("contempt"),
    }),
  );

  // --- история: серия 5 дней (вчера была тренировка с Палычем) ---
  const coachesForDays: CoachId[] = ["max", "palych", "max", "gromov", "palych"];
  for (let i = 0; i < 5; i += 1) {
    const dayStart = addDays(now, -(5 - i));
    const startedAt = atClock(dayStart, i % 2 === 0 ? "18:00" : "19:15");
    await repo.putSession(
      doneSession(
        coachesForDays[i]!,
        i % 2 === 0 ? "legs-20" : "upper-15",
        startedAt,
        24 + i * 2,
        17 + i * 2,
      ),
    );
  }

  // --- рекорды ---
  await repo.putRecord({
    exerciseId: "squat",
    bestTotal: 32,
    bestClean: 26,
    updatedAt: now - 2 * DAY,
  });
  await repo.putRecord({
    exerciseId: "pushup",
    bestTotal: 8,
    bestClean: 6,
    updatedAt: now - 8 * DAY,
  });
  await repo.putRecord({
    exerciseId: "plank",
    bestTotal: 45,
    bestClean: 38,
    updatedAt: now - 6 * DAY,
  });

  // --- память тренера ---
  await repo.addMemory({
    coachId: "gromov",
    fact: "по вторникам футбол",
    kind: "fact",
    createdAt: now - 5 * DAY,
  });
}
