"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isSttSupported, startListening, type SttError, type SttSession } from "./stt";

export type PttState = "idle" | "listening" | "denied" | "empty" | "error";

const subscribeNothing = () => () => undefined;

/**
 * «Нажми и говори»: пока кнопка зажата, браузер слушает; отпустили — итоговый текст уходит в `onFinal`.
 * Возвращает свойства для кнопки (мышь, палец, клавиатура).
 */
export function usePushToTalk(onFinal: (text: string) => void): {
  supported: boolean;
  state: PttState;
  interim: string;
  buttonProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    onKeyUp: (event: React.KeyboardEvent) => void;
    onContextMenu: (event: React.MouseEvent) => void;
  };
} {
  const supported = useSyncExternalStore(subscribeNothing, isSttSupported, () => false);
  const [state, setState] = useState<PttState>("idle");
  const [interim, setInterim] = useState("");
  const session = useRef<SttSession | null>(null);
  const finalRef = useRef(onFinal);

  useEffect(() => {
    finalRef.current = onFinal;
  });
  useEffect(() => () => session.current?.abort(), []);

  const start = useCallback(() => {
    if (session.current) return;
    setInterim("");
    const started = startListening({
      onInterim: setInterim,
      onFinal: (text) => {
        session.current = null;
        setInterim("");
        if (text) {
          setState("idle");
          finalRef.current(text);
        } else {
          setState("empty");
        }
      },
      onError: (error: SttError) => {
        session.current = null;
        setInterim("");
        setState(error === "denied" ? "denied" : "error");
      },
    });
    session.current = started;
    setState(started ? "listening" : "error");
  }, []);

  const stop = useCallback(() => {
    session.current?.stop();
  }, []);

  return {
    supported,
    state,
    interim,
    buttonProps: {
      onPointerDown: (event) => {
        // Палец не должен выделять текст или открывать меню.
        event.preventDefault();
        start();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onPointerLeave: stop,
      onKeyDown: (event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      },
      onKeyUp: (event) => {
        if (event.key === " " || event.key === "Enter") stop();
      },
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}
