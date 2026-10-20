"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Запуск приложения на клиенте: регистрирует service worker (PWA).
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

  return <>{children}</>;
}
