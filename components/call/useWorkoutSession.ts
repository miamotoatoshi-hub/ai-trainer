"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coachMood } from "@/lib/coach/mood";
import { allPhrases, type PhraseEvent } from "@/lib/coach/phrases";
import { countPhraseId, PRERECORDED_COUNT_MAX } from "@/lib/coach/voiceConfig";
import { getRepository } from "@/lib/data";
import type {
  CoachId,
  Emotion,
  ExerciseId,
  ExerciseResult,
  Profile,
  UserCoach,
  WorkoutSession,
} from "@/lib/data/types";
import type { PoseFrame } from "@/lib/pose/types";
import type { PoseSource } from "@/lib/pose/poseSource";
import { CoachVoice } from "@/lib/speech/coachVoice";
import { CoachDirector, type DirectorOutput, type Quality } from "@/lib/workout/director";
import { getPlan } from "@/lib/workout/plans";
import { WorkoutRunner, type RunnerEvent, type RunnerView } from "@/lib/workout/runner";

export interface WorkoutEnd {
  status: "done" | "abandoned";
  results: ExerciseResult[];
  bestSets: Partial<Record<ExerciseId, number>>;
  recordsBeaten: ExerciseId[];
  /** Сколько секунд длилась сама тренировка (без пауз и настройки камеры). */
  durationSec: number;
}

interface Args {
  session: WorkoutSession;
  profile: Profile;
  coach: UserCoach;
  coachId: CoachId;
  source: PoseSource | null;
  /** Момент для клипа: «смешной вес» и подпись события. */
  onMoment?: (weight: number, label: string, subtitle: string | null) => void;
  /** Подпись/эмоция изменились — для кадра клипа. */
  onSubtitle?: (text: string | null) => void;
  onEnd: (end: WorkoutEnd) => void;
}

export interface WorkoutUi {
  started: boolean;
  view: RunnerView | null;
  subtitle: string | null;
  emotion: Emotion;
  quality: Quality | null;
  elapsedMs: number;
  paused: boolean;
}

const EMOTION_HOLD_MS = 2600;
const VIEW_REFRESH_MS = 250;
/** Пауза перед переходом на экран результата: дать договорить финальную фразу. */
const OUTRO_MS = 2200;

/**
 * Ведёт тренировку на экране звонка: раннер по плану, «режиссёр» (что сказать тренеру),
 * голос и субтитры. Кадры позы подаёт экран через `onFrame`.
 */
export function useWorkoutSession({
  session,
  profile,
  coach,
  coachId,
  source,
  onMoment,
  onSubtitle,
  onEnd,
}: Args) {
  const baseMood = coachMood(coach);
  const [ui, setUi] = useState<WorkoutUi>({
    started: false,
    view: null,
    subtitle: null,
    emotion: baseMood,
    quality: null,
    elapsedMs: 0,
    paused: false,
  });

  const runnerRef = useRef<WorkoutRunner | null>(null);
  const directorRef = useRef<CoachDirector | null>(null);
  const voiceRef = useRef<CoachVoice | null>(null);
  const recordsRef = useRef<Partial<Record<ExerciseId, number>>>({});
  const subtitleTimer = useRef<number | null>(null);
  const emotionTimer = useRef<number | null>(null);
  const lastViewAt = useRef(0);
  const endedRef = useRef(false);
  const outroTimer = useRef<number | null>(null);
  const callbacks = useRef({ onMoment, onSubtitle, onEnd });
  const sourceRef = useRef<PoseSource | null>(source);

  useEffect(() => {
    callbacks.current = { onMoment, onSubtitle, onEnd };
    sourceRef.current = source;
  });

  // голос и режиссёр создаются один раз; ранее озвученные фразы подгружаются заранее
  useEffect(() => {
    const voice = new CoachVoice(coachId, profile.voiceEnabled, {
      anonId: profile.anonId,
      record: true,
    });
    voiceRef.current = voice;
    directorRef.current = new CoachDirector({
      coachId,
      harshness: profile.harshness,
      userName: profile.name,
    });

    const plan = getPlan(session.planId);
    const exercises = new Set(plan.blocks.map((b) => b.exercise));
    const ids: string[] = [];
    for (const phrase of allPhrases(coachId)) {
      if (phrase.template) continue;
      if (!phrase.levels.includes(profile.harshness)) continue;
      if (phrase.exercise && !exercises.has(phrase.exercise)) continue;
      ids.push(phrase.id);
    }
    for (let n = 1; n <= PRERECORDED_COUNT_MAX; n += 1) ids.push(countPhraseId(coachId, n));
    void voice.prepare(ids);

    void getRepository()
      .listRecords()
      .then((rows) => {
        recordsRef.current = Object.fromEntries(rows.map((r) => [r.exerciseId, r.bestTotal]));
      });

    const unlock = () => voice.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      voice.stop();
      if (subtitleTimer.current !== null) window.clearTimeout(subtitleTimer.current);
      if (emotionTimer.current !== null) window.clearTimeout(emotionTimer.current);
      if (outroTimer.current !== null) window.clearTimeout(outroTimer.current);
    };
  }, [
    coachId,
    profile.voiceEnabled,
    profile.anonId,
    profile.harshness,
    profile.name,
    session.planId,
  ]);

  const showSubtitle = useCallback((text: string, ms: number) => {
    if (subtitleTimer.current !== null) window.clearTimeout(subtitleTimer.current);
    setUi((u) => ({ ...u, subtitle: text }));
    callbacks.current.onSubtitle?.(text);
    subtitleTimer.current = window.setTimeout(() => {
      setUi((u) => ({ ...u, subtitle: null }));
      callbacks.current.onSubtitle?.(null);
    }, ms);
  }, []);

  const showEmotion = useCallback(
    (emotion: Emotion) => {
      if (emotionTimer.current !== null) window.clearTimeout(emotionTimer.current);
      setUi((u) => ({ ...u, emotion }));
      emotionTimer.current = window.setTimeout(
        () => setUi((u) => ({ ...u, emotion: baseMood })),
        EMOTION_HOLD_MS,
      );
    },
    [baseMood],
  );

  const apply = useCallback(
    (out: DirectorOutput) => {
      if (out.subtitle) showSubtitle(out.subtitle.text, out.subtitle.ms);
      if (out.emotion) showEmotion(out.emotion);
      if (out.quality !== undefined) setUi((u) => ({ ...u, quality: out.quality ?? null }));
      if (out.speak) voiceRef.current?.speak(out.speak);
      if (out.weight !== undefined && out.phraseEvent) {
        callbacks.current.onMoment?.(out.weight, out.phraseEvent, out.subtitle?.text ?? null);
      }
    },
    [showSubtitle, showEmotion],
  );

  const refreshView = useCallback((nowMs: number, force = false) => {
    const runner = runnerRef.current;
    if (!runner) return;
    if (!force && nowMs - lastViewAt.current < VIEW_REFRESH_MS) return;
    lastViewAt.current = nowMs;
    setUi((u) => ({
      ...u,
      view: runner.view(nowMs),
      elapsedMs: runner.elapsedMs(nowMs),
      paused: runner.paused,
    }));
  }, []);

  const end = useCallback((status: "done" | "abandoned") => {
    if (endedRef.current) return;
    endedRef.current = true;
    const runner = runnerRef.current;
    if (!runner) return;
    const durationSec = Math.round(runner.elapsedMs(sourceRef.current?.now() ?? 0) / 1000);
    runner.finish();
    callbacks.current.onEnd({
      status,
      results: runner.results(),
      bestSets: runner.bestSets(),
      recordsBeaten: runner.recordsBeaten(),
      durationSec,
    });
  }, []);

  const handleEvents = useCallback(
    (events: RunnerEvent[], nowMs: number) => {
      const runner = runnerRef.current;
      const director = directorRef.current;
      if (!runner || !director) return;
      for (const e of events) {
        if (e.type === "set_start") {
          source?.setExercise(e.step.exercise);
          source?.resume?.();
        }
        if (e.type === "rest_start") source?.idle?.();
        for (const out of director.handle(e, nowMs)) apply(out);

        if (e.type === "workout_complete") {
          const total = runner.results().reduce((s, r) => s + r.total, 0);
          const outro = director.completed(nowMs, total);
          if (outro) apply(outro);
          outroTimer.current = window.setTimeout(() => end("done"), OUTRO_MS);
        }
      }
      refreshView(nowMs, events.length > 0);
    },
    [apply, end, refreshView, source],
  );

  /** Начать тренировку (после проверки «в кадре» и отсчёта). */
  const begin = useCallback(() => {
    if (!source || runnerRef.current) return;
    const runner = new WorkoutRunner(getPlan(session.planId), { records: recordsRef.current });
    runnerRef.current = runner;
    voiceRef.current?.unlock();
    const nowMs = source.now();
    setUi((u) => ({ ...u, started: true }));
    handleEvents(runner.start(nowMs), nowMs);
  }, [source, session.planId, handleEvents]);

  /** Очередной кадр (null — человека не нашли). */
  const onFrame = useCallback(
    (frame: PoseFrame | null, nowMs: number) => {
      const runner = runnerRef.current;
      if (!runner || runner.isDone) return;
      handleEvents(runner.update(frame, nowMs), nowMs);
      refreshView(nowMs);
    },
    [handleEvents, refreshView],
  );

  const pause = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner || !source || runner.paused) return;
    runner.pause(source.now());
    source.pause?.();
    voiceRef.current?.stop();
    const out = directorRef.current?.paused(source.now());
    if (out) apply(out);
    refreshView(source.now(), true);
  }, [source, apply, refreshView]);

  const resume = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner || !source || !runner.paused) return;
    source.resume?.();
    runner.resume(source.now());
    refreshView(source.now(), true);
  }, [source, refreshView]);

  const skipRest = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner || !source) return;
    handleEvents(runner.skipRest(source.now()), source.now());
  }, [source, handleEvents]);

  /** Завершить досрочно (кнопка «Завершить» → подтверждение). */
  const abandon = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner || !source) return;
    const out = directorRef.current?.abandoned(source.now());
    if (out) apply(out);
    outroTimer.current = window.setTimeout(() => end("abandoned"), 1500);
  }, [source, apply, end]);

  /** Тренер говорит фразу на событие банка (например, ворчит на экране настройки). */
  const sayEvent = useCallback(
    (event: PhraseEvent, nowMs: number) => {
      const out = directorRef.current?.say(event, nowMs, "contempt");
      if (out) apply(out);
    },
    [apply],
  );

  /** Подпись «последнего кадра» для отладки: фаза и угол. */
  const debugSnapshot = useCallback(() => runnerRef.current?.snapshot() ?? null, []);

  return {
    ui,
    begin,
    onFrame,
    pause,
    resume,
    skipRest,
    abandon,
    sayEvent,
    debugSnapshot,
    voiceRef,
  };
}
