import { countWord } from "@/lib/coach/numberWords";
import { PhrasePicker, type PickContext } from "@/lib/coach/phrasePicker";
import type { PhraseEvent } from "@/lib/coach/phrases";
import type { CoachId, Emotion, Harshness } from "@/lib/data/types";
import type { ErrorCode } from "@/lib/exercises/types";
import type { RunnerEvent } from "./runner";

export type Quality = "good" | "okay" | "bad";

/** Что должно произойти на экране и в динамике из-за одного события тренировки. */
export interface DirectorOutput {
  subtitle?: { text: string; ms: number };
  /** Эмоция аватара (временная — интерфейс вернёт обычное настроение). */
  emotion?: Emotion;
  quality?: Quality | null;
  speak?: {
    text: string;
    phraseId?: string;
    kind: "phrase" | "count";
    interrupt?: boolean;
    /** Для счёта: само число (по нему ищется заранее озвученное слово). */
    count?: number;
  };
  /** Какое событие банка фраз сработало — нужно для выбора «лучшего момента» в клипе. */
  phraseEvent?: PhraseEvent;
  /** «Смешной вес» момента для клипа. */
  weight?: number;
}

/** Насколько момент подходит для клипа: жёсткие реплики, рекорды и финальные рывки. */
export const CLIP_WEIGHTS: Partial<Record<PhraseEvent, number>> = {
  personal_record: 9,
  knees_cave_in: 8,
  torso_lean: 7,
  hips_sag: 7,
  knee_over_toe: 7,
  last_3_reps: 7,
  rep_shallow: 6,
  hips_high: 6,
  too_fast: 5,
  idle_10s: 4,
  workout_complete: 3,
  halfway: 2,
  not_in_frame: 2,
  rep_good: 1,
};

const SEVERE: readonly ErrorCode[] = [
  "rep_shallow",
  "knees_cave_in",
  "torso_lean",
  "hips_sag",
  "hips_high",
  "knee_over_toe",
];

export function qualityOf(errors: readonly ErrorCode[]): Quality {
  if (errors.length === 0) return "good";
  return errors.some((e) => SEVERE.includes(e)) ? "bad" : "okay";
}

const TECHNIQUE_EVENT: Record<ErrorCode, PhraseEvent> = {
  rep_shallow: "rep_shallow",
  knees_cave_in: "knees_cave_in",
  torso_lean: "torso_lean",
  too_fast: "too_fast",
  hips_sag: "hips_sag",
  hips_high: "hips_high",
  knee_over_toe: "knee_over_toe",
};

/** Подпись на экране держится дольше для длинных фраз. */
export function subtitleDuration(text: string): number {
  return Math.min(5500, 1800 + text.length * 55);
}

interface DirectorOptions {
  coachId: CoachId;
  harshness: Harshness;
  userName?: string;
  picker?: PhrasePicker;
}

/**
 * «Режиссёр»: решает, что и когда скажет тренер. Реакции — только из заготовленного банка фраз
 * (нейросеть в звонке не участвует), поэтому ответ мгновенный.
 */
export class CoachDirector {
  private readonly picker: PhrasePicker;
  private readonly userName: string | undefined;
  private cleanStreak = 0;
  private praiseCount = 0;

  constructor({ coachId, harshness, userName, picker }: DirectorOptions) {
    this.picker = picker ?? new PhrasePicker({ coachId, harshness });
    this.userName = userName;
  }

  setHarshness(harshness: Harshness): void {
    this.picker.setHarshness(harshness);
  }

  /** Фраза на событие банка (или null, если сейчас нельзя из-за кулдаунов). */
  say(
    event: PhraseEvent,
    now: number,
    emotion: Emotion,
    ctx: PickContext = {},
  ): DirectorOutput | null {
    const picked = this.picker.pick(event, now, { name: this.userName, ...ctx });
    if (!picked) return null;
    return {
      subtitle: { text: picked.text, ms: subtitleDuration(picked.text) },
      emotion,
      speak: {
        text: picked.text,
        // Фразы с шаблонами озвучиваются на лету браузерным голосом, остальные — готовым mp3.
        phraseId: picked.phrase.template ? undefined : picked.phrase.id,
        kind: "phrase",
        interrupt: event === "torso_lean" || event === "hips_sag",
      },
      phraseEvent: event,
      weight: CLIP_WEIGHTS[event],
    };
  }

  handle(event: RunnerEvent, now: number): DirectorOutput[] {
    const out: DirectorOutput[] = [];
    const push = (o: DirectorOutput | null) => {
      if (o) out.push(o);
    };

    switch (event.type) {
      case "set_start":
        this.cleanStreak = 0;
        push(this.say("set_start", now, "neutral", { exercise: event.step.exercise }));
        break;

      case "rep": {
        const q = qualityOf(event.errors);
        if (event.clean) this.cleanStreak += 1;
        else this.cleanStreak = 0;
        // Хвалим не каждый чистый повтор: раз в несколько штук (и кулдаун 6 с в самом выборе фразы).
        const praise =
          event.clean && this.cleanStreak >= 2
            ? this.say("rep_good", now, this.praiseCount % 3 === 2 ? "proud" : "neutral", {
                exercise: event.step.exercise,
              })
            : null;
        if (praise) this.praiseCount += 1;
        push(praise);
        // Счёт — отдельный канал: «раз, два…», пропадает, если тренер сейчас говорит фразу.
        out.push({
          quality: q,
          speak: { text: countWord(event.count), kind: "count", count: event.count },
        });
        break;
      }

      case "count":
        // Планка: секунды идут на экране; голосом отмечаем десятки
        if (event.count % 10 === 0) {
          out.push({ speak: { text: countWord(event.count), kind: "count", count: event.count } });
        }
        out.push({ quality: event.clean ? "good" : "bad" });
        break;

      case "shallow":
        this.cleanStreak = 0;
        push(this.say("rep_shallow", now, "angry", { exercise: event.step.exercise }));
        out.push({ quality: "bad" });
        break;

      case "technique": {
        this.cleanStreak = 0;
        const phraseEvent = TECHNIQUE_EVENT[event.code];
        const emotion: Emotion = event.code === "too_fast" ? "contempt" : "angry";
        push(this.say(phraseEvent, now, emotion, { exercise: event.step.exercise }));
        out.push({ quality: qualityOf([event.code]) });
        break;
      }

      case "halfway":
        push(this.say("halfway", now, "neutral", { exercise: event.step.exercise }));
        break;

      case "last_3":
        push(this.say("last_3_reps", now, "surprised", { exercise: event.step.exercise }));
        break;

      case "personal_record":
        push(this.say("personal_record", now, "proud", { exercise: event.step.exercise }));
        break;

      case "idle":
        push(this.say("idle_10s", now, "disappointed", { exercise: event.step.exercise }));
        break;

      case "not_in_frame":
        push(this.say("not_in_frame", now, "contempt"));
        break;

      case "set_end":
        push(this.say("set_end", now, "neutral", { exercise: event.step.exercise }));
        break;

      case "workout_complete":
        // Итоговый счёт подставляется в шаблон «{name}, всё. Итог — {count}.»
        break;

      case "rest_start":
      case "rest_end":
        break;
    }
    return out;
  }

  /** Пользователь нажал «Пауза». */
  paused(now: number): DirectorOutput | null {
    return this.say("user_paused", now, "disappointed");
  }

  /** Конец тренировки: фраза «закончили» (с итогом в шаблоне, если он есть). */
  completed(now: number, count: number): DirectorOutput | null {
    return this.say("workout_complete", now, "proud", { count });
  }

  abandoned(now: number): DirectorOutput | null {
    return this.say("workout_abandoned", now, "disappointed");
  }
}
