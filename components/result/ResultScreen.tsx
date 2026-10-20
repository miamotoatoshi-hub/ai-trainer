"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import { getCoach } from "@/lib/coach/coaches";
import { getRepository } from "@/lib/data";
import type { ExerciseResult } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { cleanRatio } from "@/lib/game/verdict";
import { t } from "@/lib/i18n";
import { CoachVoice } from "@/lib/speech/coachVoice";
import { formatDuration } from "@/lib/time";
import { exerciseName } from "@/lib/workout/labels";

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-row bg-surface px-4 py-3">
      <span className="text-[12px] leading-none font-extrabold tracking-[0.04em] text-muted uppercase">
        {label}
      </span>
      <span
        data-testid={testId}
        className="font-display text-[28px] leading-none font-extrabold text-ink"
      >
        {value}
      </span>
    </div>
  );
}

function resultLine(r: ExerciseResult): string {
  if (r.unit === "sec") {
    return t("result.exerciseLineSec", { done: r.clean, all: r.total });
  }
  return t("result.exerciseLine", { done: r.clean, all: r.total });
}

/** Экран результата: вердикт тренера (текст + голос), цифры и рекорды. */
export function ResultScreen({ sessionId }: { sessionId: string }) {
  const { data, loading } = useRepoData(async (repo) => {
    const session = await repo.getSession(sessionId);
    if (!session) return null;
    const [profile, coach] = await Promise.all([
      repo.getProfile(),
      repo.getUserCoach(session.coachId),
    ]);
    return { session, profile, coach };
  });
  const spokenRef = useRef(false);

  const outcome = data?.session.outcome ?? null;
  const verdictText = outcome?.verdictText ?? "";
  const verdictPhraseId = outcome?.verdictPhraseId;
  const coachId = data?.session.coachId;
  const voiceOn = data?.profile.voiceEnabled ?? false;
  const anonId = data?.profile.anonId;

  // Вердикт озвучивается один раз при первом показе результата.
  useEffect(() => {
    if (!coachId || !verdictText || spokenRef.current) return;
    spokenRef.current = true;
    let cancelled = false;
    let voice: CoachVoice | null = null;
    void (async () => {
      const repo = getRepository();
      const key = `verdictSpoken:${sessionId}`;
      if (await repo.getMeta<boolean>(key)) return;
      await repo.setMeta(key, true);
      if (cancelled || !voiceOn) return;
      voice = new CoachVoice(coachId, true, { anonId });
      voice.unlock();
      if (verdictPhraseId) await voice.prepare([verdictPhraseId]);
      voice.speak({ text: verdictText, phraseId: verdictPhraseId, kind: "phrase" });
    })();
    return () => {
      cancelled = true;
      voice?.stop();
    };
  }, [coachId, verdictText, verdictPhraseId, voiceOn, anonId, sessionId]);

  if (loading) {
    return <div className="flex-1 bg-white" role="status" aria-label={t("common.loading")} />;
  }
  if (!data || !outcome) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-white p-6">
        <p className="text-[16px] font-bold">{t("result.notFound")}</p>
        <Link href="/" className="font-extrabold text-accent">
          {t("result.done")}
        </Link>
      </main>
    );
  }

  const { session, coach } = data;
  const meta = getCoach(session.coachId);
  const ratio = cleanRatio(session.results);
  const abandoned = session.status === "abandoned";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
      <div className="flex items-center px-3 pt-[max(18px,env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label={t("common.close")}
          className="flex h-11 w-11 items-center justify-center rounded-icon bg-surface text-ink"
        >
          <Icon name="cross" size={20} strokeWidth={2.4} />
        </Link>
      </div>

      <section className="flex flex-col gap-4 px-5 pt-2 pb-4">
        <div className="flex items-end gap-3">
          <CoachAvatar coachId={session.coachId} emotion={outcome.emotion} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
              {abandoned ? t("result.abandoned") : t("result.title")}
            </h1>
            <p className="text-[14px] font-bold text-muted">{meta.fullName}</p>
          </div>
        </div>

        {verdictText ? (
          <div
            data-testid="verdict"
            className="rounded-[18px_18px_18px_6px] border border-line bg-bg-chat px-4 py-3"
          >
            <p className="text-[12px] leading-none font-extrabold tracking-[0.06em] text-muted">
              {t("result.verdict")}
            </p>
            <p className="mt-2 text-[20px] leading-snug font-extrabold text-ink">{verdictText}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label={t("result.stats.reps")}
            value={String(session.totalReps)}
            testId="stat-reps"
          />
          <Stat
            label={t("result.stats.clean")}
            value={`${Math.round(ratio * 100)}%`}
            testId="stat-clean"
          />
          <Stat
            label={t("result.stats.time")}
            value={formatDuration(session.durationSec)}
            testId="stat-time"
          />
          <Stat
            label={t("result.stats.streak")}
            value={String(session.bestStreak)}
            testId="stat-streak"
          />
        </div>

        {session.results.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
              {t("result.byExercise").toUpperCase()}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {session.results.map((r) => (
                <li
                  key={r.exerciseId}
                  className="flex items-center justify-between rounded-row border border-line px-4 py-2.5"
                >
                  <span className="text-[15px] font-extrabold">{exerciseName(r.exerciseId)}</span>
                  <span className="text-[14px] font-bold text-ink-2">{resultLine(r)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {session.personalRecords.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="records">
            <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
              {t("result.records").toUpperCase()}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {session.personalRecords.map((id) => {
                const value = session.results.find((r) => r.exerciseId === id)?.total ?? 0;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-row bg-accent-tint px-4 py-2.5 text-[15px] font-extrabold text-accent"
                  >
                    <Icon name="star" size={18} />
                    {t("result.recordLine", { exercise: exerciseName(id), value })}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="mt-auto flex flex-col gap-2 px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
        <Link href="/" className="block">
          <span className="flex h-[52px] items-center justify-center rounded-icon bg-accent text-[15px] font-extrabold text-white">
            {t("result.done")}
          </span>
        </Link>
        <Link href={`/chat/${coach.coachId}`} className="block">
          <span className="flex h-[48px] items-center justify-center rounded-icon border border-line-2 bg-surface text-[15px] font-extrabold text-ink">
            {t("result.toChat")}
          </span>
        </Link>
      </div>
    </main>
  );
}
