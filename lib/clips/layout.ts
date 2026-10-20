/** Чистые расчёты для клипа: размеры, обрезка кадра под 9:16, перенос строк, формат файла. */

export interface ClipSize {
  width: number;
  height: number;
  /** Кадров в секунду при отрисовке. */
  fps: number;
  /** Битрейт видео, бит/с. */
  bitrate: number;
}

const HD: ClipSize = { width: 720, height: 1280, fps: 24, bitrate: 4_000_000 };
const FULL_HD: ClipSize = { width: 1080, height: 1920, fps: 30, bitrate: 8_000_000 };

/**
 * Формат 9:16. Полные 1080×1920 — только если устройство явно мощное (много ядер и памяти),
 * иначе 720×1280: запись идёт прямо во время тренировки и не должна тормозить счёт повторений.
 */
export function clipSizeFor(device: { cores?: number; memoryGb?: number }): ClipSize {
  const strong = (device.cores ?? 0) >= 8 && (device.memoryGb ?? 0) >= 6;
  return strong ? FULL_HD : HD;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Какую часть исходного кадра взять, чтобы заполнить прямоугольник без искажений (как object-fit: cover). */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): CropRect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/**
 * Разбивает текст на строки не шире maxWidth (ширину измеряет `measure`). Если строк больше
 * maxLines, последняя обрезается многоточием.
 */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Предпочтительные форматы: сначала mp4 (открывается везде, в том числе в TikTok и Telegram), затем webm. */
export const MIME_CANDIDATES: readonly string[] = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMimeType(isSupported: (mime: string) => boolean): string | null {
  return MIME_CANDIDATES.find((mime) => isSupported(mime)) ?? null;
}

/** Расширение файла по типу записи. */
export function extensionFor(mime: string): "mp4" | "webm" {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}
