"use client";

import { useEffect, type ReactNode } from "react";
import { getRepository } from "@/lib/data";
import { seedDemo } from "@/lib/data/demo";
import { runAppOpen } from "@/lib/game/appOpen";
import { postAwayMessages } from "@/lib/game/awayMessages";

// В режиме разработки React запускает эффекты дважды — демо-данные нельзя засевать два раза.
let demoSeeding: Promise<void> | null = null;

/**
 * Запуск приложения на клиенте: service worker (PWA) и режим демо по ссылке `?demo=1`.
 * При открытии (и раз в минуту, пока приложение на экране) считается всё, что случилось «пока тебя
 * не было»: пропущенные тренировки, игнор, штраф за дни без занятий.
 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Кэширование включаем только в рабочей сборке: в разработке оно мешает горячей перезагрузке.
    const url = process.env.NODE_ENV === "production" ? "/sw.js?cache=1" : "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/", updateViaCache: "none" }).catch(() => {
      // Без service worker приложение работает как обычный сайт.
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") !== "1") return;
    demoSeeding ??= seedDemo(getRepository());
    void demoSeeding.then(() => {
      params.delete("demo");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      // Демо-данные засеваются в соседнем эффекте — дожидаемся, чтобы не считать по пустой базе.
      await demoSeeding;
      if (stopped) return;
      try {
        const now = Date.now();
        await runAppOpen(getRepository(), now);
        await postAwayMessages(getRepository(), now);
      } catch {
        // Расчёт повторится в следующую минуту; приложение от этого не ломается.
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <>{children}</>;
}
