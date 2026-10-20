"use client";

import { useEffect, useState, type RefObject } from "react";
import { classifyCameraError, openCamera, type CameraErrorKind, type Facing } from "./camera";
import { PoseEngine } from "./poseEngine";
import { CameraPoseSource, SimPoseSource, type PoseSource, type SimConfig } from "./poseSource";

export type CameraStatus = "idle" | "starting" | "ready" | "error";

export interface PoseSourceState {
  status: CameraStatus;
  error: CameraErrorKind | null;
  source: PoseSource | null;
}

interface Options {
  enabled: boolean;
  /** Если задан — вместо камеры работает симулятор человека. */
  sim: SimConfig | null;
  facing: Facing;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Меняется, чтобы перезапустить (кнопка «Попробовать снова»). */
  attempt: number;
}

/** Поднимает камеру + распознавание позы (или симулятор) и гасит всё при уходе с экрана. */
export function usePoseSource({
  enabled,
  sim,
  facing,
  videoRef,
  attempt,
}: Options): PoseSourceState {
  const key = `${enabled}|${sim ? "sim" : facing}|${attempt}`;
  const [state, setState] = useState<PoseSourceState & { key: string }>({
    key: "",
    status: "idle",
    error: null,
    source: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: PoseSource | null = null;

    const start = async () => {
      try {
        if (sim) {
          created = new SimPoseSource(sim);
        } else {
          const video = videoRef.current;
          if (!video) throw new Error("no-video-element");
          const stream = await openCamera(facing);
          if (cancelled) {
            for (const track of stream.getTracks()) track.stop();
            return;
          }
          video.srcObject = stream;
          video.muted = true;
          await video.play().catch(() => undefined);
          const engine = await PoseEngine.create();
          if (cancelled) {
            for (const track of stream.getTracks()) track.stop();
            engine.close();
            return;
          }
          created = new CameraPoseSource(video, stream, engine);
        }
        setState({ key, status: "ready", error: null, source: created });
      } catch (error) {
        if (cancelled) return;
        setState({ key, status: "error", error: classifyCameraError(error), source: null });
      }
    };
    void start();

    return () => {
      cancelled = true;
      created?.stop();
    };
  }, [key, enabled, sim, facing, videoRef]);

  if (state.key === key) return { status: state.status, error: state.error, source: state.source };
  return { status: enabled ? "starting" : "idle", error: null, source: null };
}
