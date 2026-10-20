"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallOverlay } from "@/components/call/CallOverlay";
import { CameraBackdrop } from "@/components/call/CameraBackdrop";
import { FinishDialog } from "@/components/call/FinishDialog";
import { HealthNotice } from "@/components/call/HealthNotice";
import { SetupView, type BodyParts } from "@/components/call/SetupView";
import { useWorkoutSession, type WorkoutEnd } from "@/components/call/useWorkoutSession";
import { getRepository } from "@/lib/data";
import type { Profile, UserCoach, WorkoutSession } from "@/lib/data/types";
import { finishWorkout } from "@/lib/game/finishWorkout";
import { t } from "@/lib/i18n";
import type { Facing } from "@/lib/pose/camera";
import { drawSkeleton } from "@/lib/pose/draw";
import { IN_FRAME_HOLD_MS, InFrameGate } from "@/lib/pose/inFrame";
import { DEFAULT_SIM_KINDS, type SimConfig } from "@/lib/pose/poseSource";
import type { RepKind } from "@/lib/pose/simulator";
import { LM, type PoseFrame } from "@/lib/pose/types";
import { usePoseSource } from "@/lib/pose/usePoseSource";
import { stepLabels } from "@/lib/workout/labels";
import { PLANS, getPlan, planExercises } from "@/lib/workout/plans";

type Stage = "health" | "setup" | "running" | "finishing";

const REP_KINDS: readonly RepKind[] = [
  "good",
  "shallow",
  "cave",
  "lean",
  "fast",
  "sag",
  "partial",
  "over",
];

function parseKinds(raw: string | null): readonly RepKind[] {
  if (!raw) return DEFAULT_SIM_KINDS;
  const kinds = raw
    .split(",")
    .filter((k): k is RepKind => (REP_KINDS as readonly string[]).includes(k));
  return kinds.length > 0 ? kinds : DEFAULT_SIM_KINDS;
}

function visiblePart(frame: PoseFrame, a: number, b: number): boolean {
  return (
    (frame.landmarks[a]?.visibility ?? 0) >= 0.6 && (frame.landmarks[b]?.visibility ?? 0) >= 0.6
  );
}

const NO_PARTS: BodyParts = { shoulders: false, hips: false, knees: false, ankles: false };

interface LoadedData {
  session: WorkoutSession;
  profile: Profile;
  coach: UserCoach;
}

/** Загружает тренировку, профиль и тренера, затем показывает сам звонок. */
export function CallScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const planParam = useSearchParams().get("plan");
  const [data, setData] = useState<LoadedData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repo = getRepository();
      let session = await repo.getSession(sessionId);
      if (cancelled) return;
      if (!session) {
        router.replace("/");
        return;
      }
      // ?plan=quick-check — выбрать другой план для этой тренировки (короткая проверка, демо).
      if (
        planParam &&
        PLANS[planParam] &&
        session.status === "active" &&
        session.planId !== planParam
      ) {
        session = { ...session, planId: planParam };
        await repo.putSession(session);
      }
      const [profile, coach] = await Promise.all([
        repo.getProfile(),
        repo.getUserCoach(session.coachId),
      ]);
      if (!cancelled) setData({ session, profile, coach });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router, planParam]);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-ink text-white" role="status">
        <p className="text-[16px] font-bold">{t("call.loadingSession")}</p>
      </div>
    );
  }
  return <CallSession {...data} />;
}

function CallSession({ session, profile, coach }: LoadedData) {
  const router = useRouter();
  const params = useSearchParams();
  const speed = Number(params.get("speed") ?? "1") || 1;
  const simRequested = params.get("sim") === "1";
  const debugParam = params.get("debug") === "1";
  const kindsParam = params.get("kinds");
  const plan = getPlan(session.planId);

  const [stage, setStage] = useState<Stage>(profile.safetyAccepted ? "setup" : "health");
  const [facing, setFacing] = useState<Facing>("user");
  const [attempt, setAttempt] = useState(0);
  const [simFallback, setSimFallback] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const [parts, setParts] = useState<BodyParts>(NO_PARTS);
  const [heldMs, setHeldMs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [debugLine, setDebugLine] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gateRef = useRef(new InFrameGate());
  const stageRef = useRef<Stage>(stage);
  const partsRef = useRef<BodyParts>(NO_PARTS);
  const lostSinceRef = useRef<number | null>(null);
  const lastSetupUiRef = useRef(0);
  const finishedRef = useRef(false);

  const simConfig: SimConfig | null = useMemo(
    () =>
      simRequested || simFallback ? { speed, kinds: parseKinds(kindsParam), view: "front" } : null,
    [simRequested, simFallback, speed, kindsParam],
  );

  const cam = usePoseSource({
    enabled: stage === "setup" || stage === "running",
    sim: simConfig,
    facing,
    videoRef,
    attempt,
  });
  const source = cam.source;

  const onEnd = useCallback(
    async (end: WorkoutEnd) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setStage("finishing");
      const finished = await finishWorkout(getRepository(), {
        session,
        ...end,
        now: Date.now(),
      });
      router.replace(`/result/${finished.id}`);
    },
    [session, router],
  );

  const workout = useWorkoutSession({
    session,
    profile,
    coach,
    coachId: session.coachId,
    source,
    onEnd,
  });
  const { ui } = workout;

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const debug = profile.debug || debugParam;
  const simMode = source?.kind === "sim";
  const showSkeleton = debug || simMode;

  // --- обратный отсчёт и старт ---
  const begin = workout.begin;
  useEffect(() => {
    if (countdown === null) return;
    const id = window.setTimeout(
      () => {
        if (countdown > 1) {
          setCountdown(countdown - 1);
        } else {
          setCountdown(null);
          begin();
          setStage("running");
        }
      },
      1000 / (simMode ? Math.min(speed, 4) : 1),
    );
    return () => window.clearTimeout(id);
  }, [countdown, begin, simMode, speed]);

  // --- основной цикл: кадры позы ---
  const onFrame = workout.onFrame;
  const sayEvent = workout.sayEvent;
  const debugSnapshot = workout.debugSnapshot;
  useEffect(() => {
    if (!source || (stage !== "setup" && stage !== "running")) return;
    const gate = gateRef.current;
    gate.reset();
    let raf = 0;

    const onSetupFrame = (frame: PoseFrame | null, nowMs: number) => {
      const state = gate.update(frame);
      if (frame) {
        const next: BodyParts = {
          shoulders: visiblePart(frame, LM.L_SHOULDER, LM.R_SHOULDER),
          hips: visiblePart(frame, LM.L_HIP, LM.R_HIP),
          knees: visiblePart(frame, LM.L_KNEE, LM.R_KNEE),
          ankles: visiblePart(frame, LM.L_ANKLE, LM.R_ANKLE),
        };
        const prev = partsRef.current;
        if (
          next.shoulders !== prev.shoulders ||
          next.hips !== prev.hips ||
          next.knees !== prev.knees ||
          next.ankles !== prev.ankles
        ) {
          partsRef.current = next;
          setParts(next);
        }
      } else if (Object.values(partsRef.current).some(Boolean)) {
        partsRef.current = NO_PARTS;
        setParts(NO_PARTS);
      }
      if (nowMs - lastSetupUiRef.current > 100) {
        lastSetupUiRef.current = nowMs;
        setHeldMs(state.heldMs);
      }
      if (state.inFrame) {
        lostSinceRef.current = null;
      } else {
        lostSinceRef.current ??= nowMs;
        // Человека не видно дольше 3 секунд — тренер ворчит (кулдаун внутри выбора фраз).
        if (nowMs - lostSinceRef.current > 3000) sayEvent("not_in_frame", nowMs);
      }
      if (state.ready) setCountdown((c) => (c === null ? 3 : c));
    };

    const tick = () => {
      const polled = source.poll();
      if (polled) {
        const nowMs = source.now();
        const frame = polled.frame;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (frame && showSkeleton) drawSkeleton(ctx, frame, canvas.width, canvas.height);
        }
        if (stageRef.current === "setup") {
          onSetupFrame(frame, nowMs);
        } else if (stageRef.current === "running") {
          onFrame(frame, nowMs);
          if (debug) {
            const snap = debugSnapshot();
            const line = snap
              ? `${snap.phase} · ${t("call.overlay.debugAngle")} ${snap.measure === null ? "—" : Math.round(snap.measure * 100) / 100}`
              : null;
            setDebugLine((prev) => (prev === line ? prev : line));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, stage, onFrame, sayEvent, debugSnapshot, showSkeleton, debug]);

  const closeScreen = useCallback(() => router.replace("/"), [router]);

  const acceptHealth = useCallback(async () => {
    await getRepository().updateProfile({ safetyAccepted: true });
    setStage("setup");
  }, []);

  if (stage === "health") {
    return <HealthNotice onAccept={acceptHealth} onClose={closeScreen} />;
  }

  if (stage === "finishing") {
    return (
      <div className="flex flex-1 items-center justify-center bg-ink text-white" role="status">
        <p className="text-[16px] font-bold">{t("call.loadingSession")}</p>
      </div>
    );
  }

  const labels = ui.view ? stepLabels(ui.view) : null;
  const resting = ui.view?.phase === "rest";

  return (
    <div className="relative flex-1 overflow-hidden bg-ink" data-stage={stage}>
      <CameraBackdrop
        videoRef={videoRef}
        canvasRef={canvasRef}
        mirror={facing === "user"}
        simMode={simMode}
      />

      {stage === "setup" ? (
        <SetupView
          status={cam.status}
          error={cam.error}
          parts={parts}
          heldMs={heldMs}
          holdTargetMs={IN_FRAME_HOLD_MS}
          countdown={countdown}
          grumble={ui.subtitle}
          exerciseHint={t(`exercises.${planExercises(plan)[0] ?? "squat"}.hint`)}
          onRetry={() => setAttempt((a) => a + 1)}
          onFlip={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          onSim={() => setSimFallback(true)}
          onClose={closeScreen}
        />
      ) : (
        <>
          <CallOverlay
            coachId={session.coachId}
            emotion={ui.emotion}
            elapsedMs={ui.elapsedMs}
            count={ui.view?.count ?? 0}
            targetLabel={labels?.targetLabel ?? null}
            caption={labels?.caption ?? null}
            quality={ui.quality}
            subtitle={ui.subtitle}
            paused={ui.paused}
            restLeftSec={resting ? (ui.view?.restLeftSec ?? 0) : null}
            restNext={labels?.restNext ?? null}
            restHint={labels?.restHint ?? null}
            simMode={simMode}
            debugLine={debug ? debugLine : null}
            onPause={workout.pause}
            onResume={workout.resume}
            onFinish={() => {
              workout.pause();
              setConfirmFinish(true);
            }}
            onTalk={() => {}}
            onSkipRest={workout.skipRest}
          />
          {confirmFinish ? (
            <FinishDialog
              onConfirm={() => {
                setConfirmFinish(false);
                workout.resume();
                workout.abandon();
              }}
              onCancel={() => {
                setConfirmFinish(false);
                workout.resume();
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
