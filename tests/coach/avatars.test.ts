import { describe, expect, it } from "vitest";
import { avatarSvgString } from "@/lib/coach/avatars";
import { COACH_IDS, EMOTIONS } from "@/lib/data/types";

describe("аватары тренеров", () => {
  it("у каждого тренера есть все 6 эмоций, и они отличаются друг от друга", () => {
    for (const coach of COACH_IDS) {
      const svgs = EMOTIONS.map((e) => avatarSvgString(coach, e));
      expect(new Set(svgs).size).toBe(EMOTIONS.length);
      for (const svg of svgs) {
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain('viewBox="0 0 100 100"');
      }
    }
  });

  it("у тренеров разные внешности", () => {
    const set = new Set(COACH_IDS.map((c) => avatarSvgString(c, "neutral")));
    expect(set.size).toBe(COACH_IDS.length);
  });
});
