import { describe, expect, it } from "vitest";
import { defaultUserCoach } from "@/lib/data/defaults";
import type { CoachId, RelationshipLevel, UserCoach } from "@/lib/data/types";
import { nextLockedCoach, unlockedByRules, unlockHint } from "@/lib/game/unlock";

function coaches(levels: Partial<Record<CoachId, RelationshipLevel>> = {}): UserCoach[] {
  return (["gromov", "marina", "palych", "max"] as const).map((id) => ({
    ...defaultUserCoach(id, 0),
    level: levels[id] ?? "despises",
  }));
}

describe("разблокировка тренеров", () => {
  it("вначале открыт только Громов", () => {
    expect(unlockedByRules(coaches(), 0)).toEqual(["gromov"]);
  });

  it("Марина — при «Терпит» с Громовым", () => {
    expect(unlockedByRules(coaches({ gromov: "tolerates" }), 0)).toEqual(["gromov", "marina"]);
  });

  it("Палыч — при «Уважает» с любым тренером", () => {
    expect(unlockedByRules(coaches({ marina: "respects" }), 0)).toContain("palych");
    expect(unlockedByRules(coaches({ gromov: "tolerates" }), 0)).not.toContain("palych");
  });

  it("Макс — серия 7 дней", () => {
    expect(unlockedByRules(coaches(), 6)).not.toContain("max");
    expect(unlockedByRules(coaches(), 7)).toContain("max");
  });

  it("подсказки и следующий закрытый тренер", () => {
    expect(unlockHint("marina")).toBe("Откроется, когда Громов начнёт тебя терпеть");
    expect(unlockHint("max")).toBe("Откроется, когда ты потренируешься 7 дней подряд");
    expect(nextLockedCoach(coaches())).toBe("marina");
    const all = coaches().map((c) => ({ ...c, unlocked: true }));
    expect(nextLockedCoach(all)).toBeNull();
  });
});
