"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Проигрывание голосовых сообщений тренера в ленте.
 * Пока (этап 2) только анимирует прогресс по длительности; настоящая озвучка — в этапе 4.
 */
export function useVoicePlayer(): {
  playingId: number | null;
  progress: number;
  toggle: (id: number, durationSec: number, text: string) => void;
} {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setPlayingId(null);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (id: number, durationSec: number) => {
      if (playingId === id) {
        stop();
        return;
      }
      stop();
      setPlayingId(id);
      const startedAt = Date.now();
      timer.current = window.setInterval(() => {
        const p = (Date.now() - startedAt) / (Math.max(1, durationSec) * 1000);
        if (p >= 1) stop();
        else setProgress(p);
      }, 100);
    },
    [playingId, stop],
  );

  return { playingId, progress, toggle };
}
