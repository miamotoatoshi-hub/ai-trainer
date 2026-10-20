import type { ExerciseId } from "@/lib/data/types";
import { PoseEngine } from "./poseEngine";
import { PoseSmoother } from "./smoothing";
import { createSim, type RepKind, type SimSource, type SimView } from "./simulator";
import type { PoseFrame } from "./types";
import { lowerResolution } from "./camera";

export interface PollResult {
  frame: PoseFrame | null;
}

/** Откуда приходят кадры позы: настоящая камера или встроенный симулятор человека. */
export interface PoseSource {
  readonly kind: "camera" | "sim";
  /** «Часы» источника в миллисекундах. В симуляторе идут быстрее при speed > 1. */
  now(): number;
  /**
   * Результат очередного опроса: null — нового кадра с камеры ещё нет (ничего не делаем);
   * { frame: null } — кадр обработан, но человека в нём не нашли.
   */
  poll(): PollResult | null;
  /** Сообщить симулятору, какое упражнение «делает человек» (камере не нужно). */
  setExercise(id: ExerciseId): void;
  /** Симулятор «замирает» на паузе (камере это не нужно). */
  pause?(): void;
  resume?(): void;
  /** Симулятор возвращается в позу стоя (отдых между подходами). */
  idle?(): void;
  stop(): void;
}

export class CameraPoseSource implements PoseSource {
  readonly kind = "camera" as const;
  private readonly smoother = new PoseSmoother();
  private lastVideoTime = -1;
  private slowFrames = 0;
  private loweredResolution = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly stream: MediaStream,
    private readonly engine: PoseEngine,
  ) {}

  now(): number {
    return performance.now();
  }

  poll(): PollResult | null {
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = this.video.currentTime;
    const frame = this.engine.detect(this.video, this.now());
    this.watchPerformance();
    return { frame: frame ? this.smoother.smooth(frame) : null };
  }

  /** Целевые 30 FPS, минимум 15: если кадр обрабатывается дольше ~66 мс подряд, снижаем разрешение. */
  private watchPerformance(): void {
    if (this.loweredResolution) return;
    this.slowFrames = this.engine.inferenceMs > 66 ? this.slowFrames + 1 : 0;
    if (this.slowFrames > 45) {
      this.loweredResolution = true;
      void lowerResolution(this.stream);
    }
  }

  setExercise(): void {}

  stop(): void {
    for (const track of this.stream.getTracks()) track.stop();
    this.video.srcObject = null;
    this.engine.close();
  }
}

export interface SimConfig {
  /** Во сколько раз «человек» двигается быстрее реального времени (для тестов). */
  speed: number;
  kinds: readonly RepKind[];
  view?: SimView;
}

export const DEFAULT_SIM_KINDS: readonly RepKind[] = [
  "good",
  "good",
  "good",
  "shallow",
  "good",
  "good",
  "cave",
  "good",
  "good",
  "good",
];

export class SimPoseSource implements PoseSource {
  readonly kind = "sim" as const;
  private readonly realStart = performance.now();
  private sim: SimSource;
  private origin = 0;
  private lastFrameT = -Infinity;
  private exercise: ExerciseId = "squat";
  private paused = false;
  private pausedAtReal = 0;
  private pausedTotal = 0;

  constructor(private readonly config: SimConfig) {
    this.sim = this.build("squat", true);
  }

  private build(exercise: ExerciseId, idle: boolean): SimSource {
    return createSim({
      exercise,
      kinds: this.config.kinds,
      view: this.config.view,
      // перед началом (экран настройки) человек просто стоит
      leadMs: idle ? Number.POSITIVE_INFINITY : 900,
    });
  }

  now(): number {
    const real = this.paused ? this.pausedAtReal : performance.now();
    return (real - this.realStart - this.pausedTotal) * this.config.speed;
  }

  poll(): PollResult | null {
    const now = this.now();
    // 30 кадров в секунду «человеческого» времени
    if (now - this.lastFrameT < 1000 / 30) return null;
    this.lastFrameT = now;
    const frame = this.sim.frameAt(now - this.origin);
    return { frame: { ...frame, t: now } };
  }

  /** Человек «начинает» новое упражнение: отсчёт сценария идёт заново (с короткой паузы стоя). */
  setExercise(id: ExerciseId): void {
    this.exercise = id;
    this.sim = this.build(id, false);
    this.origin = this.now();
  }

  /** Вернуть «человека» в позу стоя (например, на отдыхе между подходами). */
  idle(): void {
    this.sim = this.build(this.exercise, true);
    this.origin = this.now();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAtReal = performance.now();
  }

  resume(): void {
    if (!this.paused) return;
    this.pausedTotal += performance.now() - this.pausedAtReal;
    this.paused = false;
  }

  stop(): void {}
}
