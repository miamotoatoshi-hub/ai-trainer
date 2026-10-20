import lines from "@/content/rating-lines.json";
import type { CoachId } from "@/lib/data/types";
import type { DuelOutcome } from "./duels";
import type { LeaderboardEntry } from "./friends";

export type RatingCategory = "alone" | "leader" | "behind" | "duel_win" | "duel_lose" | "duel_draw";

type Bank = Record<RatingCategory, string[]>;
const BANKS = lines.lines as Record<CoachId, Bank>;

function fill(template: string, name: string, n: number): string {
  return template.replace("{name}", name).replace("{n}", String(n));
}

/** Реплика тренера по категории; `rng` — для тестов. */
export function ratingLine(
  coachId: CoachId,
  category: RatingCategory,
  params: { name?: string; n?: number } = {},
  rng: () => number = Math.random,
): string {
  const bank = BANKS[coachId][category];
  const template = bank[Math.floor(rng() * bank.length)]!;
  return fill(template, params.name ?? "", params.n ?? 0);
}

/** Что тренер говорит про таблицу недели. */
export function leaderboardComment(
  coachId: CoachId,
  board: readonly LeaderboardEntry[],
  rng: () => number = Math.random,
): string {
  const active = board.filter((e) => e.me || !e.stale);
  if (board.length <= 1) return ratingLine(coachId, "alone", {}, rng);
  const me = board.find((e) => e.me)!;
  const best = board.filter((e) => !e.me).sort((a, b) => b.weekly - a.weekly)[0]!;
  if (me.weekly > 0 && me.weekly >= best.weekly && active.length > 1) {
    return ratingLine(coachId, "leader", {}, rng);
  }
  return ratingLine(
    coachId,
    "behind",
    { name: best.name, n: Math.max(0, best.weekly - me.weekly) },
    rng,
  );
}

/** Что тренер говорит про итог дуэли. */
export function duelComment(
  coachId: CoachId,
  outcome: DuelOutcome,
  theirName: string,
  diff: number,
  rng: () => number = Math.random,
): string | null {
  if (outcome === "pending") return null;
  const category: RatingCategory =
    outcome === "win" ? "duel_win" : outcome === "lose" ? "duel_lose" : "duel_draw";
  return ratingLine(coachId, category, { name: theirName, n: diff }, rng);
}
