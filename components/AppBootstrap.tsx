"use client";

import { useEffect, type ReactNode } from "react";
import { getRepository } from "@/lib/data";
import { seedDemo } from "@/lib/data/demo";

// В режиме разработки React запускает эффекты дважды — демо-данные нельзя засевать два раза.
let demoSeeding: Promise<void> | null = null;

/**
 * Запуск приложения на клиенте: service worker (PWA) и режим демо по ссылке `?demo=1`.
 * Позже сюда добавятся проверка онбординга и «пока тебя не было».
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

  return <>{children}</>;
}
