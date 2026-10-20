import { getCoach } from "@/lib/coach/coaches";
import { pickScripted } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import type { CoachId, UserCoach } from "@/lib/data/types";
import { RELATIONSHIP_CONFIG } from "@/lib/relationship/config";
import {
  applyEvents,
  daysToCharge,
  decayEvents,
  type ScoredEvent,
} from "@/lib/relationship/engine";
import { dayKey, DAY, HOUR, startOfDay } from "@/lib/time";
import { WORKOUT_GRACE_MS } from "./hero";
import { deliverColdMessageIfDue, liftIgnoring, startIgnoring } from "./ignoring";
import { ensureSchedule } from "./schedule";

export interface AppOpenReport {
  missed: { scheduledId: string; coachId: CoachId }[];
  ignoringStarted: CoachId[];
  ignoringEnded: CoachId[];
  decayed: Partial<Record<CoachId, number>>;
  coldMessages: CoachId[];
  statusPosted: CoachId[];
}

/** Через сколько дней молчания тренер выкладывает «статус». */
export const STATUS_AFTER_DAYS = 7;

/** Статус не чаще раза в неделю. */
const STATUS_REPEAT_MS = 7 * DAY;

async function applyScored(
  repo: Repository,
  coach: UserCoach,
  events: readonly ScoredEvent[],
  now: number,
  extra: Partial<UserCoach> = {},
): Promise<UserCoach> {
  // Штрафы потолком не ограничиваются, поэтому gainedToday не важен.
  const result = applyEvents({ score: coach.score, level: coach.level }, events, 0);
  for (const e of result.applied) {
    await repo.addRelationshipEvent({
      coachId: coach.coachId,
      type: e.type,
      delta: e.delta,
      rawDelta: e.raw,
      day: dayKey(now),
      createdAt: now,
    });
  }
  const updated: UserCoach = {
    ...coach,
    score: result.state.score,
    level: result.state.level,
    ...extra,
  };
  await repo.putUserCoach(updated);
  return updated;
}

/**
 * Всё, что происходит «пока приложение было закрыто»: пропущенные тренировки (штраф и игнор),
 * окончание игнора, штраф за дни без тренировки, холодное сообщение, «статус» после долгого молчания.
 * Считается по прошедшему времени при открытии приложения и раз в минуту, пока оно открыто.
 */
export async function runAppOpen(repo: Repository, now: number): Promise<AppOpenReport> {
  const report: AppOpenReport = {
    missed: [],
    ignoringStarted: [],
    ignoringEnded: [],
    decayed: {},
    coldMessages: [],
    statusPosted: [],
  };
  const profile = await repo.getProfile();
  const previousOpen = profile.lastOpenedAt;
  await repo.updateProfile({ lastOpenedAt: now });
  if (!profile.onboardingDone) return report;

  const paused = profile.supportPausedUntil !== null && profile.supportPausedUntil > now;
  await ensureSchedule(repo, now);

  // 1. Пропущенные плановые тренировки: штраф −8 и игнор.
  const scheduled = await repo.listScheduled();
  for (const item of scheduled) {
    if (item.status !== "planned" || now <= item.scheduledAt + WORKOUT_GRACE_MS) continue;
    await repo.putScheduled({ ...item, status: "missed" });
    report.missed.push({ scheduledId: item.id, coachId: item.coachId });
    let coach = await repo.getUserCoach(item.coachId);
    coach = await applyScored(
      repo,
      coach,
      [{ type: "missed_workout", raw: RELATIONSHIP_CONFIG.deltas.missedWorkout }],
      now,
    );
    const since = item.scheduledAt + WORKOUT_GRACE_MS;
    const hours = getCoach(item.coachId).ignoreHours;
    // Игнор имеет смысл, только если его срок ещё не вышел; при сигнале кризиса игнора нет.
    if (!paused && coach.unlocked && since + hours * HOUR > now) {
      await repo.putUserCoach(startIgnoring(coach, since));
      report.ignoringStarted.push(item.coachId);
    }
  }

  // 2. Игнор закончился (по сроку) или выключен из-за кризиса.
  for (const coach of await repo.listUserCoaches()) {
    const expired =
      coach.state === "ignoring" && (coach.ignoringUntil === null || coach.ignoringUntil <= now);
    if (coach.state === "ignoring" && (expired || paused)) {
      await repo.putUserCoach(liftIgnoring(coach));
      report.ignoringEnded.push(coach.coachId);
    }
  }

  // 3. Штраф −2 за каждый следующий день без тренировки (одинаково для всех открытых тренеров).
  if (!paused) {
    const sessions = await repo.listSessions();
    const lastWorkout = sessions
      .filter((s) => s.status === "done")
      .reduce((max, s) => Math.max(max, s.endedAt ?? s.startedAt), profile.createdAt);
    for (const coach of await repo.listUserCoaches()) {
      if (!coach.unlocked) continue;
      // Тренер, открывшийся позже, за дни до знакомства не штрафует.
      const baseline = Math.max(lastWorkout, coach.unlockedAt ?? 0);
      const days = daysToCharge(baseline, coach.lastDecayDay, now);
      if (days.length === 0) continue;
      await applyScored(repo, coach, decayEvents(days), now, {
        lastDecayDay: days[days.length - 1]!,
      });
      report.decayed[coach.coachId] = days.length * RELATIONSHIP_CONFIG.deltas.dayWithoutWorkout;
    }
  }

  // 4. Единственное «холодное» сообщение за период игнора.
  for (const coach of await repo.listUserCoaches()) {
    if (await deliverColdMessageIfDue(repo, coach.coachId, now))
      report.coldMessages.push(coach.coachId);
  }

  // 5. Долгое молчание: тренер выкладывает «статус» (раз в неделю).
  if (!paused && previousOpen !== null && now - previousOpen >= STATUS_AFTER_DAYS * DAY) {
    const coach = await repo.getUserCoach(profile.activeCoachId);
    if (
      coach.unlocked &&
      (coach.statusPostedAt === null || now - coach.statusPostedAt >= STATUS_REPEAT_MS)
    ) {
      const postedAt = Math.max(previousOpen + STATUS_AFTER_DAYS * DAY, startOfDay(now) - 1);
      await repo.addMessage({
        coachId: coach.coachId,
        sender: "coach",
        type: "status",
        text: pickScripted(coach.coachId, "status_new_student", profile.harshness),
        emotion: "contempt",
        durationSec: null,
        meta: { source: "away" },
        readAt: null,
        createdAt: Math.min(postedAt, now),
      });
      await repo.putUserCoach({ ...(await repo.getUserCoach(coach.coachId)), statusPostedAt: now });
      report.statusPosted.push(coach.coachId);
    }
  }
  return report;
}
