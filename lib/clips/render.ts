import { avatarDataUrl } from "@/lib/coach/avatars";
import { getCoach } from "@/lib/coach/coaches";
import { EMOTIONS, type CoachId, type Emotion } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import { coverRect, wrapLines, type ClipSize } from "./layout";

/** Что видно в кадре клипа поверх видео. Обновляется во время тренировки. */
export interface ClipFrameState {
  coachId: CoachId;
  count: number;
  /** «из 10» / «осталось 22 с». */
  targetLabel: string | null;
  /** «Приседания · подход 1 из 3». */
  caption: string | null;
  subtitle: string | null;
  emotion: Emotion;
}

export interface ClipSources {
  video: HTMLVideoElement | null;
  /** Слой скелета позы (виден в отладке и симуляторе). */
  skeleton: HTMLCanvasElement | null;
  /** Фронтальная камера показывается зеркально — в клипе так же. */
  mirror: boolean;
}

export interface ClipAssets {
  avatars: Partial<Record<Emotion, HTMLImageElement>>;
  fontDisplay: string;
  fontText: string;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** Заранее готовит аватары всех эмоций и шрифты: в кадре ничего не должно загружаться «на лету». */
export async function loadClipAssets(coachId: CoachId): Promise<ClipAssets> {
  const entries = await Promise.all(
    EMOTIONS.map(async (e) => [e, await loadImage(avatarDataUrl(coachId, e, 256))] as const),
  );
  const avatars: ClipAssets["avatars"] = {};
  for (const [emotion, image] of entries) if (image) avatars[emotion] = image;
  return {
    avatars,
    fontDisplay: cssVar("--font-unbounded", "sans-serif"),
    fontText: cssVar("--font-manrope", "sans-serif"),
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  size: ClipSize,
  mirror: boolean,
): void {
  const crop = coverRect(srcW, srcH, size.width, size.height);
  if (crop.sw <= 0) return;
  ctx.save();
  if (mirror) {
    ctx.translate(size.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Один кадр клипа 9:16: видео с камеры, затемнение для читаемости, аватар тренера с эмоцией,
 * логотип ПИНОК, счётчик, подпись и субтитр с репликой тренера.
 */
export function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  size: ClipSize,
  state: ClipFrameState,
  sources: ClipSources,
  assets: ClipAssets,
): void {
  const { width: w, height: h } = size;
  const k = w / 720; // все размеры заданы для 720 пикселей в ширину

  // фон и видео
  ctx.fillStyle = "#0B1B3F";
  ctx.fillRect(0, 0, w, h);
  const video = sources.video;
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    drawCover(ctx, video, video.videoWidth, video.videoHeight, size, sources.mirror);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#16295E");
    gradient.addColorStop(1, "#0B1B3F");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  const skeleton = sources.skeleton;
  if (skeleton && skeleton.width > 0 && skeleton.height > 0) {
    drawCover(ctx, skeleton, skeleton.width, skeleton.height, size, sources.mirror);
  }

  // затемнение сверху и снизу
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  top.addColorStop(0, "rgba(5,12,30,0.65)");
  top.addColorStop(1, "rgba(5,12,30,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.3);
  const bottom = ctx.createLinearGradient(0, h * 0.62, 0, h);
  bottom.addColorStop(0, "rgba(5,12,30,0)");
  bottom.addColorStop(1, "rgba(5,12,30,0.72)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  // аватар тренера
  const avatar = assets.avatars[state.emotion] ?? assets.avatars.neutral;
  const ax = 36 * k;
  const ay = 44 * k;
  const ad = 116 * k;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + ad / 2, ay + ad / 2, ad / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, ax, ay, ad, ad);
    ctx.restore();
    ctx.lineWidth = 5 * k;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(ax + ad / 2, ay + ad / 2, ad / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `800 ${34 * k}px ${assets.fontText}`;
  ctx.fillText(getCoach(state.coachId).fullName, ax + ad + 20 * k, ay + ad / 2);

  // логотип ПИНОК в правом верхнем углу
  const logo = t("app.name");
  ctx.font = `800 ${34 * k}px ${assets.fontDisplay}`;
  const logoW = ctx.measureText(logo).width + 40 * k;
  const lx = w - logoW - 36 * k;
  ctx.fillStyle = "#1F5BFF";
  roundRect(ctx, lx, 52 * k, logoW, 64 * k, 18 * k);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(logo, lx + logoW / 2, 52 * k + 33 * k);

  // счётчик
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 16 * k;
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${230 * k}px ${assets.fontDisplay}`;
  ctx.fillText(String(state.count), 44 * k, 440 * k);
  ctx.shadowBlur = 0;
  if (state.targetLabel) {
    ctx.font = `800 ${46 * k}px ${assets.fontText}`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(state.targetLabel, 52 * k, 500 * k);
  }
  if (state.caption) {
    ctx.font = `700 ${36 * k}px ${assets.fontText}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(state.caption, 52 * k, 552 * k);
  }

  // субтитр с репликой тренера
  if (state.subtitle) {
    ctx.font = `800 ${52 * k}px ${assets.fontText}`;
    const maxWidth = w - 140 * k;
    const lines = wrapLines((s) => ctx.measureText(s).width, state.subtitle, maxWidth, 4);
    const lineH = 66 * k;
    const boxH = lines.length * lineH + 44 * k;
    const boxW = Math.min(
      w - 72 * k,
      Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64 * k,
    );
    const bx = (w - boxW) / 2;
    const by = h - 150 * k - boxH;
    ctx.fillStyle = "rgba(11,27,63,0.82)";
    roundRect(ctx, bx, by, boxW, boxH, 30 * k);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, w / 2, by + 22 * k + lineH * (i + 0.5)));
  }
}
