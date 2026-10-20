/**
 * Клип собирается из независимых коротких отрезков записи (~15 секунд): так каждый отрезок —
 * самостоятельный, проигрываемый файл, а не «хвост» потока. В конце тренировки остаётся лучший отрезок:
 * тот, где был самый «смешной» момент.
 */
export interface Segment {
  blob: Blob;
  mime: string;
  durationSec: number;
  /** Самый высокий «смешной вес» момента внутри отрезка (0 — ничего заметного). */
  weight: number;
  /** Что за момент: событие банка фраз («knees_cave_in», «personal_record»…). */
  moment: string;
  /** Подпись тренера в этот момент. */
  subtitle: string | null;
}

/** Слишком короткий отрезок — не клип. */
export const MIN_CLIP_SEC = 3;

/** Хранит лучший отрезок: выше вес → дольше → позже (в конце тренировки обычно самый уставший вид). */
export class SegmentKeeper {
  private current: Segment | null = null;

  add(segment: Segment): void {
    if (segment.durationSec < MIN_CLIP_SEC || segment.blob.size === 0) return;
    if (!this.current || beats(segment, this.current)) this.current = segment;
  }

  best(): Segment | null {
    return this.current;
  }
}

function beats(a: Segment, b: Segment): boolean {
  if (a.weight !== b.weight) return a.weight > b.weight;
  if (Math.abs(a.durationSec - b.durationSec) > 1) return a.durationSec > b.durationSec;
  return true;
}

/** Лучший момент внутри одного отрезка. */
export class MomentTracker {
  weight = 0;
  moment = "";
  subtitle: string | null = null;

  mark(weight: number, moment: string, subtitle: string | null): void {
    if (weight < this.weight) return;
    this.weight = weight;
    this.moment = moment;
    this.subtitle = subtitle;
  }

  reset(): void {
    this.weight = 0;
    this.moment = "";
    this.subtitle = null;
  }
}
