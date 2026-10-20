import { AngleRepCounter } from "./angleCounter";
import type { ErrorCode } from "./types";
import { ELBOW_JOINTS, imagePoint, jointAngle, vis } from "@/lib/pose/geometry";
import { LM, type PoseFrame } from "@/lib/pose/types";
import type { RepThresholds } from "./repMachine";

export const PUSHUP_CONFIG = {
  thresholds: {
    startAngle: 150,
    abortAngle: 160,
    upAngle: 155,
    downAngle: 90,
    releaseAngle: 100,
    shallowAngle: 120,
    minRepMs: 700,
  } satisfies RepThresholds,
  /** Таз ниже линии «плечо–щиколотка» больше этой доли длины тела — провисание. */
  sagOffset: 0.07,
  /** Таз выше линии больше этой доли — «домик». */
  highOffset: 0.09,
  /** Тело должно лежать боком к камере: по горизонтали плечо и щиколотка заметно разнесены. */
  minBodySpan: 0.15,
  minVisibility: 0.5,
} as const;

/** Положение таза относительно линии плечо–щиколотка: >0 — ниже линии (провис), <0 — выше. null — не оценить. */
export function hipOffsetFromLine(
  frame: PoseFrame,
  minVisibility: number,
  minSpan: number,
): number | null {
  const sides = [
    [LM.L_SHOULDER, LM.L_HIP, LM.L_ANKLE],
    [LM.R_SHOULDER, LM.R_HIP, LM.R_ANKLE],
  ] as const;
  let best: (typeof sides)[number] | null = null;
  let bestVis = 0;
  for (const side of sides) {
    const v = Math.min(...side.map((i) => vis(frame, i)));
    if (v > bestVis) {
      bestVis = v;
      best = side;
    }
  }
  if (!best || bestVis < minVisibility) return null;
  const sh = imagePoint(frame, best[0]);
  const hp = imagePoint(frame, best[1]);
  const an = imagePoint(frame, best[2]);
  const dx = an.x - sh.x;
  if (Math.abs(dx) < minSpan) return null;
  const lineY = sh.y + ((hp.x - sh.x) / dx) * (an.y - sh.y);
  const length = Math.hypot(an.x - sh.x, an.y - sh.y);
  return length > 0 ? (hp.y - lineY) / length : null;
}

export class PushupCounter extends AngleRepCounter {
  constructor() {
    super("pushup", PUSHUP_CONFIG.thresholds, ["hips_sag", "hips_high", "too_fast"]);
  }

  protected measure(frame: PoseFrame): number | null {
    return jointAngle(frame, ELBOW_JOINTS.left, ELBOW_JOINTS.right, PUSHUP_CONFIG.minVisibility);
  }

  protected activeErrors(frame: PoseFrame): ReadonlySet<ErrorCode> {
    const active = new Set<ErrorCode>();
    const offset = hipOffsetFromLine(frame, PUSHUP_CONFIG.minVisibility, PUSHUP_CONFIG.minBodySpan);
    if (offset === null) return active;
    this.debug.hipOffset = offset;
    if (offset > PUSHUP_CONFIG.sagOffset) active.add("hips_sag");
    if (offset < -PUSHUP_CONFIG.highOffset) active.add("hips_high");
    return active;
  }
}
