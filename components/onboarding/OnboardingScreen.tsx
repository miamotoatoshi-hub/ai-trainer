"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Anketa } from "@/components/onboarding/Anketa";
import { Button } from "@/components/ui/Button";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import { getCoach } from "@/lib/coach/coaches";
import { getRepository } from "@/lib/data";
import type { Profile } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import type { Draft } from "@/lib/onboarding/anketa";
import {
  finishOnboarding,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding/finish";
import { CoachVoice } from "@/lib/speech/coachVoice";
import { startWorkoutSession } from "@/lib/workout/startSession";

const SCREEN =
  "flex min-h-0 flex-1 flex-col bg-white px-6 pt-[max(40px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]";

/** «Первая встреча»: приветствие → 13+ и здоровье → 10 приседаний → анкета-переписка. */
export function OnboardingScreen() {
  const router = useRouter();
  const after = useSearchParams().get("after");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [tooYoung, setTooYoung] = useState(false);
  const [adult13, setAdult13] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<string[]>([]);
  const voiceRef = useRef<CoachVoice | null>(null);

  const update = useCallback(async (next: OnboardingState) => {
    setState(next);
    await saveOnboardingState(getRepository(), next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repo = getRepository();
      const [p, saved] = await Promise.all([repo.getProfile(), loadOnboardingState(repo)]);
      if (cancelled) return;
      if (p.onboardingDone) {
        router.replace("/");
        return;
      }
      setProfile(p);
      // Вернулись из звонка с приседаниями — продолжаем анкетой.
      if (after && saved.step !== "chat") {
        const next: OnboardingState = { ...saved, step: "chat", sessionId: after };
        await saveOnboardingState(repo, next);
        if (!cancelled) setState(next);
        return;
      }
      setState(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [after, router]);

  // Реплики Громова перед анкетой: вердикт за приседания или «без камеры».
  const sessionId = state?.sessionId;
  const skipped = state?.skippedCamera;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (state?.step !== "chat") return;
      const lines: string[] = [];
      if (sessionId) {
        const session = await getRepository().getSession(sessionId);
        if (session?.outcome && session.status === "done") {
          lines.push(session.outcome.verdictText);
          lines.push(
            t("onboarding.afterWorkout", {
              reps: session.totalReps,
              clean: session.totalReps
                ? Math.round((session.cleanReps / session.totalReps) * 100)
                : 0,
            }),
          );
        }
      }
      if (skipped) lines.push(t("onboarding.camera.skipReply"));
      if (!cancelled) setVerdict(lines);
    })();
    return () => {
      cancelled = true;
    };
  }, [state?.step, sessionId, skipped]);

  const speak = useCallback(
    (text: string) => {
      if (!profile) return;
      voiceRef.current ??= new CoachVoice("gromov", true, { anonId: profile.anonId });
      voiceRef.current.unlock();
      voiceRef.current.speak({ text, kind: "phrase" });
    },
    [profile],
  );
  useEffect(() => () => voiceRef.current?.stop(), []);

  if (!state || !profile) {
    return <div className="flex-1 bg-white" role="status" aria-label={t("common.loading")} />;
  }

  // --- 1. приветствие ---
  if (state.step === "hello") {
    const meta = getCoach("gromov");
    return (
      <main className={SCREEN} data-testid="onboarding-hello">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <CoachAvatar coachId="gromov" emotion="contempt" size={160} />
          <div>
            <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
              {meta.fullName}
            </h1>
            <p className="mt-1 text-[14px] font-bold text-muted">{meta.tagline}</p>
          </div>
          <div className="rounded-[18px_18px_18px_6px] border border-line bg-bg-chat px-4 py-3 text-left">
            <p className="text-[17px] leading-snug font-bold">{t("onboarding.hello.greet1")}</p>
            <p className="mt-1 text-[17px] leading-snug font-bold">
              {t("onboarding.hello.greet2")}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            height={52}
            onClick={() => {
              speak(`${t("onboarding.hello.greet1")} ${t("onboarding.hello.greet2")}`);
              void update({ ...state, step: "gate" });
            }}
          >
            {t("onboarding.hello.start")}
          </Button>
          <Link
            href="/?demo=1"
            className="flex h-11 items-center justify-center text-[15px] font-extrabold text-accent"
          >
            {t("onboarding.hello.demo")}
          </Link>
        </div>
      </main>
    );
  }

  // --- 2. 13+ и здоровье ---
  if (state.step === "gate") {
    if (tooYoung) {
      return (
        <main className={SCREEN} data-testid="onboarding-too-young">
          <div className="flex flex-1 flex-col justify-center gap-4">
            <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
              {t("onboarding.gate.tooYoungTitle")}
            </h1>
            <p className="text-[17px] leading-snug font-bold text-ink-2">
              {t("onboarding.gate.tooYoungBody")}
            </p>
          </div>
          <Button variant="secondary" fullWidth height={52} onClick={() => setTooYoung(false)}>
            {t("onboarding.gate.back")}
          </Button>
        </main>
      );
    }
    return (
      <main className={SCREEN} data-testid="onboarding-gate">
        <div className="flex flex-1 flex-col justify-center gap-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-icon bg-accent-tint text-accent">
            <Icon name="shield" size={28} />
          </span>
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
            {t("onboarding.gate.title")}
          </h1>
          <label className="flex min-h-12 items-center gap-3 rounded-row border border-line-2 px-4 py-2 text-[17px] font-extrabold">
            <input
              type="checkbox"
              checked={adult13}
              onChange={(e) => setAdult13(e.target.checked)}
              className="h-6 w-6 accent-[var(--accent)]"
            />
            {t("onboarding.gate.ageCheck")}
          </label>
          <ul className="flex flex-col gap-2 text-[16px] leading-snug font-bold text-ink-2">
            <li>{t("call.health.line1")}</li>
            <li>{t("call.health.line2")}</li>
            <li>{t("call.health.line3")}</li>
          </ul>
          <p className="rounded-row bg-surface px-4 py-3 text-[14px] leading-snug font-semibold text-ink-2">
            {t("call.health.videoNote")}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Button
            fullWidth
            height={52}
            disabled={!adult13}
            onClick={async () => {
              await getRepository().updateProfile({ ageConfirmed13: true, safetyAccepted: true });
              await update({ ...state, step: "camera" });
            }}
          >
            {t("onboarding.gate.accept")}
          </Button>
          <button
            type="button"
            onClick={() => setTooYoung(true)}
            className="flex h-11 items-center justify-center text-[15px] font-extrabold text-muted"
          >
            {t("onboarding.gate.tooYoung")}
          </button>
        </div>
      </main>
    );
  }

  // --- 3. приседания перед камерой ---
  if (state.step === "camera") {
    return (
      <main className={SCREEN} data-testid="onboarding-camera">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <CoachAvatar coachId="gromov" emotion="angry" size={120} />
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
            {t("onboarding.camera.title")}
          </h1>
          <p className="text-[17px] leading-snug font-bold text-ink-2">
            {t("onboarding.camera.body")}
          </p>
          <p className="flex items-start gap-3 rounded-row bg-surface px-4 py-3 text-left text-[14px] leading-snug font-semibold text-ink-2">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-accent" />
            {t("onboarding.camera.privacy")}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Button
            fullWidth
            height={52}
            icon="video"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const id = await startWorkoutSession(getRepository(), {
                  coachId: "gromov",
                  planId: "first-squats",
                  mode: "onboarding",
                });
                await update({ ...state, sessionId: id });
                router.push(`/call/${id}`);
              } catch {
                setBusy(false);
              }
            }}
          >
            {t("onboarding.camera.enable")}
          </Button>
          <button
            type="button"
            onClick={() => void update({ ...state, step: "chat", skippedCamera: true })}
            className="flex h-11 items-center justify-center text-[15px] font-extrabold text-muted"
          >
            {t("onboarding.camera.skip")}
          </button>
        </div>
      </main>
    );
  }

  // --- 4. анкета-переписка ---
  return (
    <Anketa
      draft={state.draft}
      intro={verdict}
      finishing={busy}
      onChange={(draft: Draft) => void update({ ...state, draft })}
      onFinish={async () => {
        setBusy(true);
        try {
          await finishOnboarding(getRepository(), state.draft, {
            sessionId: state.sessionId,
            now: Date.now(),
          });
          // Если человек пришёл по ссылке друга, возвращаем его к ней.
          const repo = getRepository();
          const back = await repo.getMeta<string>("afterOnboarding");
          await repo.setMeta("afterOnboarding", undefined);
          router.replace(back && back.startsWith("/join") ? back : "/");
        } catch {
          setBusy(false);
        }
      }}
    />
  );
}
