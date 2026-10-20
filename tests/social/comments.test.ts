import { describe, expect, it } from "vitest";
import rating from "@/content/rating-lines.json";
import { COACH_IDS } from "@/lib/data/types";
import { checkCoachReply } from "@/lib/safety/guard";
import {
  duelComment,
  leaderboardComment,
  ratingLine,
  type RatingCategory,
} from "@/lib/social/comments";
import type { LeaderboardEntry } from "@/lib/social/friends";

const CATEGORIES: RatingCategory[] = [
  "alone",
  "leader",
  "behind",
  "duel_win",
  "duel_lose",
  "duel_draw",
];

describe("реплики про рейтинг", () => {
  it("у каждого тренера есть минимум 3 реплики в каждой категории", () => {
    for (const coach of COACH_IDS) {
      const bank = (rating.lines as Record<string, Record<string, string[]>>)[coach]!;
      for (const category of CATEGORIES) expect(bank[category]!.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("все реплики проходят проверку безопасности и подставляют имя", () => {
    for (const coach of COACH_IDS) {
      const bank = (rating.lines as Record<string, Record<string, string[]>>)[coach]!;
      for (const category of CATEGORIES) {
        for (const line of bank[category]!) {
          expect(checkCoachReply(line.replace("{name}", "Аня").replace("{n}", "5")).ok, line).toBe(
            true,
          );
        }
      }
    }
    expect(ratingLine("gromov", "behind", { name: "Аня", n: 7 }, () => 0)).toContain("Аня");
    expect(ratingLine("gromov", "behind", { name: "Аня", n: 7 }, () => 0)).not.toContain("{");
  });

  const me = (weekly: number): LeaderboardEntry => ({
    id: "me",
    name: "Я",
    weekly,
    me: true,
    stale: false,
  });
  const friend = (weekly: number): LeaderboardEntry => ({
    id: "f",
    name: "Аня",
    weekly,
    me: false,
    stale: false,
  });

  it("таблица: одиночка, лидер и отстающий получают разные категории", () => {
    const alone = ratingLine("max", "alone", {}, () => 0);
    expect(leaderboardComment("max", [me(5)], () => 0)).toBe(alone);
    expect(leaderboardComment("gromov", [me(20), friend(10)], () => 0)).toBe(
      ratingLine("gromov", "leader", {}, () => 0),
    );
    expect(leaderboardComment("gromov", [friend(30), me(10)], () => 0)).toContain("Аня");
    // без единого повторения «лидером» себя не назовёшь
    expect(leaderboardComment("gromov", [me(0), friend(0)], () => 0)).toContain("Аня");
  });

  it("дуэль: комментарий зависит от исхода, пока соперник не ответил — тишина", () => {
    expect(duelComment("palych", "pending", "Аня", 0)).toBeNull();
    expect(duelComment("palych", "win", "Аня", 5, () => 0)).toContain("Аня");
    expect(duelComment("palych", "draw", "Аня", 0, () => 0)).toBeTruthy();
  });
});
