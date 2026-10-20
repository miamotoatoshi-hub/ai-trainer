import type { CounterEvent, CounterSnapshot, ExerciseCounter } from "./types";
import { allVisible, imagePoint } from "@/lib/pose/geometry";
import { LM, type PoseFrame } from "@/lib/pose/types";

export const JACK_CONFIG = {
  /** Запястья выше плеч не меньше чем на столько (доли высоты кадра) — руки подняты. */
  armsUp: 0.04,
  /** Запястья ниже плеч — руки опущены. */
  armsDown: -0.02,
  /** Расстояние между щиколотками в ширинах плеч: ноги врозь / вместе. */
  legsApart: 1.4,
  legsTogether: 1.0,
  minVisibility: 0.5,
} as const;

type Phase = "closed" | "moving" | "open";

/** Прыжки «джек»: руки вверх и ноги врозь, затем обратно — одно повторение. Лицом к камере. */
export class JumpingJackCounter implements ExerciseCounter {
  readonly id = "jumping_jack" as const;
  readonly unit = "reps" as const;
  private phase: Phase = "closed";
  private startT = 0;
  private sawArms = false;
  private sawLegs = false;
  private total = 0;
  private shallow = 0;
  private streak = 0;
  private bestStreak = 0;
  private visible = false;
  private lastMeasure: number | null = null;
  private debug: Record<string, number> = {};

  update(frame: PoseFrame): CounterEvent[] {
    const events: CounterEvent[] = [];
    const ids = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_WRIST, LM.R_WRIST, LM.L_ANKLE, LM.R_ANKLE];
    this.visible = allVisible(frame, ids, JACK_CONFIG.minVisibility);
    if (!this.visible) {
      this.lastMeasure = null;
      return events;
    }

    const ls = imagePoint(frame, LM.L_SHOULDER);
    const rs = imagePoint(frame, LM.R_SHOULDER);
    const lw = imagePoint(frame, LM.L_WRIST);
    const rw = imagePoint(frame, LM.R_WRIST);
    const la = imagePoint(frame, LM.L_ANKLE);
    const ra = imagePoint(frame, LM.R_ANKLE);

    const shoulderWidth = Math.max(0.02, Math.abs(ls.x - rs.x));
    // Меньший подъём из двух рук: «руки вверх» — когда подняты обе.
    const armHeight = Math.min((ls.y - lw.y + (rs.y - rw.y)) / 2, ls.y - lw.y, rs.y - rw.y);
    const legSpread = Math.abs(la.x - ra.x) / shoulderWidth;
    this.lastMeasure = armHeight;
    this.debug = { armHeight, legSpread };

    const armsUp = armHeight >= JACK_CONFIG.armsUp;
    const armsDown = armHeight <= JACK_CONFIG.armsDown;
    const legsApart = legSpread >= JACK_CONFIG.legsApart;
    const legsTogether = legSpread <= JACK_CONFIG.legsTogether;
    const closed = armsDown && legsTogether;

    if (this.phase === "closed") {
      if (!closed) {
        this.phase = "moving";
        this.startT = frame.t;
        this.sawArms = armsUp;
        this.sawLegs = legsApart;
        events.push({ type: "phase", phase: this.phase });
      }
    } else {
      this.sawArms ||= armsUp;
      this.sawLegs ||= legsApart;
      if (this.phase === "moving" && armsUp && legsApart) {
        this.phase = "open";
        events.push({ type: "phase", phase: this.phase });
      } else if (closed) {
        if (this.sawArms && this.sawLegs) {
          this.total += 1;
          this.streak += 1;
          this.bestStreak = Math.max(this.bestStreak, this.streak);
          events.push({
            type: "rep",
            index: this.total,
            clean: true,
            errors: [],
            durationMs: frame.t - this.startT,
            depth: legSpread,
          });
        } else if (this.sawArms || this.sawLegs) {
          // Двигался, но не дошёл до полной амплитуды (руки или ноги): не повтор, но замечаем.
          this.shallow += 1;
          this.streak = 0;
          events.push({ type: "shallow", depth: legSpread });
        }
        this.phase = "closed";
        events.push({ type: "phase", phase: this.phase });
      }
    }
    return events;
  }

  snapshot(): CounterSnapshot {
    return {
      exerciseId: "jumping_jack",
      unit: "reps",
      total: this.total,
      clean: this.total,
      shallow: this.shallow,
      streak: this.streak,
      bestStreak: this.bestStreak,
      errors: this.shallow > 0 ? { rep_shallow: this.shallow } : {},
      phase: this.phase,
      visible: this.visible,
      measure: this.lastMeasure,
      debug: { ...this.debug },
    };
  }

  reset(): void {
    this.phase = "closed";
    this.sawArms = false;
    this.sawLegs = false;
    this.total = 0;
    this.shallow = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.visible = false;
    this.lastMeasure = null;
    this.debug = {};
  }
}
