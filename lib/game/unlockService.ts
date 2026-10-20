import { pickScripted } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import type { CoachId } from "@/lib/data/types";
import { computeStreak } from "./streak";
import { unlockedByRules } from "./unlock";

/**
 * Открывает тренеров, чьи условия выполнены (по уровню отношений и серии дней).
 * Открытый тренер остаётся открытым. Новый тренер сразу здоровается в своём чате.
 */
export async function applyUnlocks(repo: Repository, now: number): Promise<CoachId[]> {
  const [coaches, sessions, profile] = await Promise.all([
    repo.listUserCoaches(),
    repo.listSessions(),
    repo.getProfile(),
  ]);
  const streak = computeStreak(
    sessions.filter((s) => s.status === "done").map((s) => s.endedAt ?? s.startedAt),
    now,
  );
  const should = new Set(unlockedByRules(coaches, streak));
  const newly: CoachId[] = [];
  for (const coach of coaches) {
    if (coach.unlocked || !should.has(coach.coachId)) continue;
    await repo.putUserCoach({ ...coach, unlocked: true, unlockedAt: now });
    await repo.addMessage({
      coachId: coach.coachId,
      sender: "coach",
      type: "text",
      text: pickScripted(coach.coachId, "greeting", profile.harshness),
      emotion: "neutral",
      durationSec: null,
      meta: { source: "scripted" },
      readAt: null,
      createdAt: now,
    });
    newly.push(coach.coachId);
  }
  return newly;
}
