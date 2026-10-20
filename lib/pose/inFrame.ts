import { allVisible } from "./geometry";
import { LM, type PoseFrame } from "./types";

/** Ключевые точки, которые должны быть видны перед стартом: плечи, бёдра, колени, щиколотки. */
export const KEY_POINTS = [
  LM.L_SHOULDER,
  LM.R_SHOULDER,
  LM.L_HIP,
  LM.R_HIP,
  LM.L_KNEE,
  LM.R_KNEE,
  LM.L_ANKLE,
  LM.R_ANKLE,
] as const;

export const IN_FRAME_MIN_VISIBILITY = 0.6;
export const IN_FRAME_HOLD_MS = 1500;

/** Все ключевые точки видны и находятся внутри кадра. */
export function bodyInFrame(frame: PoseFrame, minVisibility = IN_FRAME_MIN_VISIBILITY): boolean {
  if (!allVisible(frame, KEY_POINTS, minVisibility)) return false;
  return KEY_POINTS.every((i) => {
    const p = frame.landmarks[i];
    return !!p && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;
  });
}

/**
 * Следит, чтобы человек был в кадре целиком не меньше 1.5 секунд подряд.
 * Только тогда можно начинать тренировку.
 */
export class InFrameGate {
  private since: number | null = null;

  update(frame: PoseFrame | null): { inFrame: boolean; ready: boolean; heldMs: number } {
    if (!frame || !bodyInFrame(frame)) {
      this.since = null;
      return { inFrame: false, ready: false, heldMs: 0 };
    }
    this.since ??= frame.t;
    const heldMs = frame.t - this.since;
    return { inFrame: true, ready: heldMs >= IN_FRAME_HOLD_MS, heldMs };
  }

  reset(): void {
    this.since = null;
  }
}
