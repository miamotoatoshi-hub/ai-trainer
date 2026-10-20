"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bubble, TypingBubble } from "@/components/chat/Bubble";
import { RelationshipBar } from "@/components/chat/RelationshipBar";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
import { WorkoutCard } from "@/components/chat/WorkoutCard";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { getCoach } from "@/lib/coach/coaches";
import { coachMood } from "@/lib/coach/mood";
import { coachStatusText, isOnline } from "@/lib/coach/status";
import { useChat } from "@/lib/chat/useChat";
import { getRepository } from "@/lib/data";
import type { CoachId, Message } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { formatDayLabel, formatMinutes, formatWhen } from "@/lib/format";
import { pickNextWorkout } from "@/lib/game/hero";
import { t } from "@/lib/i18n";
import { levelHint } from "@/lib/relationship/hint";
import { useVoicePlayer } from "@/lib/speech/useVoicePlayer";
import { dayKey, formatClock } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import { DEFAULT_PLAN_ID, getPlan } from "@/lib/workout/plans";
import { startWorkoutSession } from "@/lib/workout/startSession";

/** Переписка с тренером: шапка, блок отношения, лента, поле ввода. */
export function ChatScreen({ coachId }: { coachId: CoachId }) {
  const router = useRouter();
  const meta = getCoach(coachId);
  const now = useNow(30_000);
  const { pending, send } = useChat(coachId);
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const { data } = useRepoData(
    async (repo) => {
      const [messages, userCoach, scheduled, profile] = await Promise.all([
        repo.listMessages(coachId),
        repo.getUserCoach(coachId),
        repo.listScheduled(),
        repo.getProfile(),
      ]);
      return { messages, userCoach, scheduled, profile };
    },
    [coachId],
  );

  const voice = useVoicePlayer(coachId, data?.profile.anonId);
  const unreadFromCoach = data?.messages.some((m) => m.sender !== "user" && m.readAt === null);
  useEffect(() => {
    // Открыли чат — сообщения тренера прочитаны.
    if (unreadFromCoach) void getRepository().markCoachMessagesRead(coachId, Date.now());
  }, [unreadFromCoach, coachId]);

  const messageCount = data?.messages.length ?? 0;
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, pending]);

  const nextWorkout = useMemo(
    () =>
      data
        ? pickNextWorkout(
            data.scheduled.filter((s) => s.coachId === coachId),
            now,
          )
        : null,
    [data, coachId, now],
  );

  if (!data) return <div className="flex min-h-0 flex-1 flex-col bg-white" />;

  const { userCoach, messages } = data;
  const ignoring = userCoach.state === "ignoring";
  const status = coachStatusText({
    userCoach,
    now,
    waitingForWorkout: nextWorkout !== null,
    pending,
  });

  async function startCall(planId: string, scheduledId: string | null) {
    if (starting) return;
    setStarting(true);
    try {
      const id = await startWorkoutSession(getRepository(), {
        coachId,
        planId,
        scheduledId,
        mode: scheduledId ? "plan" : "free",
      });
      router.push(`/call/${id}`);
    } catch {
      setStarting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text;
    setText("");
    await send(value);
  }

  function renderMessage(m: Message) {
    const time = formatClock(m.createdAt);
    if (m.type === "voice") {
      return (
        <VoiceBubble
          key={m.id}
          seed={m.id}
          durationSec={m.durationSec ?? 0}
          time={time}
          transcript={m.meta.transcript ?? m.text}
          playing={voice.playingId === m.id}
          progress={voice.playingId === m.id ? voice.progress : 0}
          onToggle={() => voice.toggle(m.id, m.durationSec ?? 0, m.meta.transcript ?? m.text)}
        />
      );
    }
    if (m.type === "workout_card") {
      const plan = getPlan(m.meta.planId ?? DEFAULT_PLAN_ID);
      const when = m.meta.scheduledAt ? formatWhen(m.meta.scheduledAt, now) : null;
      const duration = formatMinutes(plan.durationMin);
      return (
        <WorkoutCard
          key={m.id}
          title={plan.cardTitle}
          subtitle={when ? t("chat.cardMeta", { when, duration }) : t("chat.cardNow", { duration })}
          busy={starting}
          onStart={() => startCall(plan.id, m.meta.scheduledId ?? null)}
        />
      );
    }
    if (m.type === "status") {
      return (
        <p
          key={m.id}
          className="self-center rounded-full bg-date-chip px-3 py-1 text-[12px] font-bold text-ink-2"
        >
          {m.text}
        </p>
      );
    }
    if (m.type === "support") {
      return (
        <div key={m.id} className="flex justify-start">
          <Link
            href="/support"
            className="max-w-[78%] rounded-[18px_18px_18px_6px] border-2 border-accent bg-white px-3 py-2.5 text-[15px] leading-[1.4] font-semibold text-ink"
          >
            {m.text}
          </Link>
        </div>
      );
    }
    return (
      <Bubble
        key={m.id}
        mine={m.sender === "user"}
        text={m.text}
        time={time}
        read={m.readAt !== null}
      />
    );
  }

  const feed: React.ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const key = dayKey(m.createdAt);
    if (key !== lastDay) {
      lastDay = key;
      feed.push(
        <div key={`day-${key}`} className="flex justify-center py-1">
          <span className="rounded-full bg-date-chip px-3 py-1 text-[12px] leading-none font-bold text-ink-2">
            {formatDayLabel(m.createdAt, now)}
          </span>
        </div>,
      );
    }
    feed.push(renderMessage(m));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="flex items-center gap-2.5 border-b border-line px-3 pt-[18px] pb-3">
        <Link
          href="/"
          aria-label={t("chat.back")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-icon text-ink"
        >
          <Icon name="back" size={22} strokeWidth={2.4} />
        </Link>
        <CoachAvatar
          coachId={coachId}
          emotion={coachMood(userCoach)}
          size={44}
          online={isOnline(userCoach, nextWorkout !== null)}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] leading-tight font-extrabold">{meta.fullName}</h1>
          <p
            className="truncate text-[13px] leading-tight font-bold text-accent"
            aria-live="polite"
            data-testid="coach-status"
          >
            {status}
          </p>
        </div>
        <IconButton
          icon="video"
          label={t("chat.videoCall")}
          tone="accent"
          round
          size={46}
          iconSize={20}
          disabled={starting}
          onClick={() => startCall(nextWorkout?.planId ?? DEFAULT_PLAN_ID, nextWorkout?.id ?? null)}
        />
      </header>

      <RelationshipBar
        level={userCoach.level}
        score={userCoach.score}
        hint={levelHint({
          level: userCoach.level,
          score: userCoach.score,
          ignoring,
          gender: meta.gender,
        })}
      />

      <div
        ref={feedRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-bg-chat px-3.5 pt-3.5 pb-2.5"
        data-testid="chat-feed"
      >
        {feed}
        {pending ? <TypingBubble /> : null}
      </div>

      <div className="relative border-t border-line bg-white">
        {menuOpen ? (
          <div className="absolute bottom-full left-3 mb-2 flex flex-col overflow-hidden rounded-row border border-line bg-white shadow-lg">
            <button
              type="button"
              className="min-h-11 px-4 text-left text-[15px] font-bold"
              onClick={() => {
                setMenuOpen(false);
                void startCall(nextWorkout?.planId ?? DEFAULT_PLAN_ID, nextWorkout?.id ?? null);
              }}
            >
              {t("chat.attachNow")}
            </button>
            <button
              type="button"
              className="min-h-11 border-t border-line px-4 text-left text-[15px] font-bold"
              onClick={() => {
                setMenuOpen(false);
                void send(t("chat.attachAskText"));
              }}
            >
              {t("chat.attachAsk")}
            </button>
          </div>
        ) : null}
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 px-3 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]"
        >
          <IconButton
            icon="plus"
            label={t("chat.attach")}
            round
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={meta.placeholder}
            aria-label={t("chat.inputLabel")}
            maxLength={500}
            className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold placeholder:text-muted"
          />
          {text.trim() ? (
            <IconButton icon="send" label={t("chat.send")} tone="accent" round type="submit" />
          ) : (
            <IconButton icon="mic" label={t("chat.mic")} tone="accent" round />
          )}
        </form>
      </div>
    </div>
  );
}
