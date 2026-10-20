import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import rating from "@/content/rating-lines.json";
import { allPhrases } from "@/lib/coach/phrases";
import { SCRIPTED_BANKS } from "@/lib/coach/scripted";
import { COACH_IDS } from "@/lib/data/types";
import ru from "@/locales/ru.json";
import { checkCoachReply } from "@/lib/safety/guard";

/**
 * Аудит ВСЕГО, что тренеры могут сказать из заготовок: ни одна реплика не должна нарушать раздел 10 ТЗ
 * (оскорбления тела и личности, флирт, мат, советы по лекарствам и диетам).
 */
const fill = (text: string) => text.replace(/\{[a-z_]+\}/gi, "Алекс");

function violations(texts: readonly string[]): string[] {
  return texts.filter((t) => !checkCoachReply(fill(t)).ok);
}

describe("заготовки тренеров", () => {
  for (const coach of COACH_IDS) {
    it(`${coach}: банк фраз тренировки (${allPhrases(coach).length} фраз) чистый`, () => {
      expect(violations(allPhrases(coach).map((p) => p.text))).toEqual([]);
    });

    it(`${coach}: ответы в чате (заготовки) чистые`, () => {
      const texts = Object.values(SCRIPTED_BANKS[coach]).flatMap((lines) =>
        lines.map((l) => l.text),
      );
      expect(texts.length).toBeGreaterThan(100);
      expect(violations(texts)).toEqual([]);
    });

    it(`${coach}: примеры реплик из persona.md чистые`, () => {
      const persona = readFileSync(
        join(process.cwd(), "content", "coaches", coach, "persona.md"),
        "utf8",
      );
      const quotes = [...persona.matchAll(/^\d+\.\s*«(.+)»\.?\s*$/gm)].map((m) => m[1]!);
      expect(quotes.length).toBeGreaterThanOrEqual(15);
      expect(violations(quotes)).toEqual([]);
    });
  }

  it("реплики про рейтинг и дуэли чистые", () => {
    const texts = Object.values(rating.lines).flatMap((bank) => Object.values(bank).flat());
    expect(violations(texts)).toEqual([]);
  });

  it("тексты безопасности (боль, еда, кризис, лекарства) тоже проходят проверку", () => {
    const texts = [ru.safety.pain, ru.safety.eating, ru.safety.crisis, ru.safety.medical];
    // отказ от советов называет тему («лекарства», «добавки»), поэтому медицинские слова тут допустимы
    expect(texts.filter((t) => !checkCoachReply(t, { allowMedicalTerms: true }).ok)).toEqual([]);
    expect(violations([ru.safety.pain, ru.safety.eating, ru.safety.crisis])).toEqual([]);
  });
});

describe("в банках есть реплики на каждый уровень жёсткости (кроме запрета «без пощады» для подростков)", () => {
  it("у каждого тренера и события есть фразы уровней 1 и 2, то есть подростку всегда есть что сказать", () => {
    for (const coach of COACH_IDS) {
      const phrases = allPhrases(coach);
      const events = [...new Set(phrases.map((p) => p.event))];
      for (const event of events) {
        for (const level of [1, 2] as const) {
          expect(
            phrases.filter((p) => p.event === event && p.levels.includes(level)).length,
            `${coach}.${event}.${level}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
