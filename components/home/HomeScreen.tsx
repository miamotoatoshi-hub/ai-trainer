"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChatRow } from "@/components/home/ChatRow";
import { HeroCard } from "@/components/home/HeroCard";
import { LockedSlot } from "@/components/home/LockedSlot";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { getCoach } from "@/lib/coach/coaches";
import { coachMood } from "@/lib/coach/mood";
import { getRepository } from "@/lib/data";
import { useRepoData } from "@/lib/data/useRepoData";
import { formatHeroLabel } from "@/lib/format";
import { buildChatList } from "@/lib/game/chatList";
import { pickNextWorkout } from "@/lib/game/hero";
import { computeStreak } from "@/lib/game/streak";
import { nextLockedCoach, unlockHint } from "@/lib/game/unlock";
import { t, tUnit } from "@/lib/i18n";
import { useNow } from "@/lib/useNow";
import { DEFAULT_PLAN_ID, getPlan } from "@/lib/workout/plans";
import { startWorkoutSession } from "@/lib/workout/startSession";

/** Главный экран «Тренеры»: карточка ближайшей тренировки и список чатов. */
export function HomeScreen() {
  const router = useRouter();
  const now = useNow(30_000);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const { data } = useRepoData(async (repo) => {
    const [profile, coaches, lastMessages, unread, scheduled, sessions] = await Promise.all([
      repo.getProfile(),
      repo.listUserCoaches(),
      repo.lastMessages(),
      repo.unreadCounts(),
      repo.listScheduled(),
      repo.listSessions(400),
    ]);
    return { profile, coaches, lastMessages, unread, scheduled, sessions };
  });

  const view = useMemo(() => {
    if (!data) return null;
    const next = pickNextWorkout(data.scheduled, now);
    const waiting = new Set(next ? [next.coachId] : []);
    const heroCoachId = next?.coachId ?? data.profile.activeCoachId;
    const heroCoach = data.coaches.find((c) => c.coachId === heroCoachId) ?? data.coaches[0]!;
    const streak = computeStreak(
      data.sessions.filter((s) => s.status === "done").map((s) => s.endedAt ?? s.startedAt),
      now,
    );
    const items = buildChatList({
      coaches: data.coaches,
      lastMessages: data.lastMessages,
      unread: data.unread,
      waiting,
      now,
    });
    const locked = nextLockedCoach(data.coaches);
    return { next, heroCoachId, heroCoach, streak, items, locked };
  }, [data, now]);

  if (!data || !view) {
    return (
      <main className="flex flex-col">
        <Header onSearch={() => {}} />
      </main>
    );
  }

  const { next, heroCoachId, heroCoach, streak, items, locked } = view;
  const heroMeta = getCoach(heroCoachId);
  const plan = next ? getPlan(next.planId) : null;
  const heroPhrase = !next
    ? heroMeta.hero.free
    : heroCoach.state === "ignoring"
      ? heroMeta.hero.ignoring
      : heroMeta.hero.waiting;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.preview.text.toLowerCase().includes(q),
      )
    : items;

  const lockedHint = locked
    ? unlockHint(locked)
    : data.profile.demo
      ? t("home.lockedFuture", { coach: getCoach("gromov").name })
      : null;

  async function startCall() {
    if (starting) return;
    setStarting(true);
    try {
      const id = await startWorkoutSession(getRepository(), {
        coachId: heroCoachId,
        planId: next?.planId ?? DEFAULT_PLAN_ID,
        scheduledId: next?.id ?? null,
        mode: next ? "plan" : "free",
      });
      router.push(`/call/${id}`);
    } catch {
      setStarting(false);
    }
  }

  return (
    <main className="flex flex-col pb-4">
      <Header
        onSearch={() => {
          setSearchOpen((open) => !open);
          setQuery("");
        }}
        searchOpen={searchOpen}
      />
      {searchOpen ? (
        <div className="px-5 pb-2">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("home.search")}
            className="h-11 w-full rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold placeholder:text-muted"
          />
        </div>
      ) : null}
      <h1 className="px-5 pb-3 font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("home.title")}
      </h1>

      <HeroCard
        coachId={heroCoachId}
        emotion={coachMood(heroCoach)}
        label={next ? formatHeroLabel(next.scheduledAt, now) : t("home.heroFree")}
        title={plan ? plan.title : t("home.freeTitle")}
        phrase={heroPhrase}
        streakText={
          streak > 0
            ? t("home.streak", { n: streak, unit: tUnit("plural.days", streak) })
            : t("home.streakNone")
        }
        onCall={startCall}
        busy={starting}
      />

      <div className="flex items-baseline justify-between px-5 pt-5 pb-1.5">
        <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
          {t("home.section")}
        </h2>
        <span className="text-[13px] leading-none font-bold text-muted">
          {t("home.count", { n: items.length, unit: tUnit("plural.coaches", items.length) })}
        </span>
      </div>

      <ul className="px-2">
        {filtered.map((item) => (
          <ChatRow key={item.coachId} item={item} />
        ))}
        {q && filtered.length === 0 ? (
          <li className="px-3 py-4 text-[14px] font-semibold text-muted">
            {t("home.searchEmpty")}
          </li>
        ) : null}
        {!q && lockedHint ? <LockedSlot hint={lockedHint} /> : null}
      </ul>
    </main>
  );
}

function Header({ onSearch, searchOpen = false }: { onSearch: () => void; searchOpen?: boolean }) {
  return (
    <header className="flex items-center gap-1.5 px-5 pt-[22px] pb-2.5">
      <span className="font-display text-[15px] leading-none font-extrabold tracking-[0.08em] text-accent">
        {t("app.name")}
      </span>
      <span className="flex-1" />
      <IconButton
        icon="search"
        label={t("home.search")}
        onClick={onSearch}
        aria-pressed={searchOpen}
      />
      <Link
        href="/profile"
        aria-label={t("home.settings")}
        title={t("home.settings")}
        className="inline-flex h-11 w-11 items-center justify-center rounded-icon bg-surface text-ink"
      >
        <Icon name="settings" size={20} />
      </Link>
    </header>
  );
}
