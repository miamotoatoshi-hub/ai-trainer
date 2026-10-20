"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachId } from "@/lib/data/types";
import { CoachVoice, type PlayHandle } from "./coachVoice";

/**
 * Проигрывание голосовых сообщений тренера в ленте: настоящий голос (ElevenLabs через сервер),
 * а без ключа — голос браузера. Прогресс идёт по длительности записи.
 */
export function useVoicePlayer(
  coachId: CoachId,
  anonId?: string,
): {
  playingId: number | null;
  progress: number;
  toggle: (id: number, durationSec: number, text: string) => void;
} {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const voiceRef = useRef<CoachVoice | null>(null);
  const handleRef = useRef<PlayHandle | null>(null);
  const timer = useRef<number | null>(null);
  const token = useRef(0);

  const reset = useCallback(() => {
    token.current += 1;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    handleRef.current?.stop();
    handleRef.current = null;
    setPlayingId(null);
    setProgress(0);
  }, []);

  useEffect(() => reset, [reset]);

  const toggle = useCallback(
    (id: number, _durationSec: number, text: string) => {
      if (playingId === id) {
        reset();
        return;
      }
      reset();
      const mine = token.current;
      voiceRef.current ??= new CoachVoice(coachId, true, { anonId });
      voiceRef.current.unlock();
      setPlayingId(id);
      void voiceRef.current.playMessage(text).then((handle) => {
        if (mine !== token.current) {
          handle.stop();
          return;
        }
        handleRef.current = handle;
        const startedAt = performance.now();
        timer.current = window.setInterval(() => {
          setProgress(
            Math.min(1, (performance.now() - startedAt) / Math.max(1, handle.durationMs)),
          );
        }, 100);
        void handle.done.then(() => {
          if (mine === token.current) reset();
        });
      });
    },
    [playingId, reset, coachId, anonId],
  );

  return { playingId, progress, toggle };
}
