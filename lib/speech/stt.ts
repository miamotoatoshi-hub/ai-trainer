/**
 * Распознавание речи браузера (Web Speech API) — бесплатно, без ключей и серверов.
 * Работает в Chrome, Edge и Safari (в Safari на iPhone — с 14.5); в Firefox его нет.
 * Звук обрабатывает сам браузер/ОС, приложение получает только текст.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export type SttError = "denied" | "empty" | "network" | "error";

export interface SttHandlers {
  /** Промежуточный текст пока человек говорит. */
  onInterim?: (text: string) => void;
  /** Итоговый текст (может быть пустым, если ничего не расслышали). */
  onFinal: (text: string) => void;
  onError?: (error: SttError) => void;
}

export interface SttSession {
  /** Закончить запись и отдать то, что услышано. */
  stop(): void;
  /** Отменить, ничего не отдавая. */
  abort(): void;
}

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSttSupported(): boolean {
  return ctor() !== null;
}

function mapError(code: string): SttError {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "no-speech" || code === "aborted") return "empty";
  if (code === "network") return "network";
  return "error";
}

/** Начинает слушать. null — браузер не умеет. Удерживайте кнопку и вызовите `stop()` при отпускании. */
export function startListening(handlers: SttHandlers, lang = "ru-RU"): SttSession | null {
  const Recognition = ctor();
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let heard = "";
  let aborted = false;
  let failed = false;

  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i += 1) text += event.results[i]![0].transcript;
    heard = text.trim();
    handlers.onInterim?.(heard);
  };
  recognition.onerror = (event) => {
    const error = mapError(event.error);
    // «Ничего не сказали» — не ошибка, а пустой итог.
    if (error !== "empty") {
      failed = true;
      handlers.onError?.(error);
    }
  };
  recognition.onend = () => {
    if (aborted || failed) return;
    handlers.onFinal(heard);
  };

  try {
    recognition.start();
  } catch {
    handlers.onError?.("error");
    return null;
  }
  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // уже остановлено
      }
    },
    abort: () => {
      aborted = true;
      try {
        recognition.abort();
      } catch {
        // уже остановлено
      }
    },
  };
}
