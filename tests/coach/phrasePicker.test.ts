import { describe, expect, it } from "vitest";
import { PICKER_CONFIG, PhrasePicker, fillTemplate } from "@/lib/coach/phrasePicker";
import { PHRASE_BANKS } from "@/lib/coach/phrases";
import { countWord, numberToWords } from "@/lib/coach/numberWords";
import { mulberry32 } from "@/lib/pose/simulator";
import type { Harshness } from "@/lib/data/types";

function picker(harshness: Harshness = 2, seed = 1) {
  return new PhrasePicker({ coachId: "gromov", harshness, rng: mulberry32(seed) });
}

describe("выбор фраз", () => {
  it("не повторяет последние 10 сказанных фраз", () => {
    const p = picker(2);
    const ids: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      // раз в 7 секунд: кулдауны не мешают, проверяем именно «без повторов»
      const picked = p.pick("rep_good", i * 7000);
      expect(picked).not.toBeNull();
      ids.push(picked!.phrase.id);
    }
    for (let i = 0; i < ids.length; i += 1) {
      const window = ids.slice(Math.max(0, i - 10), i);
      expect(window, `шаг ${i}`).not.toContain(ids[i]);
    }
  });

  it("если все фразы недавно звучали, берёт самую давнюю, а не падает", () => {
    // у «Громова» на уровне 1 в rep_good всего 8 подходящих фраз — меньше размера истории
    const p = picker(1);
    const ids: string[] = [];
    for (let i = 0; i < 40; i += 1) ids.push(p.pick("rep_good", i * 7000)!.phrase.id);
    expect(new Set(ids).size).toBe(8);
    // каждая новая фраза — самая давняя из доступных: подряд одинаковые не бывают
    for (let i = 1; i < ids.length; i += 1) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it("не чаще одной фразы раз в 2,5 секунды", () => {
    const p = picker();
    expect(p.pick("rep_good", 0)).not.toBeNull();
    expect(p.pick("idle_10s", PICKER_CONFIG.globalGapMs - 1)).toBeNull();
    expect(p.pick("idle_10s", PICKER_CONFIG.globalGapMs)).not.toBeNull();
  });

  it("одно и то же замечание о технике — не чаще раза в 15 секунд", () => {
    const p = picker();
    expect(p.pick("knees_cave_in", 0)).not.toBeNull();
    expect(p.pick("knees_cave_in", 10_000)).toBeNull();
    expect(p.pick("knees_cave_in", 14_999)).toBeNull();
    expect(p.pick("knees_cave_in", 15_000)).not.toBeNull();
    // другое замечание можно сразу после паузы между фразами
    expect(p.pick("too_fast", 15_000 + PICKER_CONFIG.globalGapMs)).not.toBeNull();
  });

  it("приоритет: безопасность перебивает, техника не перебивает безопасность", () => {
    const p = picker();
    expect(p.pick("rep_good", 0)).not.toBeNull();
    // внутри паузы: техника важнее похвалы — прерывает
    expect(p.pick("rep_shallow", 500)).not.toBeNull();
    // безопасность важнее техники — прерывает
    expect(p.pick("torso_lean", 900)).not.toBeNull();
    // теперь техника не может перебить безопасность
    expect(p.pick("knees_cave_in", 1200)).toBeNull();
    // похвала тем более
    expect(p.pick("rep_good", 1500)).toBeNull();
  });

  it("структурные события (начало подхода, вердикт) звучат всегда", () => {
    const p = picker();
    expect(p.pick("rep_good", 0)).not.toBeNull();
    expect(p.pick("set_start", 100)).not.toBeNull();
    expect(p.pick("set_end", 200)).not.toBeNull();
    expect(p.pick("verdict_great", 300)).not.toBeNull();
  });

  it("похвала за повторы не сыплется на каждый повтор (кулдаун 6 секунд)", () => {
    const p = picker();
    expect(p.pick("rep_good", 0)).not.toBeNull();
    expect(p.pick("rep_good", 3000)).toBeNull();
    expect(p.pick("rep_good", 5999)).toBeNull();
    expect(p.pick("rep_good", 6000)).not.toBeNull();
  });

  it("жёсткость 1 никогда не выдаёт фразы только для уровня 3", () => {
    const p = picker(1, 5);
    for (let i = 0; i < 200; i += 1) {
      const picked = p.pick("rep_shallow", i * 20_000, { exercise: "squat" });
      expect(picked!.phrase.levels).toContain(1);
    }
  });

  it("фраза «только для приседаний» не звучит в отжиманиях", () => {
    const p = picker(3, 2);
    let seenSquatOnly = false;
    for (let i = 0; i < 300; i += 1) {
      const picked = p.pick("rep_shallow", i * 20_000, { exercise: "pushup" });
      expect(picked!.phrase.exercise).not.toBe("squat");
    }
    const q = picker(3, 2);
    for (let i = 0; i < 300; i += 1) {
      const picked = q.pick("rep_shallow", i * 20_000, { exercise: "squat" });
      if (picked!.phrase.exercise === "squat") seenSquatOnly = true;
    }
    expect(seenSquatOnly).toBe(true);
  });

  it("шаблоны: без числа фраза с {count} не выбирается, с числом — подставляется", () => {
    const p = picker(2, 9);
    for (let i = 0; i < 200; i += 1) {
      const picked = p.pick("workout_complete", i * 20_000);
      expect(picked!.text).not.toMatch(/[{}]/);
    }
    const q = picker(2, 9);
    const texts = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      texts.add(q.pick("workout_complete", i * 20_000, { count: 27, name: "Алекс" })!.text);
    }
    expect([...texts].some((t) => t.includes("27") && t.includes("Алекс"))).toBe(true);
    expect([...texts].every((t) => !/[{}]/.test(t))).toBe(true);
  });

  it("reset забывает историю и кулдауны", () => {
    const p = picker();
    p.pick("knees_cave_in", 0);
    expect(p.pick("knees_cave_in", 1000)).toBeNull();
    p.reset();
    expect(p.pick("knees_cave_in", 1000)).not.toBeNull();
  });

  it("берёт фразы именно своего тренера", () => {
    const marina = new PhrasePicker({ coachId: "marina", harshness: 2, rng: mulberry32(3) });
    const picked = marina.pick("rep_good", 0)!;
    expect(picked.phrase.coachId).toBe("marina");
    expect(PHRASE_BANKS.marina.rep_good.map((x) => x.id)).toContain(picked.phrase.id);
  });
});

describe("шаблоны текста", () => {
  it("подставляет имя и числа", () => {
    expect(fillTemplate("{name}, всё. Итог — {count}.", { name: "Алекс", count: 12 })).toBe(
      "Алекс, всё. Итог — 12.",
    );
  });

  it("без имени убирает «{name}, » и поднимает первую букву", () => {
    expect(fillTemplate("{name}, всё. Итог — {count}.", { count: 3 })).toBe("Всё. Итог — 3.");
    expect(fillTemplate("{name}. Итог — {count}. Интересно.", { count: 3 })).toBe(
      "Итог — 3. Интересно.",
    );
  });
});

describe("числа прописью", () => {
  it.each([
    [0, "ноль"],
    [1, "один"],
    [3, "три"],
    [10, "десять"],
    [13, "тринадцать"],
    [20, "двадцать"],
    [42, "сорок два"],
    [100, "сто"],
    [115, "сто пятнадцать"],
    [999, "девятьсот девяносто девять"],
  ])("%i → %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("счёт повторений: «раз, два, три»", () => {
    expect([1, 2, 3, 4].map(countWord)).toEqual(["раз", "два", "три", "четыре"]);
  });
});
