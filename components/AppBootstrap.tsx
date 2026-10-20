"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getRepository } from "@/lib/data";
import { seedDemo } from "@/lib/data/demo";
import { runAppOpen } from "@/lib/game/appOpen";
import { postAwayMessages } from "@/lib/game/awayMessages";

// В режиме разработки React запускает эффекты дважды — демо-данные нельзя засевать два раза.
let demoSeeding: Promise<void> | null = null;

/**
 * Если адрес содержит `?demo=1`, засевает демо-данные (один раз) и убирает параметр из адреса.
 * Возвращает обещание, которое дожидаются все, кто читает данные при старте.
 */
function startDemoIfRequested(): Promise<void> | null {
  if (demoSeeding) return demoSeeding;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") return null;
  demoSeeding = seedDemo(getRepository()).then(() => {
    params.delete("demo");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  });
  return demoSeeding;
}

/** Страницы, которые открываются и до знакомства: оно само ведёт на звонок и обратно. */
function openBeforeOnboarding(pathname: string): boolean {
  return ["/onboarding", "/call/", "/result/", "/support", "/privacy", "/terms"].some((p) =>
    pathname.startsWith(p),
  );
}

/**
 * Запуск приложения на клиенте: service worker (PWA) и режим демо по ссылке `?demo=1`.
 * При открытии (и раз в минуту, пока приложение на экране) считается всё, что случилось «пока тебя
 * не было»: пропущенные тренировки, игнор, штраф за дни без занятий.
 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Для какого адреса уже проверили, что знакомство пройдено (пока не проверили — экран пустой,
  // чтобы новичок не видел «Тренеры» перед тем, как его отправят на знакомство).
  const [checkedPath, setCheckedPath] = useState<string | null>(null);

  useEffect(() => {
    if (openBeforeOnboarding(pathname)) return;
    let cancelled = false;
    void (async () => {
      // Демо-данные засеваются первыми — после них знакомство считается пройденным.
      await startDemoIfRequested();
      const profile = await getRepository().getProfile();
      if (cancelled) return;
      if (profile.onboardingDone) {
        setCheckedPath(pathname);
      } else {
        // Ссылка от друга сохраняется: после знакомства человек вернётся к ней.
        if (pathname.startsWith("/join")) {
          await getRepository().setMeta("afterOnboarding", pathname + window.location.search);
        }
        router.replace("/onboarding");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Кэширование включаем только в рабочей сборке: в разработке оно мешает горячей перезагрузке.
    const url = process.env.NODE_ENV === "production" ? "/sw.js?cache=1" : "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/", updateViaCache: "none" }).catch(() => {
      // Без service worker приложение работает как обычный сайт.
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      // Дожидаемся демо-данных, чтобы не считать по пустой базе.
      await startDemoIfRequested();
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

  const visible = openBeforeOnboarding(pathname) || checkedPath === pathname;
  // Содержимое рендерится всегда (сервер видит и настоящий ответ 404), но до проверки скрыто.
  return <div style={{ display: visible ? "contents" : "none" }}>{children}</div>;
}
