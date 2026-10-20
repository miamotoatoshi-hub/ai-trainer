import { LM, type Point3, type PoseFrame } from "./types";

export function vis(frame: PoseFrame, index: number): number {
  return frame.landmarks[index]?.visibility ?? 0;
}

/** Все ли точки видны с уверенностью не ниже min. */
export function allVisible(frame: PoseFrame, indices: readonly number[], min = 0.5): boolean {
  return indices.every((i) => vis(frame, i) >= min);
}

/** Точка в кадре, исправленная на пропорции видео (x умножен на aspect) — 2D-углы не искажаются. */
export function imagePoint(frame: PoseFrame, index: number): Point3 {
  const l = frame.landmarks[index];
  return l ? { x: l.x * frame.aspect, y: l.y, z: 0 } : { x: 0, y: 0, z: 0 };
}

/** 3D-точка: мировые координаты, если есть, иначе плоская точка из кадра. */
export function bodyPoint(frame: PoseFrame, index: number): Point3 {
  const w = frame.world?.[index];
  return w ? { x: w.x, y: w.y, z: w.z } : imagePoint(frame, index);
}

export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Угол при вершине b (градусы, 0..180) между лучами b→a и b→c. */
export function angleAt(a: Point3, b: Point3, c: Point3): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const len = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  if (len === 0) return 180;
  const cos = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / len;
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Угол отрезка a→b к вертикали в градусах (0 — строго вертикально). Глубина z учитывается. */
export function tiltFromVertical(a: Point3, b: Point3): number {
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  const vertical = Math.abs(b.y - a.y);
  return (Math.atan2(horizontal, vertical) * 180) / Math.PI;
}

/** Угол в плоскости картинки между вектором a→b и горизонталью (0..90). */
export function slopeFromHorizontal(a: Point3, b: Point3): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

/**
 * Угол сустава по трём точкам для одной стороны тела, либо среднее по обеим сторонам
 * (с весом по видимости). null — ни одна сторона не видна достаточно хорошо.
 */
export function jointAngle(
  frame: PoseFrame,
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  minVisibility = 0.5,
): number | null {
  const sides = [left, right]
    .map((ids) => {
      const weight = Math.min(...ids.map((i) => vis(frame, i)));
      if (weight < minVisibility) return null;
      const [a, b, c] = ids;
      return {
        weight,
        angle: angleAt(bodyPoint(frame, a), bodyPoint(frame, b), bodyPoint(frame, c)),
      };
    })
    .filter((s): s is { weight: number; angle: number } => s !== null);
  if (sides.length === 0) return null;
  const total = sides.reduce((sum, s) => sum + s.weight, 0);
  return sides.reduce((sum, s) => sum + s.angle * s.weight, 0) / total;
}

export const KNEE_JOINTS = {
  left: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE],
  right: [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE],
} as const;

export const ELBOW_JOINTS = {
  left: [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],
  right: [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST],
} as const;
