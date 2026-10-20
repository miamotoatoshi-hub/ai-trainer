// Типы позы. Координаты MediaPipe: x вправо, y вниз, z — глубина.

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Landmark extends Point3 {
  /** Уверенность модели, что точка видна (0..1). */
  visibility: number;
}

export interface PoseFrame {
  /** Время кадра в миллисекундах (монотонное; в симуляторе — «виртуальное»). */
  t: number;
  /** Ширина / высота видео. Нужна, чтобы углы на картинке не искажались. */
  aspect: number;
  /** Нормализованные координаты в кадре (0..1), 33 точки. */
  landmarks: Landmark[];
  /** Метрические 3D-координаты в метрах (если модель их дала) — для углов, не зависящих от ракурса. */
  world?: Landmark[];
}

/** Номера точек тела в модели BlazePose (33 точки). */
export const LM = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT: 31,
  R_FOOT: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** Соединения для рисования скелета (режим отладки и клип). */
export const SKELETON_EDGES: readonly (readonly [number, number])[] = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
  [LM.L_ANKLE, LM.L_FOOT],
  [LM.R_ANKLE, LM.R_FOOT],
];
