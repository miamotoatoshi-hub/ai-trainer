import type { ExerciseCounter, CounterEvent, CounterSnapshot, ErrorCode } from "./types";
import { ErrorGate } from "./repMachine";
import { ERROR_FRAMES } from "./angleCounter";
import { hipOffsetFromLine } from "./pushup";
import { imagePoint, slopeFromHorizontal, vis } from "@/lib/pose/geometry";
import { LM, type PoseFrame } from "@/lib/pose/types";

export const PLANK_CONFIG = {
  /** Тело считается «в планке», если линия плечо–щиколотка близка к горизонтали. */
  maxBodySlopeDeg: 25,
  sagOffset: 0.06,
  highOffset: 0.08,
  minBodySpan: 0.2,
  /** Если кадры не приходили дольше этого, время между ними не засчитываем. */
  maxFrameGapMs: 500,
  minVisibility: 0.5,
} as const;

/** Планка: считаем секунды удержания; «чистая» секунда — таз не провис и не задран. */
export class PlankCounter implements ExerciseCounter {
  readonly id = "plank" as const;
  readonly unit = "sec" as const;
  private holdMs = 0;
  private cleanMs = 0;
  private lastT: number | null = null;
  private secondsReported = 0;
  private streakMs = 0;
  private bestStreakMs = 0;
  private errors: Record<string, number> = {};
  private gate = new ErrorGate();
  private inPosition = false;
  private visible = false;
  private lastMeasure: number | null = null;

  update(frame: PoseFrame): CounterEvent[] {
    const events: CounterEvent[] = [];
    const dt =
      this.lastT === null
        ? 0
        : Math.min(PLANK_CONFIG.maxFrameGapMs, Math.max(0, frame.t - this.lastT));
    this.lastT = frame.t;

    const offset = hipOffsetFromLine(frame, PLANK_CONFIG.minVisibility, PLANK_CONFIG.minBodySpan);
    const hasBody = [LM.L_SHOULDER, LM.R_SHOULDER].some(
      (i) => vis(frame, i) >= PLANK_CONFIG.minVisibility,
    );
    this.visible = offset !== null && hasBody;
    this.lastMeasure = offset;
    if (!this.visible || offset === null) {
      this.inPosition = false;
      this.gate.reset();
      return events;
    }

    const shoulder = imagePoint(
      frame,
      vis(frame, LM.L_SHOULDER) >= vis(frame, LM.R_SHOULDER) ? LM.L_SHOULDER : LM.R_SHOULDER,
    );
    const ankle = imagePoint(
      frame,
      vis(frame, LM.L_ANKLE) >= vis(frame, LM.R_ANKLE) ? LM.L_ANKLE : LM.R_ANKLE,
    );
    this.inPosition = slopeFromHorizontal(shoulder, ankle) <= PLANK_CONFIG.maxBodySlopeDeg;
    if (!this.inPosition) {
      this.gate.reset();
      return events;
    }

    const sag = offset > PLANK_CONFIG.sagOffset;
    const high = offset < -PLANK_CONFIG.highOffset;
    const clean = !sag && !high;

    for (const [code, active] of [
      ["hips_sag", sag],
      ["hips_high", high],
    ] as [ErrorCode, boolean][]) {
      if (this.gate.update(code, active, ERROR_FRAMES * 2)) {
        this.errors[code] = (this.errors[code] ?? 0) + 1;
        events.push({ type: "error", code });
      }
    }

    this.holdMs += dt;
    if (clean) {
      this.cleanMs += dt;
      this.streakMs += dt;
      this.bestStreakMs = Math.max(this.bestStreakMs, this.streakMs);
    } else {
      this.streakMs = 0;
    }
    const seconds = Math.floor(this.holdMs / 1000);
    while (this.secondsReported < seconds) {
      this.secondsReported += 1;
      events.push({ type: "second", seconds: this.secondsReported, clean });
    }
    return events;
  }

  snapshot(): CounterSnapshot {
    return {
      exerciseId: "plank",
      unit: "sec",
      total: Math.floor(this.holdMs / 1000),
      clean: Math.floor(this.cleanMs / 1000),
      shallow: 0,
      streak: Math.floor(this.streakMs / 1000),
      bestStreak: Math.floor(this.bestStreakMs / 1000),
      errors: { ...this.errors },
      phase: this.inPosition ? "hold" : "idle",
      visible: this.visible,
      measure: this.lastMeasure,
      debug: {},
    };
  }

  reset(): void {
    this.holdMs = 0;
    this.cleanMs = 0;
    this.lastT = null;
    this.secondsReported = 0;
    this.streakMs = 0;
    this.bestStreakMs = 0;
    this.errors = {};
    this.gate.reset();
    this.inPosition = false;
    this.visible = false;
    this.lastMeasure = null;
  }
}
