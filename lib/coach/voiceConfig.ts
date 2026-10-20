import gromov from "@/content/coaches/gromov/voice.json";
import marina from "@/content/coaches/marina/voice.json";
import max from "@/content/coaches/max/voice.json";
import palych from "@/content/coaches/palych/voice.json";
import type { CoachId } from "@/lib/data/types";

export interface VoiceConfig {
  coachId: CoachId;
  /** Настройки голоса браузера (Web Speech Synthesis): тембр и скорость отличают тренеров. */
  browser: { pitch: number; rate: number; volume: number };
  elevenlabs: {
    voiceId: string;
    model: string;
    stability: number;
    similarityBoost: number;
    style: number;
    speed: number;
  };
}

export const VOICE_CONFIG: Record<CoachId, VoiceConfig> = {
  gromov: gromov as VoiceConfig,
  marina: marina as VoiceConfig,
  palych: palych as VoiceConfig,
  max: max as VoiceConfig,
};

/** Имя файла заранее озвученного слова счёта: gromov.count.007 */
export function countPhraseId(coachId: CoachId, n: number): string {
  return `${coachId}.count.${String(n).padStart(3, "0")}`;
}

/** До какого числа озвучиваем счёт заранее. */
export const PRERECORDED_COUNT_MAX = 30;
