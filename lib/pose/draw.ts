import { SKELETON_EDGES, type PoseFrame } from "./types";

/** Как кадр видео (по пропорциям) ложится в область, заполненную режимом object-fit: cover. */
export function coverMapping(videoAspect: number, width: number, height: number) {
  const scale = Math.max(width / videoAspect, height / 1);
  const drawW = videoAspect * scale;
  const drawH = scale;
  return { drawW, drawH, offsetX: (width - drawW) / 2, offsetY: (height - drawH) / 2 };
}

interface DrawOptions {
  color?: string;
  lineWidth?: number;
  minVisibility?: number;
}

/** Рисует скелет позы поверх видео (режим отладки, симулятор и клип). */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  width: number,
  height: number,
  { color = "#5CE1FF", lineWidth = 3, minVisibility = 0.4 }: DrawOptions = {},
): void {
  const { drawW, drawH, offsetX, offsetY } = coverMapping(frame.aspect, width, height);
  const point = (i: number) => {
    const l = frame.landmarks[i];
    return l ? { x: offsetX + l.x * drawW, y: offsetY + l.y * drawH, v: l.visibility } : null;
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  for (const [a, b] of SKELETON_EDGES) {
    const pa = point(a);
    const pb = point(b);
    if (!pa || !pb || pa.v < minVisibility || pb.v < minVisibility) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (let i = 11; i < 33; i += 1) {
    const p = point(i);
    if (!p || p.v < minVisibility) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lineWidth * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
