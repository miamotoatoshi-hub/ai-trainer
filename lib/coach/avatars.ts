import { avatarSpec as gromov } from "@/content/coaches/gromov/avatar";
import { avatarSpec as marina } from "@/content/coaches/marina/avatar";
import { avatarSpec as max } from "@/content/coaches/max/avatar";
import { avatarSpec as palych } from "@/content/coaches/palych/avatar";
import type { CoachId, Emotion } from "@/lib/data/types";
import { buildAvatarMarkup, type AvatarSpec } from "./face";

const SPECS: Record<CoachId, AvatarSpec> = { gromov, marina, palych, max };

/** Внутренности SVG (без внешнего тега) для вставки в готовый <svg viewBox="0 0 100 100">. */
export function avatarInnerMarkup(coachId: CoachId, emotion: Emotion): string {
  return buildAvatarMarkup(SPECS[coachId], emotion);
}

/** Полная строка SVG — нужна и для React, и для рисования на canvas (клипы). */
export function avatarSvgString(coachId: CoachId, emotion: Emotion, size = 100): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    avatarInnerMarkup(coachId, emotion) +
    `</svg>`
  );
}

export function avatarDataUrl(coachId: CoachId, emotion: Emotion, size = 256): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvgString(coachId, emotion, size))}`;
}

export function avatarBackground(coachId: CoachId): string {
  return SPECS[coachId].background;
}
