"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallOverlay } from "@/components/call/CallOverlay";
import { CameraBackdrop } from "@/components/call/CameraBackdrop";
import { FinishDialog } from "@/components/call/FinishDialog";
import { HealthNotice } from "@/components/call/HealthNotice";
import type { Quality } from "@/components/call/QualityBadge";
import { SetupView, type BodyParts } from "@/components/call/SetupView";
import { getCoach } from "@/lib/coach/coaches";
import { coachMood } from "@/lib/coach/mood";
import { getRepository } from "@/lib/data";
import type { Emotion, Profile, UserCoach, WorkoutSession } from "@/lib/data/types";
import { createCounter } from "@/lib/exercises";
import type { CounterEvent, ErrorCode, ExerciseCounter } from "@/lib/exercises/types";
import { t } from "@/lib/i18n";
import type { Facing } from "@/lib/pose/camera";
import { drawSkeleton } from "@/lib/pose/draw";
import { IN_FRAME_HOLD_MS, InFrameGate } from "@/lib/pose/inFrame";
import { DEFAULT_SIM_KINDS, SimPoseSource, type SimConfig } from "@/lib/pose/poseSource";
import type { RepKind } from "@/lib/pose/simulator";
import { LM, type PoseFrame } from "@/lib/pose/types";
import { usePoseSource } from "@/lib/pose/usePoseSource";
import { getPlan } from "@/lib/workout/plans";

type Stage = "loading" | "health" | "setup" | "running" | "finishing";

/** Целевое число повторений в одном подходе (этап 3: пока один подход приседаний). */
const TARGET_REPS = 10;

const SEVERE: readonly ErrorCode[] = [
  "rep_shallow",
  "knees_cave_in",
  "torso_lean",
  "hips_sag",
  "hips_high",
  "knee_over_toe",
];

function qualityOf(errors: readonly ErrorCode[]): Quality {
  if (errors.length === 0) return "good";
  return errors.some((e) => SEVERE.includes(e)) ? "bad" : "okay";
}

function eventText(code: string): string | null {
  switch (code) {
    case "rep_good":
      return t("call.eventText.rep_good");
    case "rep_shallow":
      return t("call.eventText.rep_shallow");
    case "knees_cave_in":
      return t("call.eventText.knees_cave_in");
    case "torso_lean":
      return t("call.eventText.torso_lean");
    case "too_fast":
      return t("call.eventText.too_fast");
    default:
      return null;
  }
}

function parseKinds(raw: string | null): readonly RepKind[] {
  if (!raw) return DEFAULT_SIM_KINDS;
  const allowed: RepKind[] = ["good", "shallow", "cave", "lean", "fast", "sag", "partial", "over"];
  const kinds = raw.split(",").filter((k): k is RepKind => (allowed as string[]).includes(k));
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

export function CallScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const speed = Number(params.get("speed") ?? "1") || 1;
  const simRequested = params.get("sim") === "1";
  const debugParam = params.get("debug") === "1";
  const kinds = params.get("kinds");

  const [data, setData] = useState<LoadedData | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [facing, setFacing] = useState<Facing>("user");
  const [attempt, setAttempt] = useState(0);
  const [simFallback, setSimFallback] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [paused, setPaused] = useState(false);

  // что видно на экране настройки
  const [parts, setParts] = useState<BodyParts>(NO_PARTS);
  const [heldMs, setHeldMs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [grumble, setGrumble] = useState<string | null>(null);

  // что видно во время тренировки
  const [count, setCount] = useState(0);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [debugLine, setDebugLine] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gateRef = useRef(new InFrameGate());
  const counterRef = useRef<ExerciseCounter | null>(null);
  const stageRef = useRef<Stage>("loading");
  const pausedRef = useRef(false);
  const timeRef = useRef({ startedAt: 0, pausedAt: 0, pausedTotal: 0 });
  const lostSinceRef = useRef<number | null>(null);
  const lastGrumbleRef = useRef(0);
  const partsRef = useRef<BodyParts>(NO_PARTS);
  const lastSetupUiRef = useRef(0);
  const subtitleTimer = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const simConfig: SimConfig | null = useMemo(
    () => (simRequested || simFallback ? { speed, kinds: parseKinds(kinds), view: "front" } : null),
    [simRequested, simFallback, speed, kinds],
  );

  const cameraOn = stage === "setup" || stage === "running";
  const cam = usePoseSource({ enabled: cameraOn, sim: simConfig, facing, videoRef, attempt });
  const source = cam.source;

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // --- загрузка тренировки ---
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repo = getRepository();
      const session = await repo.getSession(sessionId);
      if (cancelled) return;
      if (!session) {
        router.replace("/");
        return;
      }
      const [profile, coach] = await Promise.all([
        repo.getProfile(),
        repo.getUserCoach(session.coachId),
      ]);
      if (cancelled) return;
      setData({ session, profile, coach });
      setEmotion(coachMood(coach));
      setStage(profile.safetyAccepted ? "setup" : "health");
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  const showSubtitle = useCallback((text: string | null, ms = 3200) => {
    if (subtitleTimer.current !== null) window.clearTimeout(subtitleTimer.current);
    setSubtitle(text);
    if (text) subtitleTimer.current = window.setTimeout(() => setSubtitle(null), ms);
  }, []);

  useEffect(
    () => () => {
      if (subtitleTimer.current !== null) window.clearTimeout(subtitleTimer.current);
    },
    [],
  );

  const debug = (data?.profile.debug ?? false) || debugParam;
  const showSkeleton = debug || cam.source?.kind === "sim";

  // --- завершение ---
  const finish = useCallback(
    async (status: "done" | "abandoned") => {
      if (finishedRef.current || !data) return;
      finishedRef.current = true;
      setStage("finishing");
      const counter = counterRef.current;
      const snap = counter?.snapshot();
      const now = Date.now();
      const session: WorkoutSession = {
        ...data.session,
        status,
        endedAt: now,
        totalReps: snap?.total ?? 0,
        cleanReps: snap?.clean ?? 0,
        shallowReps: snap?.shallow ?? 0,
        bestStreak: snap?.bestStreak ?? 0,
        durationSec: Math.round((now - data.session.startedAt) / 1000),
        results: snap
          ? [
              {
                exerciseId: snap.exerciseId,
                unit: snap.unit,
                total: snap.total,
                clean: snap.clean,
                shallow: snap.shallow,
                bestStreak: snap.bestStreak,
                errors: snap.errors,
              },
            ]
          : [],
      };
      await getRepository().putSession(session);
      router.replace(`/result/${session.id}`);
    },
    [data, router],
  );

  // --- начало подхода ---
  const begin = useCallback(() => {
    if (!source) return;
    counterRef.current = createCounter("squat");
    source.setExercise("squat");
    timeRef.current = { startedAt: source.now(), pausedAt: 0, pausedTotal: 0 };
    setCount(0);
    setQuality(null);
    setCountdown(null);
    showSubtitle(t("call.eventText.set_start"));
    setStage("running");
  }, [source, showSubtitle]);

  useEffect(() => {
    if (countdown === null) return;
    const id = window.setTimeout(
      () => {
        if (countdown > 1) setCountdown(countdown - 1);
        else begin();
      },
      1000 / (simConfig ? Math.min(speed, 4) : 1),
    );
    return () => window.clearTimeout(id);
  }, [countdown, begin, simConfig, speed]);

  // --- обработка событий счётчика ---
  const handleEvents = useCallback(
    (events: CounterEvent[], counter: ExerciseCounter) => {
      let changed = false;
      for (const e of events) {
        if (e.type === "rep") {
          changed = true;
          setQuality(qualityOf(e.errors));
          if (e.clean) {
            setEmotion("neutral");
            showSubtitle(eventText("rep_good"), 1500);
          }
        } else if (e.type === "shallow") {
          changed = true;
          setQuality("bad");
          setEmotion("angry");
          showSubtitle(eventText("rep_shallow"));
        } else if (e.type === "error") {
          setQuality(qualityOf([e.code]));
          setEmotion("angry");
          const text = eventText(e.code);
          if (text) showSubtitle(text);
        }
      }
      if (changed) {
        const snap = counter.snapshot();
        setCount(snap.total);
        if (snap.total >= TARGET_REPS) void finish("done");
      }
    },
    [finish, showSubtitle],
  );

  // --- основной цикл: кадры позы ---
  useEffect(() => {
    if (!source || (stage !== "setup" && stage !== "running")) return;
    const gate = gateRef.current;
    gate.reset();
    let raf = 0;
    let lastElapsed = 0;

    const onSetupFrame = (frame: PoseFrame | null, nowMs: number) => {
      const state = gate.update(frame);
      if (frame && stageRef.current === "setup") {
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
      } else if (!frame && (partsRef.current.hips || partsRef.current.ankles)) {
        partsRef.current = NO_PARTS;
        setParts(NO_PARTS);
      }
      if (nowMs - lastSetupUiRef.current > 100) {
        lastSetupUiRef.current = nowMs;
        setHeldMs(state.heldMs);
      }
      if (state.inFrame) {
        lostSinceRef.current = null;
        setGrumble(null);
      } else {
        lostSinceRef.current ??= nowMs;
        if (nowMs - lostSinceRef.current > 3000 && nowMs - lastGrumbleRef.current > 8000) {
          lastGrumbleRef.current = nowMs;
          setGrumble(t("call.eventText.not_in_frame"));
        }
      }
      if (state.ready) setCountdown((c) => (c === null ? 3 : c));
    };

    const tick = () => {
      const polled = source.poll();
      if (polled) {
        const nowMs = source.now();
        const frame = polled.frame;
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (frame && showSkeleton) drawSkeleton(ctx, frame, canvas.width, canvas.height);
          }
        }
        if (stageRef.current === "setup") {
          onSetupFrame(frame, nowMs);
        } else if (stageRef.current === "running" && !pausedRef.current) {
          const counter = counterRef.current;
          if (counter && frame) {
            handleEvents(counter.update(frame), counter);
            if (debug) {
              const snap = counter.snapshot();
              setDebugLine(
                `${snap.phase} · ${t("call.overlay.debugAngle")} ${snap.measure === null ? "—" : Math.round(snap.measure)}°`,
              );
            }
          }
          const time = timeRef.current;
          const elapsed = nowMs - time.startedAt - time.pausedTotal;
          if (elapsed - lastElapsed >= 250) {
            lastElapsed = elapsed;
            setElapsedMs(elapsed);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, stage, handleEvents, showSkeleton, debug]);

  // --- пауза ---
  const pause = useCallback(() => {
    if (!source) return;
    timeRef.current.pausedAt = source.now();
    if (source instanceof SimPoseSource) source.pause();
    setPaused(true);
  }, [source]);

  const resume = useCallback(() => {
    if (!source) return;
    if (source instanceof SimPoseSource) source.resume();
    // «часы» симулятора не идут на паузе, поэтому разницу не добавляем
    if (!(source instanceof SimPoseSource)) {
      timeRef.current.pausedTotal += source.now() - timeRef.current.pausedAt;
    }
    setPaused(false);
  }, [source]);

  const closeScreen = useCallback(() => router.replace("/"), [router]);

  const acceptHealth = useCallback(async () => {
    await getRepository().updateProfile({ safetyAccepted: true });
    setStage("setup");
  }, []);

  if (!data || stage === "loading" || stage === "finishing") {
    return (
      <div className="flex flex-1 items-center justify-center bg-ink text-white" role="status">
        <p className="text-[16px] font-bold">{t("call.loadingSession")}</p>
      </div>
    );
  }

  if (stage === "health") {
    return <HealthNotice onAccept={acceptHealth} onClose={closeScreen} />;
  }

  const plan = getPlan(data.session.planId);
  void plan;

  return (
    <div className="relative flex-1 overflow-hidden bg-ink" data-stage={stage}>
      <CameraBackdrop
        videoRef={videoRef}
        canvasRef={canvasRef}
        mirror={facing === "user"}
        simMode={cam.source?.kind === "sim"}
      />

      {stage === "setup" ? (
        <SetupView
          status={cam.status}
          error={cam.error}
          parts={parts}
          heldMs={heldMs}
          holdTargetMs={IN_FRAME_HOLD_MS}
          countdown={countdown}
          grumble={grumble}
          exerciseHint={t("exercises.squat.hint")}
          onRetry={() => setAttempt((a) => a + 1)}
          onFlip={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          onSim={() => setSimFallback(true)}
          onClose={closeScreen}
        />
      ) : (
        <>
          <CallOverlay
            coachId={data.session.coachId}
            emotion={emotion}
            elapsedMs={elapsedMs}
            count={count}
            target={TARGET_REPS}
            caption={getCoach(data.session.coachId).fullName}
            quality={quality}
            subtitle={subtitle}
            paused={paused}
            restLeftSec={null}
            simMode={cam.source?.kind === "sim"}
            debugLine={debug ? debugLine : null}
            onPause={pause}
            onResume={resume}
            onFinish={() => {
              pause();
              setConfirmFinish(true);
            }}
            onTalk={() => {}}
          />
          {confirmFinish ? (
            <FinishDialog
              onConfirm={() => {
                setConfirmFinish(false);
                void finish("abandoned");
              }}
              onCancel={() => {
                setConfirmFinish(false);
                resume();
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
