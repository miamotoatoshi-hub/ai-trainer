import type { ExerciseId } from "@/lib/data/types";
import { LANDMARK_COUNT, LM, type Landmark, type PoseFrame } from "./types";

/**
 * Симулятор человека: по углам суставов строит скелет и «снимает» его камерой сбоку или спереди.
 * Нужен для тестов счётчиков (без записи видео), демо без камеры и проверки потока тренировки.
 *
 * Тело задаётся в метрах в «человеческих» осях: f — вперёд (куда смотрит), u — вверх от пола,
 * l — вбок. Камера проецирует их на кадр и отдельно отдаёт мировые 3D-координаты, как MediaPipe.
 */

export type SimView = "side" | "front";

interface Joint {
  f: number;
  u: number;
  l: number;
}

const J = (f: number, u: number, l = 0): Joint => ({ f, u, l });

// размеры тела, м
const THIGH = 0.45;
const SHIN = 0.45;
const TRUNK = 0.5;
const ANKLE_H = 0.08;
const SHOULDER_HALF = 0.18;
const HIP_HALF = 0.1;
const ANKLE_HALF = 0.1;
const KNEE_HALF = 0.1;

/** Масштаб: сколько высоты кадра занимает один метр (человек 1.75 м ≈ 72% кадра). */
const SCALE = 0.41;
const FLOOR_Y = 0.93;
const DEFAULT_ASPECT = 9 / 16;

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface CameraOptions {
  view?: SimView;
  aspect?: number;
  /** Сдвиг по горизонтали в кадре (доли ширины). */
  offsetX?: number;
  /** Какая «ось вперёд» ставится в центр кадра (для горизонтальных поз). */
  centerF?: number;
  /** Точки, которые «не видны» (visibility = 0.05). */
  hide?: readonly number[];
  visibility?: number;
}

function toFrame(
  joints: Partial<Record<number, Joint>>,
  t: number,
  {
    view = "side",
    aspect = DEFAULT_ASPECT,
    offsetX = 0,
    centerF = 0,
    hide = [],
    visibility = 0.99,
  }: CameraOptions,
): PoseFrame {
  const nose = joints[LM.NOSE] ?? J(0, 1.7);
  const hipL = joints[LM.L_HIP] ?? J(0, 1);
  const hipR = joints[LM.R_HIP] ?? J(0, 1);
  const hipMid = { f: (hipL.f + hipR.f) / 2, u: (hipL.u + hipR.u) / 2, l: (hipL.l + hipR.l) / 2 };

  const world = (j: Joint) =>
    view === "side" ? { x: j.f, y: -j.u, z: j.l } : { x: j.l, y: -j.u, z: -j.f };
  const hipW = world(hipMid);

  const fallback = (index: number): Joint => {
    if (index >= 1 && index <= 10) return nose;
    if (index === 17 || index === 19 || index === 21) return joints[LM.L_WRIST] ?? nose;
    if (index === 18 || index === 20 || index === 22) return joints[LM.R_WRIST] ?? nose;
    return hipMid;
  };

  const landmarks: Landmark[] = [];
  const worldLandmarks: Landmark[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i += 1) {
    const j = joints[i] ?? fallback(i);
    const w = world(j);
    const horizontal = view === "side" ? j.f - centerF : j.l;
    const v = hide.includes(i) ? 0.05 : visibility;
    landmarks.push({
      x: 0.5 + offsetX + (horizontal * SCALE) / aspect,
      y: FLOOR_Y - j.u * SCALE,
      z: 0,
      visibility: v,
    });
    worldLandmarks.push({ x: w.x - hipW.x, y: w.y - hipW.y, z: w.z - hipW.z, visibility: v });
  }
  return { t, aspect, landmarks, world: worldLandmarks };
}

/** Две кости с суставом посередине: P0 → (L1) → сустав → (L2) → E. Угол в суставе — interior. */
function twoLink(
  p0: Joint,
  l1: number,
  l2: number,
  interiorDeg: number,
  firstDirDeg: number,
  sigma: 1 | -1,
): { joint: Joint; end: Joint } {
  const d1 = rad(firstDirDeg);
  const joint = J(p0.f + l1 * Math.cos(d1), p0.u + l1 * Math.sin(d1), p0.l);
  const d2 = d1 + Math.PI + sigma * rad(interiorDeg);
  const end = J(joint.f + l2 * Math.cos(d2), joint.u + l2 * Math.sin(d2), p0.l);
  return { joint, end };
}

// ---------- приседания ----------

export interface SquatPose {
  /** Угол в колене, градусы (180 — прямая нога). */
  kneeAngle: number;
  /** Наклон корпуса вперёд от вертикали, градусы. По умолчанию — естественный. */
  lean?: number;
  /** 0..1: насколько колени сведены внутрь (виден только спереди). */
  cave?: number;
}

export function squatJoints({
  kneeAngle,
  lean,
  cave = 0,
}: SquatPose): Partial<Record<number, Joint>> {
  const shinTilt = (180 - kneeAngle) * 0.25;
  const leanDeg = lean ?? (180 - kneeAngle) * 0.3;
  const ankle = J(0, ANKLE_H);
  const { joint: knee, end: hip } = twoLink(ankle, SHIN, THIGH, kneeAngle, 90 - shinTilt, -1);
  const shoulder = J(
    hip.f + TRUNK * Math.sin(rad(leanDeg)),
    hip.u + TRUNK * Math.cos(rad(leanDeg)),
  );
  const nose = J(shoulder.f + 0.06, shoulder.u + 0.27);
  const kneeLat = KNEE_HALF * (1 - 0.7 * cave);
  const lr = (j: Joint, half: number, sign: 1 | -1): Joint => ({ ...j, l: j.l + sign * half });
  return {
    [LM.NOSE]: nose,
    [LM.L_SHOULDER]: lr(shoulder, SHOULDER_HALF, -1),
    [LM.R_SHOULDER]: lr(shoulder, SHOULDER_HALF, 1),
    [LM.L_ELBOW]: lr(J(shoulder.f + 0.1, shoulder.u - 0.12), SHOULDER_HALF, -1),
    [LM.R_ELBOW]: lr(J(shoulder.f + 0.1, shoulder.u - 0.12), SHOULDER_HALF, 1),
    [LM.L_WRIST]: lr(J(shoulder.f + 0.3, shoulder.u - 0.12), SHOULDER_HALF - 0.04, -1),
    [LM.R_WRIST]: lr(J(shoulder.f + 0.3, shoulder.u - 0.12), SHOULDER_HALF - 0.04, 1),
    [LM.L_HIP]: lr(hip, HIP_HALF, -1),
    [LM.R_HIP]: lr(hip, HIP_HALF, 1),
    [LM.L_KNEE]: lr(knee, kneeLat, -1),
    [LM.R_KNEE]: lr(knee, kneeLat, 1),
    [LM.L_ANKLE]: lr(ankle, ANKLE_HALF, -1),
    [LM.R_ANKLE]: lr(ankle, ANKLE_HALF, 1),
    [LM.L_HEEL]: lr(J(-0.06, 0.03), ANKLE_HALF, -1),
    [LM.R_HEEL]: lr(J(-0.06, 0.03), ANKLE_HALF, 1),
    [LM.L_FOOT]: lr(J(0.13, 0.03), ANKLE_HALF, -1),
    [LM.R_FOOT]: lr(J(0.13, 0.03), ANKLE_HALF, 1),
  };
}

export function squatFrame(pose: SquatPose, t = 0, camera: CameraOptions = {}): PoseFrame {
  return toFrame(squatJoints(pose), t, camera);
}

// ---------- отжимания и планка (вид сбоку, тело горизонтально) ----------

const BODY_LEN = 1.35;
const TORSO_FRAC = 0.5 / BODY_LEN;

/** Размещает тело вдоль линии плечо→щиколотка; sag > 0 — таз ниже линии, sag < 0 — выше (доли длины тела). */
function horizontalBody(shoulder: Joint, sag: number): { hip: Joint; knee: Joint; ankle: Joint } {
  const ankleU = 0.06;
  const dropU = shoulder.u - ankleU;
  const span = Math.sqrt(Math.max(0.01, BODY_LEN * BODY_LEN - dropU * dropU));
  const ankle = J(shoulder.f - span, ankleU);
  const onLine = (frac: number): Joint =>
    J(shoulder.f + (ankle.f - shoulder.f) * frac, shoulder.u + (ankle.u - shoulder.u) * frac);
  const hipLine = onLine(TORSO_FRAC);
  const kneeLine = onLine(0.75);
  return {
    hip: J(hipLine.f, hipLine.u - sag * BODY_LEN),
    knee: J(kneeLine.f, kneeLine.u - sag * BODY_LEN * 0.4),
    ankle,
  };
}

function bodyFromSide(
  shoulder: Joint,
  elbow: Joint,
  wrist: Joint,
  sag: number,
): Partial<Record<number, Joint>> {
  const { hip, knee, ankle } = horizontalBody(shoulder, sag);
  const side = (j: Joint, sign: 1 | -1): Joint => ({ ...j, l: sign * 0.05 });
  return {
    [LM.NOSE]: J(shoulder.f + 0.2, shoulder.u + 0.03),
    [LM.L_SHOULDER]: side(shoulder, -1),
    [LM.R_SHOULDER]: side(shoulder, 1),
    [LM.L_ELBOW]: side(elbow, -1),
    [LM.R_ELBOW]: side(elbow, 1),
    [LM.L_WRIST]: side(wrist, -1),
    [LM.R_WRIST]: side(wrist, 1),
    [LM.L_HIP]: side(hip, -1),
    [LM.R_HIP]: side(hip, 1),
    [LM.L_KNEE]: side(knee, -1),
    [LM.R_KNEE]: side(knee, 1),
    [LM.L_ANKLE]: side(ankle, -1),
    [LM.R_ANKLE]: side(ankle, 1),
    [LM.L_FOOT]: side(J(ankle.f - 0.08, 0.02), -1),
    [LM.R_FOOT]: side(J(ankle.f - 0.08, 0.02), 1),
    [LM.L_HEEL]: side(J(ankle.f + 0.05, 0.04), -1),
    [LM.R_HEEL]: side(J(ankle.f + 0.05, 0.04), 1),
  };
}

export interface PushupPose {
  /** Угол в локте, градусы. */
  elbowAngle: number;
  /** Провисание таза (>0) или «домик» (<0), доли длины тела. */
  sag?: number;
}

export function pushupJoints({ elbowAngle, sag = 0 }: PushupPose): Partial<Record<number, Joint>> {
  const wrist = J(0.05, 0.03);
  const { joint: elbow, end: shoulder } = twoLink(wrist, 0.27, 0.3, elbowAngle, 90, 1);
  return bodyFromSide(shoulder, elbow, wrist, sag);
}

export function pushupFrame(pose: PushupPose, t = 0, camera: CameraOptions = {}): PoseFrame {
  return toFrame(pushupJoints(pose), t, {
    view: "side",
    aspect: 16 / 9,
    centerF: -0.55,
    ...camera,
  });
}

export interface PlankPose {
  sag?: number;
}

export function plankFrame(
  { sag = 0 }: PlankPose = {},
  t = 0,
  camera: CameraOptions = {},
): PoseFrame {
  const elbow = J(0, 0.05);
  const wrist = J(0.25, 0.05);
  const shoulder = J(0, 0.35);
  return toFrame(bodyFromSide(shoulder, elbow, wrist, sag), t, {
    view: "side",
    aspect: 16 / 9,
    centerF: -0.6,
    ...camera,
  });
}

// ---------- выпады (вид сбоку) ----------

export interface LungePose {
  /** Угол в колене передней ноги, градусы. */
  kneeAngle: number;
  /** Насколько колено выдвинуто за носок: добавка к наклону голени, градусы. */
  overToe?: number;
}

export function lungeFrame(
  { kneeAngle, overToe = 0 }: LungePose,
  t = 0,
  camera: CameraOptions = {},
): PoseFrame {
  const shinTilt = (180 - kneeAngle) * 0.15 + overToe;
  const ankle = J(0.4, ANKLE_H);
  const { joint: knee, end: hip } = twoLink(ankle, SHIN, THIGH, kneeAngle, 90 - shinTilt, -1);
  const shoulder = J(hip.f + TRUNK * 0.05, hip.u + TRUNK);

  // Задняя нога: стопа сзади на полу, колено сгибается по закону косинусов.
  const rearAnkle = J(hip.f - 0.55, ANKLE_H);
  const dist = Math.hypot(hip.f - rearAnkle.f, hip.u - rearAnkle.u);
  const clamped = Math.min(THIGH + SHIN - 0.01, dist);
  const beta = Math.acos(Math.min(1, clamped / (2 * THIGH)));
  const toAnkle = Math.atan2(rearAnkle.u - hip.u, rearAnkle.f - hip.f);
  const rearKnee = J(
    hip.f + THIGH * Math.cos(toAnkle + beta),
    hip.u + THIGH * Math.sin(toAnkle + beta),
  );

  const side = (j: Joint, sign: 1 | -1): Joint => ({ ...j, l: sign * 0.05 });
  const joints: Partial<Record<number, Joint>> = {
    [LM.NOSE]: J(shoulder.f + 0.06, shoulder.u + 0.27),
    [LM.L_SHOULDER]: side(shoulder, -1),
    [LM.R_SHOULDER]: side(shoulder, 1),
    [LM.L_ELBOW]: side(J(shoulder.f, shoulder.u - 0.28), -1),
    [LM.R_ELBOW]: side(J(shoulder.f, shoulder.u - 0.28), 1),
    [LM.L_WRIST]: side(J(shoulder.f + 0.02, shoulder.u - 0.55), -1),
    [LM.R_WRIST]: side(J(shoulder.f + 0.02, shoulder.u - 0.55), 1),
    [LM.L_HIP]: side(hip, -1),
    [LM.R_HIP]: side(hip, 1),
    // левая — передняя нога, правая — задняя
    [LM.L_KNEE]: side(knee, -1),
    [LM.L_ANKLE]: side(ankle, -1),
    [LM.L_FOOT]: side(J(ankle.f + 0.13, 0.03), -1),
    [LM.L_HEEL]: side(J(ankle.f - 0.06, 0.03), -1),
    [LM.R_KNEE]: side(rearKnee, 1),
    [LM.R_ANKLE]: side(rearAnkle, 1),
    [LM.R_FOOT]: side(J(rearAnkle.f + 0.13, 0.03), 1),
    [LM.R_HEEL]: side(J(rearAnkle.f - 0.06, 0.03), 1),
  };
  return toFrame(joints, t, { view: "side", centerF: 0.1, ...camera });
}

// ---------- прыжки «джек» (вид спереди) ----------

export interface JackPose {
  /** 0 — руки опущены, 1 — подняты над головой. */
  arms: number;
  /** 0 — ноги вместе, 1 — широко врозь. */
  legs: number;
}

export function jackFrame({ arms, legs }: JackPose, t = 0, camera: CameraOptions = {}): PoseFrame {
  const shoulderU = 1.48;
  const hipU = 1.0;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const ankleLat = lerp(ANKLE_HALF, 0.48, legs);
  const kneeLat = lerp(KNEE_HALF, 0.28, legs);
  const wristU = lerp(0.9, 1.95, arms);
  const wristLat = lerp(0.22, 0.35, arms);
  const elbowU = lerp(1.18, 1.72, arms);
  const elbowLat = lerp(0.24, 0.3, arms);
  const lr = (u: number, lat: number, sign: 1 | -1, f = 0): Joint => J(f, u, sign * lat);
  const joints: Partial<Record<number, Joint>> = {
    [LM.NOSE]: J(0, 1.7),
    [LM.L_SHOULDER]: lr(shoulderU, SHOULDER_HALF, -1),
    [LM.R_SHOULDER]: lr(shoulderU, SHOULDER_HALF, 1),
    [LM.L_ELBOW]: lr(elbowU, elbowLat, -1),
    [LM.R_ELBOW]: lr(elbowU, elbowLat, 1),
    [LM.L_WRIST]: lr(wristU, wristLat, -1),
    [LM.R_WRIST]: lr(wristU, wristLat, 1),
    [LM.L_HIP]: lr(hipU, HIP_HALF, -1),
    [LM.R_HIP]: lr(hipU, HIP_HALF, 1),
    [LM.L_KNEE]: lr(0.53, kneeLat, -1),
    [LM.R_KNEE]: lr(0.53, kneeLat, 1),
    [LM.L_ANKLE]: lr(ANKLE_H, ankleLat, -1),
    [LM.R_ANKLE]: lr(ANKLE_H, ankleLat, 1),
    [LM.L_FOOT]: lr(0.03, ankleLat + 0.02, -1, 0.1),
    [LM.R_FOOT]: lr(0.03, ankleLat + 0.02, 1, 0.1),
    [LM.L_HEEL]: lr(0.03, ankleLat, -1, -0.05),
    [LM.R_HEEL]: lr(0.03, ankleLat, 1, -0.05),
  };
  return toFrame(joints, t, { view: "front", ...camera });
}

// ---------- сценарии: функция времени → кадр ----------

/** Вид повторения в сценарии. «good» — нормальное, остальные — с ошибкой техники. */
export type RepKind = "good" | "shallow" | "cave" | "lean" | "fast" | "sag" | "partial" | "over";

export interface SimSource {
  /** Кадр в момент tMs от начала сценария (миллисекунды). */
  frameAt(tMs: number): PoseFrame;
  /** Сколько миллисекунд длится одно повторение (для планки — 0). */
  readonly repMs: number;
}

export interface SimScriptOptions {
  exercise: ExerciseId;
  /** Какие повторения делать по кругу. По умолчанию — только нормальные. */
  kinds?: readonly RepKind[];
  /** Пауза стоя перед началом (мс). */
  leadMs?: number;
  /** Пауза между повторениями (мс). */
  restMs?: number;
  /** Дрожание угла в градусах (случайное, но воспроизводимое). */
  jitterDeg?: number;
  seed?: number;
  view?: SimView;
  camera?: CameraOptions;
}

/** Небольшой воспроизводимый генератор случайных чисел. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гладкая «горка»: 0 → 1 → 0 за p от 0 до 1. */
const hill = (p: number) => (1 - Math.cos(2 * Math.PI * Math.min(1, Math.max(0, p)))) / 2;

interface RepShape {
  bottom: number;
  repMs: number;
  extra?: number;
}

const SQUAT_SHAPES: Record<string, RepShape> = {
  good: { bottom: 78, repMs: 2600 },
  shallow: { bottom: 118, repMs: 2400 },
  cave: { bottom: 80, repMs: 2600, extra: 0.55 },
  lean: { bottom: 88, repMs: 2600, extra: 62 },
  fast: { bottom: 80, repMs: 650 },
};
const PUSHUP_SHAPES: Record<string, RepShape> = {
  good: { bottom: 78, repMs: 1800 },
  shallow: { bottom: 112, repMs: 1600 },
  sag: { bottom: 80, repMs: 1800, extra: 0.13 },
  fast: { bottom: 80, repMs: 450 },
};
const LUNGE_SHAPES: Record<string, RepShape> = {
  good: { bottom: 88, repMs: 2600 },
  shallow: { bottom: 122, repMs: 2400 },
  over: { bottom: 88, repMs: 2600, extra: 22 },
  fast: { bottom: 88, repMs: 650 },
};
const JACK_SHAPES: Record<string, RepShape> = {
  good: { bottom: 0, repMs: 900 },
  partial: { bottom: 0, repMs: 900, extra: 1 },
};

/** Сценарий для упражнения: повторения по кругу из kinds; планка — непрерывное удержание. */
export function createSim(options: SimScriptOptions): SimSource {
  const {
    exercise,
    kinds = ["good"],
    leadMs = 800,
    restMs = 700,
    jitterDeg = 0,
    seed = 1,
  } = options;
  const camera = options.camera ?? {};
  const rand = mulberry32(seed);
  const noise = () => (jitterDeg ? (rand() * 2 - 1) * jitterDeg : 0);

  const shapes =
    exercise === "squat"
      ? SQUAT_SHAPES
      : exercise === "pushup"
        ? PUSHUP_SHAPES
        : exercise === "lunge"
          ? LUNGE_SHAPES
          : JACK_SHAPES;
  const shapeOf = (kind: string): RepShape => shapes[kind] ?? shapes.good!;

  const standing = (t: number): PoseFrame => {
    switch (exercise) {
      case "squat":
        return squatFrame({ kneeAngle: 172 + noise() }, t, {
          view: options.view ?? "front",
          ...camera,
        });
      case "pushup":
        return pushupFrame({ elbowAngle: 172 + noise() }, t, camera);
      case "lunge":
        return lungeFrame({ kneeAngle: 172 + noise() }, t, camera);
      case "plank":
        return plankFrame({}, t, camera);
      case "jumping_jack":
        return jackFrame({ arms: 0, legs: 0 }, t, camera);
    }
  };

  if (exercise === "plank") {
    const kind = kinds[0] ?? "good";
    return {
      repMs: 0,
      frameAt: (t) => plankFrame({ sag: kind === "sag" ? 0.13 : 0 }, t, camera),
    };
  }

  const frameAt = (t: number): PoseFrame => {
    if (t < leadMs) return standing(t);
    // Находим повторение по накопленной длительности.
    let cursor = leadMs;
    for (let i = 0; ; i += 1) {
      const kind = kinds[i % kinds.length] ?? "good";
      const shape = shapeOf(kind);
      const end = cursor + shape.repMs + restMs;
      if (t < end) {
        const into = t - cursor;
        if (into >= shape.repMs) return standing(t);
        const p = into / shape.repMs;
        const k = hill(p);
        switch (exercise) {
          case "squat": {
            const angle = 172 - (172 - shape.bottom) * k + noise();
            return squatFrame(
              {
                kneeAngle: angle,
                lean: kind === "lean" ? (shape.extra ?? 0) * k : undefined,
                cave: kind === "cave" ? (shape.extra ?? 0) * Math.min(1, k * 1.5) : 0,
              },
              t,
              { view: options.view ?? "front", ...camera },
            );
          }
          case "pushup": {
            const angle = 172 - (172 - shape.bottom) * k + noise();
            return pushupFrame(
              { elbowAngle: angle, sag: kind === "sag" ? (shape.extra ?? 0) : 0 },
              t,
              camera,
            );
          }
          case "lunge": {
            const angle = 172 - (172 - shape.bottom) * k + noise();
            return lungeFrame(
              { kneeAngle: angle, overToe: kind === "over" ? (shape.extra ?? 0) * k : 0 },
              t,
              camera,
            );
          }
          case "jumping_jack": {
            // руки и ноги разводятся и сводятся; «partial» — ноги остаются вместе
            return jackFrame({ arms: k, legs: kind === "partial" ? 0 : k }, t, camera);
          }
          default:
            return standing(t);
        }
      }
      cursor = end;
    }
  };

  return { repMs: shapeOf(kinds[0] ?? "good").repMs, frameAt };
}

/** Кадры сценария с шагом 1/hz секунды (для тестов). */
export function sampleSim(
  source: SimSource,
  durationMs: number,
  hz = 30,
  startMs = 0,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const step = 1000 / hz;
  for (let t = 0; t <= durationMs; t += step) frames.push(source.frameAt(startMs + t));
  return frames;
}

/** Сколько миллисекунд занимают `reps` повторений сценария из одинаковых kinds (с запасом на хвост). */
export function simDuration(options: SimScriptOptions, reps: number): number {
  const { exercise, kinds = ["good"], leadMs = 800, restMs = 700 } = options;
  const shapes =
    exercise === "squat"
      ? SQUAT_SHAPES
      : exercise === "pushup"
        ? PUSHUP_SHAPES
        : exercise === "lunge"
          ? LUNGE_SHAPES
          : JACK_SHAPES;
  let total = leadMs;
  for (let i = 0; i < reps; i += 1) {
    const kind = kinds[i % kinds.length] ?? "good";
    total += (shapes[kind] ?? shapes.good!).repMs + restMs;
  }
  return total + 500;
}
