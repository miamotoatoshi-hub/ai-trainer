"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Section } from "@/components/profile/parts";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

type Platform = "ios" | "android" | "desktop";

const subscribeNone = () => () => undefined;

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Как поставить приложение на телефон: кнопка «Установить» там, где браузер её даёт, и инструкция там, где нет. */
export function InstallHint() {
  const standalone = useSyncExternalStore(subscribeNone, detectStandalone, () => false);
  const platform = useSyncExternalStore<Platform>(subscribeNone, detectPlatform, () => "desktop");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <Section title={t("profile.install.title")}>
      {standalone ? (
        <p className="text-[14px] font-semibold text-ink-2">{t("profile.install.installed")}</p>
      ) : (
        <>
          {prompt ? (
            <Button
              height={48}
              onClick={async () => {
                await prompt.prompt();
                setPrompt(null);
              }}
            >
              {t("profile.install.button")}
            </Button>
          ) : null}
          <p className="text-[14px] leading-snug font-semibold text-ink-2">
            {t(`profile.install.${platform}`)}
          </p>
        </>
      )}
    </Section>
  );
}
