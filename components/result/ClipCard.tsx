"use client";

import { useEffect, useRef, useState } from "react";
import { ClipPrivacyDialog } from "@/components/result/ClipPrivacyDialog";
import { Button } from "@/components/ui/Button";
import { clipFileName } from "@/lib/clips/store";
import { downloadFile, shareClip } from "@/lib/clips/share";
import { getRepository } from "@/lib/data";
import type { ClipRow, CoachId } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { t, type MessageKey } from "@/lib/i18n";

const MOMENT_LABELS: Record<string, MessageKey> = {
  personal_record: "clip.moments.personal_record",
  knees_cave_in: "clip.moments.knees_cave_in",
  torso_lean: "clip.moments.torso_lean",
  hips_sag: "clip.moments.hips_sag",
  knee_over_toe: "clip.moments.knee_over_toe",
  last_3_reps: "clip.moments.last_3_reps",
  rep_shallow: "clip.moments.rep_shallow",
  hips_high: "clip.moments.hips_high",
  too_fast: "clip.moments.too_fast",
  idle_10s: "clip.moments.idle_10s",
  workout_complete: "clip.moments.workout_complete",
  halfway: "clip.moments.halfway",
  not_in_frame: "clip.moments.not_in_frame",
  rep_good: "clip.moments.rep_good",
};

function momentLabel(moment: string): string {
  return t(MOMENT_LABELS[moment] ?? "clip.moments.other");
}

type Action = "share" | "save";

/** Клип тренировки: предпросмотр 9:16, «Поделиться» и «Сохранить». Видео хранится только на устройстве. */
export function ClipCard({ sessionId, coachId }: { sessionId: string; coachId: CoachId }) {
  const { data } = useRepoData(
    async (repo) => {
      const [clip, profile] = await Promise.all([repo.getClip(sessionId), repo.getProfile()]);
      return { clip: clip ?? null, accepted: profile.clipPrivacyAccepted };
    },
    [sessionId],
  );
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = data?.clip ?? null;

  // Адрес для предпросмотра создаётся и освобождается вместе с эффектом, состояния не нужно.
  useEffect(() => {
    const video = videoRef.current;
    if (!clip || !video) return;
    const url = URL.createObjectURL(clip.blob);
    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [clip]);

  if (!clip) return null;

  async function run(action: Action, row: ClipRow) {
    const file = new File([row.blob], clipFileName(coachId, row.mime, row.createdAt), {
      type: row.mime.split(";")[0],
    });
    if (action === "save") {
      downloadFile(file);
      setNotice(t("clip.saved"));
      return;
    }
    const result = await shareClip(file, t("clip.shareTitle"), t("clip.shareText"));
    setNotice(result === "downloaded" ? t("clip.saved") : null);
  }

  async function onAction(action: Action) {
    if (!clip) return;
    if (!data?.accepted) {
      setPending(action);
      return;
    }
    await run(action, clip);
  }

  return (
    <section className="flex flex-col gap-3" data-testid="clip-card">
      <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
        {t("clip.title").toUpperCase()}
      </h2>
      <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-[18px] bg-ink">
        <video
          ref={videoRef}
          data-testid="clip-video"
          aria-label={t("clip.preview")}
          className="aspect-[9/16] w-full object-cover"
          controls
          playsInline
          muted
          loop
        />
      </div>
      <p className="text-center text-[13px] font-bold text-ink-2">
        {t("clip.moment", { moment: momentLabel(clip.moment) })}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button height={48} onClick={() => void onAction("share")}>
          {t("clip.share")}
        </Button>
        <Button variant="secondary" height={48} onClick={() => void onAction("save")}>
          {t("clip.save")}
        </Button>
      </div>
      <p className="text-center text-[12px] font-semibold text-muted" role="status">
        {notice ?? t("clip.onDevice")}
      </p>
      {pending ? (
        <ClipPrivacyDialog
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const action = pending;
            setPending(null);
            await getRepository().updateProfile({ clipPrivacyAccepted: true });
            await run(action, clip);
          }}
        />
      ) : null}
    </section>
  );
}
