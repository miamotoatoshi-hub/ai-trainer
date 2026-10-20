import { describe, expect, it } from "vitest";
import { PhrasePicker } from "@/lib/coach/phrasePicker";
import { PHRASE_BANKS } from "@/lib/coach/phrases";
import { CLIP_WEIGHTS, CoachDirector, qualityOf, subtitleDuration } from "@/lib/workout/director";
import type { RunnerEvent, Step } from "@/lib/workout/runner";
import { mulberry32 } from "@/lib/pose/simulator";

const STEP: Step = { kind: "set", exercise: "squat", setIndex: 0, setsTotal: 3, reps: 10 };

function director(coachId: "gromov" | "marina" = "gromov", harshness: 1 | 2 | 3 = 2) {
  return new CoachDirector({
    coachId,
    harshness,
    userName: "Алекс",
    picker: new PhrasePicker({ coachId, harshness, rng: mulberry32(4) }),
  });
}

const rep = (
  count: number,
  clean = true,
  errors: Extract<RunnerEvent, { type: "rep" }>["errors"] = [],
): RunnerEvent => ({
  type: "rep",
  step: STEP,
  count,
  clean,
  errors,
});

describe("режиссёр тренера", () => {
  it("начало подхода: субтитр, голос и эмоция", () => {
    const [out] = director().handle({ type: "set_start", step: STEP }, 0);
    expect(out?.subtitle?.text).toBeTruthy();
    expect(out?.speak?.kind).toBe("phrase");
    expect(out?.emotion).toBe("neutral");
    const texts = PHRASE_BANKS.gromov.set_start.map((p) => p.text);
    expect(texts).toContain(out?.subtitle?.text);
  });

  it("каждый повтор — «раз, два, три» (отдельный канал), похвала — не на каждый", () => {
    const d = director();
    const outputs = [1, 2, 3, 4, 5, 6].flatMap((n) => d.handle(rep(n), n * 3000));
    const counts = outputs.filter((o) => o.speak?.kind === "count");
    expect(counts.map((o) => o.speak?.text)).toEqual([
      "раз",
      "два",
      "три",
      "четыре",
      "пять",
      "шесть",
    ]);
    expect(counts.map((o) => o.speak?.count)).toEqual([1, 2, 3, 4, 5, 6]);
    const praise = outputs.filter((o) => o.phraseEvent === "rep_good");
    expect(praise.length).toBeGreaterThan(0);
    expect(praise.length).toBeLessThan(6);
  });

  it("неглубокий повтор: «Ниже!» из банка, злое лицо, индикатор «ошибка»", () => {
    const outs = director().handle({ type: "shallow", step: STEP }, 1000);
    const phrase = outs.find((o) => o.phraseEvent === "rep_shallow");
    expect(phrase?.emotion).toBe("angry");
    expect(PHRASE_BANKS.gromov.rep_shallow.map((p) => p.text)).toContain(phrase?.subtitle?.text);
    expect(outs.some((o) => o.quality === "bad")).toBe(true);
  });

  it("ошибка техники: фраза на нужное событие; «слишком быстро» — жёлтый индикатор", () => {
    const d = director("marina");
    const cave = d.handle({ type: "technique", step: STEP, code: "knees_cave_in" }, 0);
    expect(cave.find((o) => o.phraseEvent === "knees_cave_in")?.speak?.text).toBeTruthy();
    expect(cave.some((o) => o.quality === "bad")).toBe(true);

    const fast = d.handle({ type: "technique", step: STEP, code: "too_fast" }, 5000);
    expect(fast.find((o) => o.phraseEvent === "too_fast")).toBeDefined();
    expect(fast.some((o) => o.quality === "okay")).toBe(true);
  });

  it("то же замечание не чаще раза в 15 секунд, но индикатор всё равно показывается", () => {
    const d = director();
    const first = d.handle({ type: "technique", step: STEP, code: "knees_cave_in" }, 0);
    const second = d.handle({ type: "technique", step: STEP, code: "knees_cave_in" }, 8000);
    expect(first.some((o) => o.speak)).toBe(true);
    expect(second.some((o) => o.speak)).toBe(false);
    expect(second.some((o) => o.quality === "bad")).toBe(true);
  });

  it("наклон корпуса (безопасность) перебивает остальное, голос с interrupt", () => {
    const outs = director().handle({ type: "technique", step: STEP, code: "torso_lean" }, 0);
    expect(outs.find((o) => o.phraseEvent === "torso_lean")?.speak?.interrupt).toBe(true);
  });

  it("рекорд: гордое лицо и самый высокий «смешной вес» для клипа", () => {
    const outs = director().handle({ type: "personal_record", step: STEP, value: 12 }, 0);
    const record = outs.find((o) => o.phraseEvent === "personal_record");
    expect(record?.emotion).toBe("proud");
    expect(record?.weight).toBe(CLIP_WEIGHTS.personal_record);
    expect(Math.max(...Object.values(CLIP_WEIGHTS))).toBe(CLIP_WEIGHTS.personal_record);
  });

  it("планка: секунды голосом только по десяткам", () => {
    const d = director();
    const spoken = [1, 5, 9, 10, 15, 20].flatMap((n) =>
      d.handle(
        { type: "count", step: { ...STEP, exercise: "plank" }, count: n, clean: true },
        n * 1000,
      ),
    );
    expect(spoken.filter((o) => o.speak).map((o) => o.speak?.count)).toEqual([10, 20]);
  });

  it("фраза «закончили» подставляет имя и итог", () => {
    const d = new CoachDirector({
      coachId: "gromov",
      harshness: 2,
      userName: "Алекс",
      picker: new PhrasePicker({ coachId: "gromov", harshness: 2, rng: () => 0.9999 }),
    });
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const out = d.completed(i * 100_000, 27);
      if (out?.subtitle) seen.add(out.subtitle.text);
    }
    expect([...seen].some((t) => t.includes("Алекс") && t.includes("27"))).toBe(true);
  });

  it("реакция мгновенная: решение принимается синхронно, без сети, быстрее 300 мс", () => {
    const d = director();
    const started = performance.now();
    for (let i = 0; i < 2000; i += 1) {
      d.handle(rep(i + 1), i * 7000);
      d.handle({ type: "technique", step: STEP, code: "too_fast" }, i * 7000 + 3000);
    }
    const perEvent = (performance.now() - started) / 4000;
    expect(perEvent).toBeLessThan(300);
    expect(perEvent).toBeLessThan(5);
  });
});

describe("качество повтора и подписи", () => {
  it("индикатор: без ошибок — хорошо, только скорость — «можно лучше», остальное — ошибка", () => {
    expect(qualityOf([])).toBe("good");
    expect(qualityOf(["too_fast"])).toBe("okay");
    expect(qualityOf(["knees_cave_in"])).toBe("bad");
    expect(qualityOf(["too_fast", "torso_lean"])).toBe("bad");
  });

  it("длинные подписи держатся дольше, но не бесконечно", () => {
    expect(subtitleDuration("Раз")).toBeLessThan(
      subtitleDuration("Ты что, поклоны бьёшь? Выпрямись, пока не поздно!"),
    );
    expect(subtitleDuration("x".repeat(500))).toBeLessThanOrEqual(5500);
  });
});
