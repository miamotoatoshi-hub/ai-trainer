import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { LANDMARK_COUNT, type Landmark, type PoseFrame } from "./types";

const LOCAL_WASM = "/mediapipe/wasm";
const LOCAL_MODEL = "/models/pose_landmarker_lite.task";
// Запасной путь, если локальные файлы не подготовлены (нет сети при установке): берём с CDN.
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

type Delegate = "GPU" | "CPU";

async function createLandmarker(wasm: string, model: string, delegate: Delegate) {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(wasm);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/** Обёртка над MediaPipe PoseLandmarker: видео обрабатывается прямо в браузере и никуда не отправляется. */
export class PoseEngine {
  private lastTimestamp = -1;
  /** Скользящее среднее времени распознавания одного кадра (мс) — для контроля FPS. */
  inferenceMs = 0;
  delegate: Delegate = "CPU";

  private constructor(private readonly landmarker: PoseLandmarker) {}

  static async create(): Promise<PoseEngine> {
    // Сначала быстрый GPU, потом CPU; сначала свои файлы, потом CDN.
    const attempts: [string, string, Delegate][] = [
      [LOCAL_WASM, LOCAL_MODEL, "GPU"],
      [LOCAL_WASM, LOCAL_MODEL, "CPU"],
      [CDN_WASM, CDN_MODEL, "CPU"],
    ];
    let lastError: unknown;
    for (const [wasm, model, delegate] of attempts) {
      try {
        const engine = new PoseEngine(await createLandmarker(wasm, model, delegate));
        engine.delegate = delegate;
        return engine;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("pose-engine-unavailable");
  }

  /** Распознаёт позу в текущем кадре видео. null — человека в кадре нет. */
  detect(video: HTMLVideoElement, nowMs: number): PoseFrame | null {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    // MediaPipe требует строго возрастающих временных меток.
    const timestamp = Math.max(nowMs, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    const started = performance.now();
    const result = this.landmarker.detectForVideo(video, timestamp);
    const spent = performance.now() - started;
    this.inferenceMs = this.inferenceMs === 0 ? spent : this.inferenceMs * 0.9 + spent * 0.1;

    const image = result.landmarks[0];
    if (!image || image.length < LANDMARK_COUNT) return null;
    const world = result.worldLandmarks[0];
    const toLandmark = (l: { x: number; y: number; z: number; visibility?: number }): Landmark => ({
      x: l.x,
      y: l.y,
      z: l.z,
      visibility: l.visibility ?? 0,
    });
    return {
      t: nowMs,
      aspect: video.videoWidth / video.videoHeight,
      landmarks: image.map(toLandmark),
      world: world && world.length >= LANDMARK_COUNT ? world.map(toLandmark) : undefined,
    };
  }

  close(): void {
    this.landmarker.close();
  }
}
