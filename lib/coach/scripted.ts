import gromov from "@/content/coaches/gromov/scripted.json";
import marina from "@/content/coaches/marina/scripted.json";
import max from "@/content/coaches/max/scripted.json";
import palych from "@/content/coaches/palych/scripted.json";
import type { CoachId, Harshness } from "@/lib/data/types";
import { parseLevels } from "./phrases";

/** Категории скриптовых реплик тренера (чат без нейросети, сообщения «пока тебя не было», уведомления). */
export const SCRIPTED_CATEGORIES = [
  "greeting",
  "apology",
  "excuse",
  "tired",
  "ask_plan",
  "thanks",
  "hard",
  "quit",
  "proud_me",
  "who_are_you",
  "how_are_you",
  "flirt",
  "insult_me",
  "workout_done",
  "fallback",
  "limit",
  "ignore_cold",
  "ignore_end",
  "status_new_student",
  "level_up_tolerates",
  "level_up_respects",
  "level_up_proud",
  "morning",
  "reminder",
  "poke",
  "evening_cold",
  "streak7",
  "welcome_back",
  "propose_workout",
] as const;
export type ScriptedCategory = (typeof SCRIPTED_CATEGORIES)[number];

export interface ScriptedLine {
  text: string;
  levels: readonly Harshness[];
}

export type ScriptedBank = Record<ScriptedCategory, ScriptedLine[]>;

type RawLine = string | readonly [string, string];

export function parseScripted(coachId: CoachId, raw: unknown): ScriptedBank {
  const lines = (raw as { lines?: Record<string, RawLine[]> }).lines;
  if (!lines) throw new Error(`${coachId}: нет блока lines`);
  const bank = {} as ScriptedBank;
  for (const category of SCRIPTED_CATEGORIES) {
    const list = lines[category];
    if (!list || list.length === 0) throw new Error(`${coachId}.${category}: нет реплик`);
    bank[category] = list.map((item) =>
      typeof item === "string"
        ? { text: item, levels: [1, 2, 3] as Harshness[] }
        : { text: item[0], levels: parseLevels(item[1]) },
    );
  }
  return bank;
}

const RAW: Record<CoachId, unknown> = { gromov, marina, palych, max };

export const SCRIPTED_BANKS: Record<CoachId, ScriptedBank> = {
  gromov: parseScripted("gromov", RAW.gromov),
  marina: parseScripted("marina", RAW.marina),
  palych: parseScripted("palych", RAW.palych),
  max: parseScripted("max", RAW.max),
};

/**
 * Реплика тренера из заготовок. Подходящую жёсткость выбираем по настройке пользователя;
 * `avoid` — недавние реплики, которые не стоит повторять.
 */
export function pickScripted(
  coachId: CoachId,
  category: ScriptedCategory,
  harshness: Harshness,
  options: { rng?: () => number; avoid?: readonly string[] } = {},
): string {
  const rng = options.rng ?? Math.random;
  const all = SCRIPTED_BANKS[coachId][category];
  let pool = all.filter((l) => l.levels.includes(harshness));
  if (pool.length === 0) pool = all;
  const fresh = pool.filter((l) => !options.avoid?.includes(l.text));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(rng() * from.length)]!.text;
}
