"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { t } from "@/lib/i18n";

const TABS: { href: string; icon: IconName; label: () => string; match: (p: string) => boolean }[] =
  [
    {
      href: "/",
      icon: "chat",
      label: () => t("tabs.chats"),
      match: (p) => p === "/" || p.startsWith("/chat"),
    },
    {
      href: "/workouts",
      icon: "dumbbell",
      label: () => t("tabs.workouts"),
      match: (p) => p.startsWith("/workouts"),
    },
    {
      href: "/rating",
      icon: "trophy",
      label: () => t("tabs.rating"),
      match: (p) => p.startsWith("/rating"),
    },
    {
      href: "/profile",
      icon: "user",
      label: () => t("tabs.profile"),
      match: (p) => p.startsWith("/profile"),
    },
  ];

/** Нижняя навигация: 4 вкладки, иконка 22px + подпись 11px, активная — синяя и жирнее. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("tabs.nav")}
      className="grid shrink-0 grid-cols-4 border-t border-line bg-white px-2 pt-2 pb-[max(22px,env(safe-area-inset-bottom))]"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-icon ${
              active ? "font-extrabold text-accent" : "font-bold text-muted"
            }`}
          >
            <Icon name={tab.icon} size={22} />
            <span className="text-[11px] leading-none">{tab.label()}</span>
          </Link>
        );
      })}
    </nav>
  );
}
