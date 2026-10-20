import { AngleRepCounter } from "./angleCounter";
import type { ErrorCode } from "./types";
import { KNEE_JOINTS, angleAt, bodyPoint, imagePoint, vis } from "@/lib/pose/geometry";
import { LM, type PoseFrame } from "@/lib/pose/types";
import type { RepThresholds } from "./repMachine";

export const LUNGE_CONFIG = {
  thresholds: {
    startAngle: 150,
    abortAngle: 160,
    upAngle: 160,
    downAngle: 105,
    releaseAngle: 115,
    shallowAngle: 130,
    minRepMs: 1000,
  } satisfies RepThresholds,
  /** Колено вышло за носок больше, чем на столько (в долях высоты кадра). */
  kneeOverToe: 0.03,
  minVisibility: 0.5,
} as const;

interface Leg {
  angle: number;
  hip: number;
  knee: number;
  ankle: number;
  toe: number;
}

export class LungeCounter extends AngleRepCounter {
  constructor() {
    super("lunge", LUNGE_CONFIG.thresholds, ["knee_over_toe", "too_fast"]);
  }

  private legs(frame: PoseFrame): Leg[] {
    const result: Leg[] = [];
    const defs = [
      { joints: KNEE_JOINTS.left, toe: LM.L_FOOT },
      { joints: KNEE_JOINTS.right, toe: LM.R_FOOT },
    ];
    for (const { joints, toe } of defs) {
      const [hip, knee, ankle] = joints;
      if (
        Math.min(vis(frame, hip), vis(frame, knee), vis(frame, ankle)) < LUNGE_CONFIG.minVisibility
      ) {
        continue;
      }
      result.push({
        angle: angleAt(bodyPoint(frame, hip), bodyPoint(frame, knee), bodyPoint(frame, ankle)),
        hip,
        knee,
        ankle,
        toe,
      });
    }
    return result;
  }

  /** В выпаде передняя нога согнута сильнее — берём меньший из двух углов колена. */
  protected measure(frame: PoseFrame): number | null {
    const legs = this.legs(frame);
    if (legs.length === 0) return null;
    return Math.min(...legs.map((l) => l.angle));
  }

  protected activeErrors(frame: PoseFrame): ReadonlySet<ErrorCode> {
    const active = new Set<ErrorCode>();
    const legs = this.legs(frame);
    if (legs.length === 0) return active;
    const front = legs.reduce((a, b) => (a.angle <= b.angle ? a : b));
    if (vis(frame, front.toe) < LUNGE_CONFIG.minVisibility) return active;
    const knee = imagePoint(frame, front.knee);
    const ankle = imagePoint(frame, front.ankle);
    const toe = imagePoint(frame, front.toe);
    // Куда смотрит стопа — туда и «вперёд».
    const direction = Math.sign(toe.x - ankle.x) || 1;
    const over = (knee.x - toe.x) * direction;
    this.debug.kneeOverToe = over;
    if (over > LUNGE_CONFIG.kneeOverToe) active.add("knee_over_toe");
    return active;
  }
}
