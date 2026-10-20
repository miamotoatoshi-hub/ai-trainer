import { VOICE_CONFIG, PRERECORDED_COUNT_MAX, countPhraseId } from "@/lib/coach/voiceConfig";
import { getCoach } from "@/lib/coach/coaches";
import type { CoachId } from "@/lib/data/types";

export interface SpeakRequest {
  text: string;
  /** id заранее озвученной фразы (mp3), если она есть. */
  phraseId?: string;
  kind: "phrase" | "count" | "message";
  /** Прервать то, что звучит сейчас (для замечаний о безопасности). */
  interrupt?: boolean;
  /** Для счёта: число. */
  count?: number;
}

/** Грубая оценка длительности речи: примерно 16 знаков в секунду плюс запас. */
export function estimateSpeechMs(text: string): number {
  return Math.round(500 + text.length * 62);
}

interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

const FEMALE = /irina|milena|alena|katya|svetlana|female|женск|anna|tatyana|elena|yana/i;
const MALE = /pavel|yuri|maxim|dmitri|dmitry|male|мужск|nikolay|ivan/i;

/** Выбирает русский голос, по возможности подходящий по полу тренера. */
export function pickRussianVoice<T extends VoiceLike>(
  voices: readonly T[],
  gender: "m" | "f",
): T | null {
  const russian = voices.filter((v) => v.lang.toLowerCase().startsWith("ru"));
  if (russian.length === 0) return null;
  const wanted = gender === "f" ? FEMALE : MALE;
  const unwanted = gender === "f" ? MALE : FEMALE;
  return (
    russian.find((v) => wanted.test(v.name)) ??
    russian.find((v) => !unwanted.test(v.name)) ??
    russian[0] ??
    null
  );
}

let manifestPromise: Promise<Set<string>> | null = null;

/** Список заранее озвученных фраз (public/voices/manifest.json). Нет файла — значит, голос браузера. */
function loadManifest(): Promise<Set<string>> {
  manifestPromise ??= fetch("/voices/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ ids?: string[] }>) : { ids: [] }))
    .then((m) => new Set(m.ids ?? []))
    .catch(() => new Set<string>());
  return manifestPromise;
}

export interface PlayHandle {
  durationMs: number;
  stop: () => void;
  /** Закончилось ли воспроизведение (нормально или остановкой). */
  done: Promise<void>;
}

/** Голос тренера: готовые mp3 через Web Audio, а если их нет — синтез речи браузера. */
export class CoachVoice {
  private ctx: AudioContext | null = null;
  private recordingDest: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private messageCache = new Map<string, AudioBuffer>();
  private stopCurrent: (() => void) | null = null;
  private busyUntil = 0;

  constructor(
    private readonly coachId: CoachId,
    private enabled: boolean,
    private readonly options: { anonId?: string; record?: boolean } = {},
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  /** Тренер говорит прямо сейчас (по оценке длительности). */
  get busy(): boolean {
    return performance.now() < this.busyUntil;
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    if (this.options.record) this.recordingDest = this.ctx.createMediaStreamDestination();
    return this.ctx;
  }

  /** Браузеры включают звук только после действия пользователя — вызываем при первом касании. */
  unlock(): void {
    const ctx = this.audio();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  }

  /** Звук реплик для записи клипа (только голос тренера, микрофон не записывается). */
  recordingStream(): MediaStream | null {
    this.audio();
    return this.recordingDest?.stream ?? null;
  }

  /** Заранее загружает озвученные фразы, чтобы реакция была мгновенной. */
  async prepare(ids: readonly string[]): Promise<void> {
    if (!this.enabled) return;
    const manifest = await loadManifest();
    const available = ids.filter((id) => manifest.has(id) && !this.buffers.has(id));
    const ctx = this.audio();
    if (!ctx || available.length === 0) return;
    const queue = [...available];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const response = await fetch(`/voices/${this.coachId}/${id}.mp3`);
          if (!response.ok) continue;
          this.buffers.set(id, await ctx.decodeAudioData(await response.arrayBuffer()));
        } catch {
          // не получилось — будет голос браузера
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  speak(request: SpeakRequest): void {
    if (!this.enabled) return;
    if (this.busy) {
      // Счёт и обычные фразы не перебивают говорящего; перебить может только безопасность.
      if (request.kind === "count" || !request.interrupt) return;
      this.stop();
    }
    const id =
      request.phraseId ??
      (request.kind === "count" && request.count && request.count <= PRERECORDED_COUNT_MAX
        ? countPhraseId(this.coachId, request.count)
        : undefined);
    const buffer = id ? this.buffers.get(id) : undefined;
    if (buffer) {
      const handle = this.playBuffer(buffer);
      this.busyUntil = performance.now() + handle.durationMs + 120;
      return;
    }
    this.speakWithBrowser(request.text);
    this.busyUntil = performance.now() + estimateSpeechMs(request.text);
  }

  private playBuffer(buffer: AudioBuffer): PlayHandle {
    const ctx = this.audio()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    if (this.recordingDest) source.connect(this.recordingDest);
    let resolve!: () => void;
    const done = new Promise<void>((r) => {
      resolve = r;
    });
    source.onended = () => {
      if (this.stopCurrent === stop) this.stopCurrent = null;
      resolve();
    };
    const stop = () => {
      try {
        source.stop();
      } catch {
        // уже остановлен
      }
      resolve();
    };
    this.stopCurrent = stop;
    source.start();
    return { durationMs: buffer.duration * 1000, stop, done };
  }

  private speakWithBrowser(text: string): void {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const config = VOICE_CONFIG[this.coachId].browser;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    const voice = pickRussianVoice(synth.getVoices(), getCoach(this.coachId).gender);
    if (voice) utterance.voice = voice;
    utterance.pitch = config.pitch;
    utterance.rate = config.rate;
    utterance.volume = config.volume;
    this.stopCurrent = () => synth.cancel();
    synth.speak(utterance);
  }

  /**
   * Голосовое сообщение в чате: сначала настоящий голос с сервера (если есть ключ ElevenLabs),
   * иначе голос браузера. Возвращает управление воспроизведением.
   */
  async playMessage(text: string): Promise<PlayHandle> {
    this.stop();
    const ctx = this.audio();
    let buffer: AudioBuffer | undefined = this.messageCache.get(text);
    if (!buffer && ctx) {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-pinok-anon": this.options.anonId ?? "anonymous",
          },
          body: JSON.stringify({ text, coachId: this.coachId }),
        });
        if (response.ok && response.headers.get("content-type")?.includes("audio")) {
          buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          this.messageCache.set(text, buffer);
        }
      } catch {
        // сервер недоступен — голос браузера
      }
    }
    if (buffer) {
      this.unlock();
      const handle = this.playBuffer(buffer);
      this.busyUntil = performance.now() + handle.durationMs;
      return handle;
    }

    const durationMs = estimateSpeechMs(text);
    this.speakWithBrowser(text);
    this.busyUntil = performance.now() + durationMs;
    let resolve!: () => void;
    const done = new Promise<void>((r) => {
      resolve = r;
    });
    const timer = window.setTimeout(resolve, durationMs);
    const stop = () => {
      window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
      resolve();
    };
    return { durationMs, stop, done };
  }

  stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
    this.busyUntil = 0;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }
}
