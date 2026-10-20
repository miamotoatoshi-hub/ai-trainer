import type { Repository } from "@/lib/data/repository";
import type { Profile, ScheduledWorkout } from "@/lib/data/types";
import { WORKOUT_GRACE_MS } from "@/lib/game/hero";
import { addDays, atClock, dayKey } from "@/lib/time";

/** Планы по кругу: первый день расписания — ноги, второй — верх, третий — корпус. */
export const PLAN_ROTATION = ["legs-20", "upper-15", "core-10"] as const;

export const SCHEDULE_HORIZON_DAYS = 14;

export interface Slot {
  scheduledAt: number;
  planId: string;
}

/** Слоты тренировок на ближайшие дни по расписанию из профиля. */
export function slotsForProfile(
  profile: Pick<Profile, "scheduleDays" | "scheduleTime">,
  now: number,
  horizonDays: number = SCHEDULE_HORIZON_DAYS,
): Slot[] {
  const days = [...new Set(profile.scheduleDays)].sort((a, b) => a - b);
  const slots: Slot[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = addDays(now, offset);
    const weekday = new Date(day).getDay();
    const index = days.indexOf(weekday);
    if (index < 0) continue;
    const scheduledAt = atClock(day, profile.scheduleTime);
    // Сегодняшний слот, который уже давно прошёл, в расписание не добавляем (его не пропустили, он просто в прошлом).
    if (scheduledAt < now - WORKOUT_GRACE_MS) continue;
    slots.push({ scheduledAt, planId: PLAN_ROTATION[index % PLAN_ROTATION.length]! });
  }
  return slots;
}

/** Добавляет недостающие плановые тренировки на ближайшие две недели. */
export async function ensureSchedule(repo: Repository, now: number): Promise<number> {
  const profile = await repo.getProfile();
  if (!profile.onboardingDone) return 0;
  const existing = await repo.listScheduled();
  const have = new Set(existing.map((s) => `${dayKey(s.scheduledAt)}|${s.coachId}`));
  let created = 0;
  for (const slot of slotsForProfile(profile, now)) {
    const key = `${dayKey(slot.scheduledAt)}|${profile.activeCoachId}`;
    if (have.has(key)) continue;
    await repo.putScheduled({
      id: globalThis.crypto.randomUUID(),
      coachId: profile.activeCoachId,
      planId: slot.planId,
      scheduledAt: slot.scheduledAt,
      status: "planned",
    });
    created += 1;
  }
  return created;
}

/** Пересобирает будущие плановые тренировки (после смены расписания или тренера). */
export async function rebuildSchedule(repo: Repository, now: number): Promise<void> {
  const existing = await repo.listScheduled();
  for (const s of existing) {
    if (s.status === "planned" && s.scheduledAt >= now - WORKOUT_GRACE_MS) {
      await repo.deleteScheduled(s.id);
    }
  }
  await ensureSchedule(repo, now);
}

/** Какой плановой тренировке соответствует начатая сейчас: по id из карточки или ближайшая сегодняшняя того же тренера. */
export function matchScheduled(
  scheduled: readonly ScheduledWorkout[],
  coachId: string,
  scheduledId: string | null,
  startedAt: number,
): ScheduledWorkout | null {
  if (scheduledId) {
    const exact = scheduled.find((s) => s.id === scheduledId);
    if (exact) return exact;
  }
  const sameDay = scheduled
    .filter(
      (s) =>
        s.coachId === coachId &&
        s.status === "planned" &&
        dayKey(s.scheduledAt) === dayKey(startedAt),
    )
    .sort((a, b) => Math.abs(a.scheduledAt - startedAt) - Math.abs(b.scheduledAt - startedAt));
  return sameDay[0] ?? null;
}
