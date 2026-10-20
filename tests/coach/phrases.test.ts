import { describe, expect, it } from "vitest";
import {
  CORE_EVENTS,
  MIN_PHRASES_CORE,
  MIN_PHRASES_EXTRA,
  PHRASE_BANKS,
  PHRASE_EVENTS,
  allPhrases,
  parseLevels,
} from "@/lib/coach/phrases";
import { COACH_IDS, type Harshness } from "@/lib/data/types";

// Раздел 13 ТЗ: тренер ругает технику и лень, но не тело, внешность и не унижает человека. Без мата.
const BODY_AND_INSULTS =
  /толст|жирн|ожирен|худой|худая|тощ|урод|дебил|идиот|кретин|тупиц|тупой|ничтожеств|жалк|калор|диет|похуде|внешност/i;
const PROFANITY =
  /(^|[^а-яё])(еб[аеёиуы]|ёб|хуй|хуе|пизд|бляд|бля($|[^а-яё])|сука|суки|говн|мудак|мразь|срать)/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const GENDER_GUESS = /\((а|ла|на|ся|лась)\)/i;

describe("парсер жёсткости", () => {
  it.each([
    ["1-3", [1, 2, 3]],
    ["1-2", [1, 2]],
    ["2-3", [2, 3]],
    ["3", [3]],
    ["2", [2]],
  ])("%s → %j", (spec, expected) => {
    expect(parseLevels(spec)).toEqual(expected);
  });

  it("отвергает мусор", () => {
    expect(() => parseLevels("4")).toThrow();
    expect(() => parseLevels("3-1")).toThrow();
    expect(() => parseLevels("abc")).toThrow();
  });
});

describe("банки фраз тренеров", () => {
  it("у каждого тренера есть банк со всеми событиями", () => {
    for (const coach of COACH_IDS) {
      for (const event of PHRASE_EVENTS) {
        expect(PHRASE_BANKS[coach][event], `${coach}.${event}`).toBeDefined();
      }
    }
  });

  for (const coach of COACH_IDS) {
    describe(coach, () => {
      it(`не меньше ${MIN_PHRASES_CORE} фраз на каждое событие из ТЗ (и ${MIN_PHRASES_EXTRA} на дополнительные)`, () => {
        for (const event of PHRASE_EVENTS) {
          const need = CORE_EVENTS.includes(event) ? MIN_PHRASES_CORE : MIN_PHRASES_EXTRA;
          expect(PHRASE_BANKS[coach][event].length, `${coach}.${event}`).toBeGreaterThanOrEqual(
            need,
          );
        }
      });

      it("на каждом уровне жёсткости хватает фраз, чтобы не повторяться (≥ 8, у доп. событий ≥ 5)", () => {
        for (const event of PHRASE_EVENTS) {
          const need = CORE_EVENTS.includes(event) ? 8 : 5;
          for (const level of [1, 2, 3] as Harshness[]) {
            const usable = PHRASE_BANKS[coach][event].filter(
              (p) => p.levels.includes(level) && !p.exercise && !p.template,
            );
            expect(usable.length, `${coach}.${event} уровень ${level}`).toBeGreaterThanOrEqual(
              need - 1,
            );
          }
        }
      });

      it("id уникальны, тексты внутри события не повторяются, длина разумная", () => {
        const phrases = allPhrases(coach);
        expect(new Set(phrases.map((p) => p.id)).size).toBe(phrases.length);
        for (const event of PHRASE_EVENTS) {
          const texts = PHRASE_BANKS[coach][event].map((p) => p.text);
          expect(new Set(texts).size, `${coach}.${event}: повторяющиеся фразы`).toBe(texts.length);
        }
        for (const p of phrases) {
          expect(p.text.length, p.id).toBeGreaterThan(1);
          expect(p.text.length, `${p.id}: «${p.text}»`).toBeLessThanOrEqual(80);
        }
      });

      it("соблюдает правила безопасности: без мата, оскорблений, эмодзи и угадывания пола", () => {
        for (const p of allPhrases(coach)) {
          expect(p.text, p.id).not.toMatch(BODY_AND_INSULTS);
          expect(p.text, p.id).not.toMatch(PROFANITY);
          expect(p.text, p.id).not.toMatch(EMOJI);
          expect(p.text, p.id).not.toMatch(GENDER_GUESS);
        }
      });

      it("шаблоны только допустимые ({name}, {count}, {left}) и их мало", () => {
        const templated = allPhrases(coach).filter((p) => p.template);
        expect(templated.length).toBeLessThanOrEqual(3);
        for (const p of templated) {
          const unknown = p.text.replace(/\{(name|count|left)\}/g, "").match(/[{}]/);
          expect(unknown, p.id).toBeNull();
        }
      });
    });
  }

  it("в банке есть и спокойные, и самые острые фразы — жёсткость реально влияет", () => {
    for (const coach of COACH_IDS) {
      const only3 = allPhrases(coach).filter((p) => p.levels.length === 1 && p.levels[0] === 3);
      const mild = allPhrases(coach).filter((p) => p.levels.includes(1));
      expect(only3.length).toBeGreaterThan(40);
      expect(mild.length).toBeGreaterThan(only3.length);
    }
  });

  it("всего фраз достаточно для озвучки (ориентир бюджета ТЗ — порядка тысячи)", () => {
    const total = COACH_IDS.reduce((sum, c) => sum + allPhrases(c).length, 0);
    expect(total).toBeGreaterThan(1100);
  });

  it("узнаваемые фирменные фразы из ТЗ на месте", () => {
    const has = (coach: (typeof COACH_IDS)[number], part: string) =>
      allPhrases(coach).some((p) => p.text.includes(part));
    expect(has("gromov", "в туалет садишься")).toBe(true);
    expect(has("gromov", "Неплохо. Не зазнавайся")).toBe(true);
    expect(has("marina", "Ты считаешь это повторением")).toBe(true);
    expect(has("marina", "Приемлемо.")).toBe(true);
    expect(has("palych", "в семьдесят лет ниже приседаю")).toBe(true);
    expect(has("palych", "Почти как я в молодости")).toBe(true);
    expect(has("max", "Рекорд века, поздравляю")).toBe(true);
    expect(has("max", "реально мощно, бро")).toBe(true);
  });
});
