import type { Repository } from "@/lib/data/repository";
import { extensionFor } from "./layout";
import type { ClipResult } from "./recorder";

/** Хранится только последние клипы: видео занимают место на устройстве. */
export const KEEP_CLIPS = 5;

export async function pruneClips(repo: Repository, keep: number = KEEP_CLIPS): Promise<number> {
  const all = (await repo.listClipMeta()).sort((a, b) => b.createdAt - a.createdAt);
  const extra = all.slice(keep);
  for (const clip of extra) await repo.deleteClip(clip.sessionId);
  return extra.length;
}

/** Кладёт клип тренировки в хранилище устройства. */
export async function saveClip(
  repo: Repository,
  sessionId: string,
  clip: ClipResult,
  now: number,
): Promise<void> {
  await repo.putClip({
    sessionId,
    blob: clip.blob,
    mime: clip.mime,
    durationSec: Math.round(clip.durationSec),
    moment: clip.moment,
    createdAt: now,
  });
  await pruneClips(repo);
}

/** Имя файла: pinok-gromov-2026-10-20.mp4 */
export function clipFileName(coachId: string, mime: string, at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `pinok-${coachId}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${extensionFor(mime)}`;
}
