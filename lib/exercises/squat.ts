import { AngleRepCounter } from "./angleCounter";
import type { ErrorCode } from "./types";
import {
  KNEE_JOINTS,
  allVisible,
  imagePoint,
  jointAngle,
  midpoint,
  tiltFromVertical,
  bodyPoint,
} from "@/lib/pose/geometry";
import { LM, type PoseFrame } from "@/lib/pose/types";
import type { RepThresholds } from "./repMachine";

/** Пороги приседаний. Все числа — в одном месте, чтобы их можно было подкрутить (см. режим отладки). */
export const SQUAT_CONFIG = {
  thresholds: {
    startAngle: 145,
    abortAngle: 155,
    upAngle: 160,
    downAngle: 100,
    releaseAngle: 110,
    shallowAngle: 130,
    minRepMs: 1000,
  } satisfies RepThresholds,
  /** Колени уже щиколоток: расстояние между коленями меньше этой доли расстояния между щиколотками. */
  kneeCaveRatio: 0.75,
  /** Корпус наклонён к вертикали сильнее этого угла. */
  torsoLeanDeg: 50,
  /** Ошибки техники проверяем только когда колено согнуто глубже этого угла. */
  checkBelowAngle: 140,
  /** Ширина плеч в кадре (в долях высоты) — отличает «лицом к камере» от «боком». */
  frontalShoulderWidth: 0.07,
  minVisibility: 0.5,
} as const;

const WATCHED: readonly ErrorCode[] = ["knees_cave_in", "torso_lean", "too_fast"];

export class SquatCounter extends AngleRepCounter {
  constructor() {
    super("squat", SQUAT_CONFIG.thresholds, WATCHED);
  }

  protected measure(frame: PoseFrame): number | null {
    return jointAngle(frame, KNEE_JOINTS.left, KNEE_JOINTS.right, SQUAT_CONFIG.minVisibility);
  }

  protected activeErrors(frame: PoseFrame, angle: number): ReadonlySet<ErrorCode> {
    const active = new Set<ErrorCode>();
    if (angle >= SQUAT_CONFIG.checkBelowAngle) return active;
    const minVis = SQUAT_CONFIG.minVisibility;

    // Колени сводятся внутрь — видно только лицом к камере.
    if (
      allVisible(
        frame,
        [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE, LM.L_SHOULDER, LM.R_SHOULDER],
        minVis,
      )
    ) {
      const shoulderWidth = Math.abs(
        imagePoint(frame, LM.L_SHOULDER).x - imagePoint(frame, LM.R_SHOULDER).x,
      );
      const kneeDist = Math.abs(imagePoint(frame, LM.L_KNEE).x - imagePoint(frame, LM.R_KNEE).x);
      const ankleDist = Math.abs(imagePoint(frame, LM.L_ANKLE).x - imagePoint(frame, LM.R_ANKLE).x);
      this.debug.kneeRatio = ankleDist > 0 ? kneeDist / ankleDist : 0;
      if (
        shoulderWidth >= SQUAT_CONFIG.frontalShoulderWidth &&
        ankleDist > 0.04 &&
        kneeDist < SQUAT_CONFIG.kneeCaveRatio * ankleDist
      ) {
        active.add("knees_cave_in");
      }
    }

    // Сильный наклон корпуса вперёд (с учётом глубины, поэтому работает и лицом к камере).
    if (allVisible(frame, [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP], minVis)) {
      const hip = midpoint(bodyPoint(frame, LM.L_HIP), bodyPoint(frame, LM.R_HIP));
      const shoulder = midpoint(bodyPoint(frame, LM.L_SHOULDER), bodyPoint(frame, LM.R_SHOULDER));
      const lean = tiltFromVertical(hip, shoulder);
      this.debug.torsoLean = lean;
      if (lean > SQUAT_CONFIG.torsoLeanDeg) active.add("torso_lean");
    }
    return active;
  }
}
