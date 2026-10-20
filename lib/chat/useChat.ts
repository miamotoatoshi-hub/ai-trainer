"use client";

import { useCallback, useState } from "react";
import { getRepository } from "@/lib/data";
import type { CoachId } from "@/lib/data/types";
import type { PendingKind } from "@/lib/coach/status";

/**
 * Отправка сообщений тренеру и состояние «печатает…».
 * Пока (этап 2) только сохраняет сообщение пользователя; ответы тренера — в этапе 6.
 */
export function useChat(coachId: CoachId): {
  pending: PendingKind;
  send: (text: string) => Promise<void>;
} {
  const [pending] = useState<PendingKind>(null);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      await getRepository().addMessage({
        coachId,
        sender: "user",
        type: "text",
        text: clean,
        emotion: null,
        durationSec: null,
        meta: {},
        readAt: null,
        createdAt: Date.now(),
      });
    },
    [coachId],
  );

  return { pending, send };
}
