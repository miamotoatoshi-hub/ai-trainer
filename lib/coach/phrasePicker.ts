import type { CoachId, ExerciseId, Harshness } from "@/lib/data/types";
import { PHRASE_BANKS, type Phrase, type PhraseBank, type PhraseEvent } from "./phrases";

/** Приоритет: безопасность > техника > мотивация (счёт — отдельный канал, фразами не занимается). */
export type PhrasePriority = "safety" | "technique" | "motivation";

export const EVENT_PRIORITY: Record<PhraseEvent, PhrasePriority> = {
  torso_lean: "safety",
  hips_sag: "safety",
  rep_shallow: "technique",
  knees_cave_in: "technique",
  too_fast: "technique",
  hips_high: "technique",
  knee_over_toe: "technique",
  rep_good: "motivation",
  idle_10s: "motivation",
  set_start: "motivation",
  set_end: "motivation",
  halfway: "motivation",
  last_3_reps: "motivation",
  personal_record: "motivation",
  not_in_frame: "motivation",
  user_paused: "motivation",
  workout_complete: "motivation",
  workout_abandoned: "motivation",
  verdict_great: "motivation",
  verdict_ok: "motivation",
  verdict_bad: "motivation",
};

const RANK: Record<PhrasePriority, number> = { motivation: 1, technique: 2, safety: 3 };

/** Редкие «структурные» события говорим всегда — они не конкурируют с потоком похвал и замечаний. */
const ALWAYS: ReadonlySet<PhraseEvent> = new Set([
  "set_start",
  "set_end",
  "halfway",
  "last_3_reps",
  "personal_record",
  "user_paused",
  "workout_complete",
  "workout_abandoned",
  "verdict_great",
  "verdict_ok",
  "verdict_bad",
]);

export const PICKER_CONFIG = {
  /** Не повторять последние N сказанных фраз. */
  historySize: 10,
  /** Не больше одной фразы раз в столько мс. */
  globalGapMs: 2500,
  /** Одно и то же замечание о технике — не чаще раза в 15 секунд. */
  techniqueCooldownMs: 15_000,
  /** Прочие частые события. */
  eventCooldownMs: {
    rep_good: 6_000,
    idle_10s: 10_000,
    not_in_frame: 8_000,
  } as Partial<Record<PhraseEvent, number>>,
} as const;

export interface PickContext {
  exercise?: ExerciseId;
  name?: string;
  count?: number;
  left?: number;
}

export interface PickedPhrase {
  phrase: Phrase;
  /** Текст с подставленными {name}, {count}, {left}. */
  text: string;
}

interface PickerOptions {
  coachId: CoachId;
  harshness: Harshness;
  bank?: PhraseBank;
  rng?: () => number;
}

/** Подставляет шаблоны; если имени нет, «{name}, » просто убирается. */
export function fillTemplate(text: string, ctx: PickContext): string {
  let out = text;
  const name = ctx.name?.trim();
  if (name) out = out.replaceAll("{name}", name);
  else out = out.replace(/\{name\}[,.:]?\s*/g, "");
  if (ctx.count !== undefined) out = out.replaceAll("{count}", String(ctx.count));
  if (ctx.left !== undefined) out = out.replaceAll("{left}", String(ctx.left));
  out = out.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export class PhrasePicker {
  private readonly coachId: CoachId;
  private harshness: Harshness;
  private readonly bank: PhraseBank;
  private readonly rng: () => number;
  private history: string[] = [];
  private lastSpokenAt = Number.NEGATIVE_INFINITY;
  private lastSpokenRank = 0;
  private lastByEvent = new Map<PhraseEvent, number>();

  constructor({ coachId, harshness, bank, rng }: PickerOptions) {
    this.coachId = coachId;
    this.harshness = harshness;
    this.bank = bank ?? PHRASE_BANKS[coachId];
    this.rng = rng ?? Math.random;
  }

  setHarshness(harshness: Harshness): void {
    this.harshness = harshness;
  }

  /** Можно ли сейчас говорить про это событие (кулдауны и приоритеты). */
  canSpeak(event: PhraseEvent, nowMs: number): boolean {
    const priority = EVENT_PRIORITY[event];
    const lastForEvent = this.lastByEvent.get(event);
    const cooldown =
      priority === "motivation"
        ? PICKER_CONFIG.eventCooldownMs[event]
        : PICKER_CONFIG.techniqueCooldownMs;
    if (cooldown !== undefined && lastForEvent !== undefined && nowMs - lastForEvent < cooldown) {
      return false;
    }
    if (ALWAYS.has(event)) return true;
    if (nowMs - this.lastSpokenAt >= PICKER_CONFIG.globalGapMs) return true;
    // Внутри паузы между фразами прерывает только более важное: безопасность важнее техники и похвалы.
    return RANK[priority] > this.lastSpokenRank;
  }

  /** Выбирает фразу для события или null, если сейчас нельзя (слишком рано / то же замечание недавно). */
  pick(event: PhraseEvent, nowMs: number, ctx: PickContext = {}): PickedPhrase | null {
    if (!this.canSpeak(event, nowMs)) return null;

    const usable = (p: Phrase): boolean => {
      if (p.exercise && p.exercise !== ctx.exercise) return false;
      if (p.text.includes("{count}") && ctx.count === undefined) return false;
      if (p.text.includes("{left}") && ctx.left === undefined) return false;
      return true;
    };
    const all = this.bank[event].filter(usable);
    if (all.length === 0) return null;

    let pool = all.filter((p) => p.levels.includes(this.harshness));
    if (pool.length === 0) pool = all;
    // Фразы, которые недавно звучали, не повторяем; если выбор исчерпан — берём самые давние.
    const fresh = pool.filter((p) => !this.history.includes(p.id));
    let chosen: Phrase;
    if (fresh.length > 0) {
      chosen = fresh[Math.floor(this.rng() * fresh.length)]!;
    } else {
      const oldest = [...pool].sort(
        (a, b) => this.history.indexOf(a.id) - this.history.indexOf(b.id),
      );
      chosen = oldest[0]!;
    }

    this.history = [...this.history.filter((id) => id !== chosen.id), chosen.id].slice(
      -PICKER_CONFIG.historySize,
    );
    this.lastSpokenAt = nowMs;
    this.lastSpokenRank = RANK[EVENT_PRIORITY[event]];
    this.lastByEvent.set(event, nowMs);
    return { phrase: chosen, text: fillTemplate(chosen.text, ctx) };
  }

  reset(): void {
    this.history = [];
    this.lastSpokenAt = Number.NEGATIVE_INFINITY;
    this.lastSpokenRank = 0;
    this.lastByEvent.clear();
  }
}
