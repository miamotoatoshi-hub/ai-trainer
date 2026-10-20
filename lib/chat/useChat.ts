"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingKind } from "@/lib/coach/status";
import { getRepository } from "@/lib/data";
import type { CoachId } from "@/lib/data/types";
import { sendUserMessage } from "./respond";

/**
 * Отправка сообщений тренеру и состояние «печатает…».
 * Сообщения обрабатываются по очереди; ответ дописывается в базу, даже если пользователь
 * ушёл с экрана, — вернувшись, он увидит ответ в ленте.
 */
export function useChat(coachId: CoachId): {
  pending: PendingKind;
  send: (text: string) => Promise<void>;
} {
  const [pending, setPending] = useState<PendingKind>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    (text: string): Promise<void> => {
      const run = queue.current.then(async () => {
        try {
          await sendUserMessage(
            {
              repo: getRepository(),
              onPending: (kind) => {
                if (mounted.current) setPending(kind);
              },
            },
            coachId,
            text,
          );
        } catch {
          // Сбой одного ответа не должен ломать чат.
        } finally {
          if (mounted.current) setPending(null);
        }
      });
      queue.current = run;
      return run;
    },
    [coachId],
  );

  return { pending, send };
}
