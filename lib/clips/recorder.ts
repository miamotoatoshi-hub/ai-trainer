import type { CoachId } from "@/lib/data/types";
import { clipSizeFor, pickMimeType, type ClipSize } from "./layout";
import { drawClipFrame, loadClipAssets, type ClipAssets, type ClipFrameState } from "./render";
import { MomentTracker, SegmentKeeper, type Segment } from "./segments";

export interface ClipRecorderOptions {
  coachId: CoachId;
  video: HTMLVideoElement | null;
  skeleton: HTMLCanvasElement | null;
  mirror: boolean;
  /** Звук реплик тренера (микрофон не записывается). */
  audio: MediaStream | null;
  /** Длина одного отрезка, мс. */
  segmentMs?: number;
  size?: ClipSize;
}

export type ClipResult = Segment;

const DEFAULT_SEGMENT_MS = 15_000;

function deviceSize(): ClipSize {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return clipSizeFor({ cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory });
}

/**
 * Запись клипа во время тренировки: кадры собираются на скрытом холсте 9:16 (видео + оверлей),
 * холст пишется через MediaRecorder независимыми отрезками, остаётся отрезок с лучшим моментом.
 * Всё происходит на устройстве, ничего никуда не отправляется.
 */
export class ClipRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size: ClipSize;
  private readonly keeper = new SegmentKeeper();
  private readonly tracker = new MomentTracker();
  private readonly segmentMs: number;
  private assets: ClipAssets | null = null;
  private stream: MediaStream | null = null;
  private mime = "";
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private segmentStartedAt = 0;
  private drawTimer: number | null = null;
  private rotateTimer: number | null = null;
  private running = false;
  private state: ClipFrameState;

  private constructor(private readonly options: ClipRecorderOptions) {
    this.size = options.size ?? deviceSize();
    this.segmentMs = options.segmentMs ?? DEFAULT_SEGMENT_MS;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size.width;
    this.canvas.height = this.size.height;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d недоступен");
    this.ctx = ctx;
    this.state = {
      coachId: options.coachId,
      count: 0,
      targetLabel: null,
      caption: null,
      subtitle: null,
      emotion: "neutral",
    };
  }

  /** Умеет ли браузер записывать клипы (MediaRecorder + запись холста). */
  static isSupported(): boolean {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      pickMimeType((m) => MediaRecorder.isTypeSupported(m)) !== null
    );
  }

  /** Начинает запись. null — не получилось (браузер не умеет): тренировка идёт без клипа. */
  static async start(options: ClipRecorderOptions): Promise<ClipRecorder | null> {
    if (!ClipRecorder.isSupported()) return null;
    try {
      const recorder = new ClipRecorder(options);
      await recorder.begin();
      return recorder;
    } catch {
      return null;
    }
  }

  private async begin(): Promise<void> {
    this.assets = await loadClipAssets(this.options.coachId);
    const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error("нет подходящего формата");
    this.mime = mime;
    const video = this.canvas.captureStream(this.size.fps).getVideoTracks();
    const audio = this.options.audio?.getAudioTracks() ?? [];
    this.stream = new MediaStream([...video, ...audio]);
    this.running = true;
    this.draw();
    this.drawTimer = window.setInterval(() => this.draw(), 1000 / this.size.fps);
    this.startSegment();
  }

  /** Новые данные для оверлея: счётчик, подпись, эмоция. */
  update(partial: Partial<Omit<ClipFrameState, "coachId">>): void {
    this.state = { ...this.state, ...partial };
  }

  /** Момент для клипа: чем больше вес, тем вероятнее, что отрезок с ним станет клипом. */
  mark(weight: number, moment: string, subtitle: string | null): void {
    this.tracker.mark(weight, moment, subtitle);
  }

  private draw(): void {
    if (!this.assets) return;
    drawClipFrame(
      this.ctx,
      this.size,
      this.state,
      {
        video: this.options.video,
        skeleton: this.options.skeleton,
        mirror: this.options.mirror,
      },
      this.assets,
    );
  }

  private startSegment(): void {
    if (!this.running || !this.stream) return;
    this.chunks = [];
    this.tracker.reset();
    const recorder = new MediaRecorder(this.stream, {
      mimeType: this.mime,
      videoBitsPerSecond: this.size.bitrate,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder = recorder;
    this.segmentStartedAt = performance.now();
    recorder.start(1000);
    this.rotateTimer = window.setTimeout(() => void this.rotate(), this.segmentMs);
  }

  /** Закрывает текущий отрезок и записывает результат в «копилку». */
  private finishSegment(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    if (this.rotateTimer !== null) window.clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    const startedAt = this.segmentStartedAt;
    const { weight, moment, subtitle } = this.tracker;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        this.keeper.add({
          blob: new Blob(this.chunks, { type: this.mime.split(";")[0] }),
          mime: this.mime,
          durationSec: (performance.now() - startedAt) / 1000,
          weight,
          moment,
          subtitle,
        });
        this.chunks = [];
        resolve();
      };
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }

  private async rotate(): Promise<void> {
    await this.finishSegment();
    this.startSegment();
  }

  /** Заканчивает запись и возвращает лучший отрезок (или null, если записалось слишком мало). */
  async stop(): Promise<ClipResult | null> {
    if (!this.running) return this.keeper.best();
    this.running = false;
    await this.finishSegment();
    this.release();
    return this.keeper.best();
  }

  /** Остановить без результата (ушли с экрана). */
  dispose(): void {
    this.running = false;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // уже остановлено
      }
    }
    this.release();
  }

  private release(): void {
    if (this.drawTimer !== null) window.clearInterval(this.drawTimer);
    if (this.rotateTimer !== null) window.clearTimeout(this.rotateTimer);
    this.drawTimer = null;
    this.rotateTimer = null;
    // Дорожки холста останавливаем; дорожки звука принадлежат голосу тренера и не трогаются.
    this.stream?.getVideoTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
