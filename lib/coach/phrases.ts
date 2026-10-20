import gromov from "@/content/coaches/gromov/phrases.json";
import marina from "@/content/coaches/marina/phrases.json";
import max from "@/content/coaches/max/phrases.json";
import palych from "@/content/coaches/palych/phrases.json";
import {
  COACH_IDS,
  EXERCISE_IDS,
  type CoachId,
  type ExerciseId,
  type Harshness,
} from "@/lib/data/types";

/** События тренировки, на которые тренер отвечает фразой из банка. */
export const PHRASE_EVENTS = [
  "rep_good",
  "rep_shallow",
  "knees_cave_in",
  "torso_lean",
  "too_fast",
  "idle_10s",
  "set_start",
  "set_end",
  "halfway",
  "last_3_reps",
  "personal_record",
  "not_in_frame",
  "user_paused",
  "workout_complete",
  "workout_abandoned",
  "verdict_great",
  "verdict_ok",
  "verdict_bad",
  // события для остальных упражнений
  "hips_sag",
  "hips_high",
  "knee_over_toe",
] as const;
export type PhraseEvent = (typeof PHRASE_EVENTS)[number];

/** События, обязательные по ТЗ: на каждое — не меньше 15 фраз у каждого тренера. */
export const CORE_EVENTS: readonly PhraseEvent[] = PHRASE_EVENTS.slice(0, 18);
export const MIN_PHRASES_CORE = 15;
export const MIN_PHRASES_EXTRA = 10;

export interface Phrase {
  /** Стабильный id, например "gromov.rep_good.003" (он же имя mp3). */
  id: string;
  coachId: CoachId;
  event: PhraseEvent;
  text: string;
  /** Уровни жёсткости, при которых фраза допустима. */
  levels: readonly Harshness[];
  /** Если задано — фраза только для этого упражнения. */
  exercise?: ExerciseId;
  /** В тексте есть {name}/{count}/{left}: озвучивается на лету браузерным голосом. */
  template: boolean;
}

export type PhraseBank = Record<PhraseEvent, Phrase[]>;

/** "1-3" → [1,2,3], "2-3" → [2,3], "3" → [3], "1-2" → [1,2]. */
export function parseLevels(spec: string): Harshness[] {
  const match = /^([123])(?:-([123]))?$/.exec(spec.trim());
  if (!match) throw new Error(`Некорректная жёсткость «${spec}»`);
  const from = Number(match[1]);
  const to = match[2] ? Number(match[2]) : from;
  if (to < from) throw new Error(`Некорректный диапазон жёсткости «${spec}»`);
  const levels: Harshness[] = [];
  for (let n = from; n <= to; n += 1) levels.push(n as Harshness);
  return levels;
}

const TEMPLATE = /\{(name|count|left)\}/;

type RawPhrase = readonly [string, string] | readonly [string, string, string];

export function parsePhraseFile(coachId: CoachId, raw: unknown): PhraseBank {
  const events = (raw as { events?: Record<string, RawPhrase[]> }).events;
  if (!events) throw new Error(`${coachId}: нет блока events`);
  const bank = {} as PhraseBank;
  for (const event of PHRASE_EVENTS) {
    const list = events[event] ?? [];
    bank[event] = list.map((item, index) => {
      const [text, levels, exercise] = item;
      if (typeof text !== "string" || typeof levels !== "string") {
        throw new Error(`${coachId}.${event}[${index}]: ожидается [текст, жёсткость]`);
      }
      if (exercise !== undefined && !(EXERCISE_IDS as readonly string[]).includes(exercise)) {
        throw new Error(`${coachId}.${event}[${index}]: неизвестное упражнение «${exercise}»`);
      }
      return {
        id: `${coachId}.${event}.${String(index + 1).padStart(3, "0")}`,
        coachId,
        event,
        text,
        levels: parseLevels(levels),
        exercise: exercise as ExerciseId | undefined,
        template: TEMPLATE.test(text),
      };
    });
  }
  return bank;
}

const RAW: Record<CoachId, unknown> = { gromov, marina, palych, max };

export const PHRASE_BANKS: Record<CoachId, PhraseBank> = Object.fromEntries(
  COACH_IDS.map((id) => [id, parsePhraseFile(id, RAW[id])]),
) as Record<CoachId, PhraseBank>;

/** Все фразы тренера списком (для озвучки и проверок). */
export function allPhrases(coachId: CoachId): Phrase[] {
  return PHRASE_EVENTS.flatMap((event) => PHRASE_BANKS[coachId][event]);
}
