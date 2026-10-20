"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import { getRepository } from "@/lib/data";
import type { Duel } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { t, type MessageKey } from "@/lib/i18n";
import { leaderboardComment } from "@/lib/social/comments";
import {
  challengeLink,
  createChallenge,
  duelOutcome,
  getPublicId,
  replyLink,
  sides,
} from "@/lib/social/duels";
import { buildLeaderboard, listFriends, removeFriend } from "@/lib/social/friends";
import { buildLink } from "@/lib/social/links";
import { shareLink } from "@/lib/social/shareLink";
import { weekKey, weeklyClean } from "@/lib/social/week";
import { useNow } from "@/lib/useNow";

const OUTCOME_LABEL: Record<string, MessageKey> = {
  win: "rating.duelOutcome.win",
  lose: "rating.duelOutcome.lose",
  draw: "rating.duelOutcome.draw",
  pending: "rating.duelOutcome.pending",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="px-5 pt-6 pb-2 text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
      {children}
    </h2>
  );
}

/** Вкладка «Рейтинг»: таблица недели с друзьями, приглашение и дуэли. Всё работает без сервера, через ссылки. */
export function RatingScreen() {
  const router = useRouter();
  const now = useNow(60_000);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed] = useState(() => Math.random());

  const { data } = useRepoData(async (repo) => {
    const [profile, friends, sessions, duels, publicId] = await Promise.all([
      repo.getProfile(),
      listFriends(repo),
      repo.listSessions(300),
      repo.listDuels(),
      getPublicId(repo),
    ]);
    return { profile, friends, sessions, duels, publicId };
  });

  const board = useMemo(() => {
    if (!data) return [];
    return buildLeaderboard(
      {
        id: data.publicId,
        name: data.profile.name || t("rating.you"),
        weekly: weeklyClean(data.sessions, now),
      },
      data.friends,
      now,
    );
  }, [data, now]);

  const comment = useMemo(
    () => (data ? leaderboardComment(data.profile.activeCoachId, board, () => seed) : null),
    [data, board, seed],
  );

  if (!data)
    return <div className="flex-1 bg-white" role="status" aria-label={t("common.loading")} />;
  const { profile, duels } = data;
  const origin = window.location.origin;

  async function send(url: string, text: string) {
    const result = await shareLink(url, t("rating.shareTitle"), text);
    setNotice(
      result === "copied"
        ? t("rating.copied")
        : result === "failed"
          ? t("rating.linkFailed")
          : null,
    );
  }

  async function invite() {
    if (!profile.name) {
      setNotice(t("rating.noName"));
      return;
    }
    const url = buildLink(origin, {
      v: 1,
      kind: "friend",
      id: data!.publicId,
      name: profile.name,
      weekly: weeklyClean(data!.sessions, now),
      week: weekKey(now),
    });
    await send(url, t("rating.shareText"));
  }

  async function startDuel() {
    if (busy) return;
    setBusy(true);
    try {
      const sessionId = await createChallenge(getRepository(), Date.now());
      router.push(`/call/${sessionId}`);
    } catch {
      setBusy(false);
    }
  }

  function duelLink(duel: Duel): string | null {
    return duel.role === "challenger" ? challengeLink(duel, origin) : replyLink(duel, origin);
  }

  return (
    <main className="flex flex-col pb-6" data-testid="rating">
      <h1 className="px-5 pt-[26px] pb-3 font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("rating.title")}
      </h1>

      {comment ? (
        <div className="mx-5 flex items-end gap-3">
          <CoachAvatar coachId={profile.activeCoachId} emotion="neutral" size={44} />
          <p
            data-testid="rating-comment"
            className="rounded-[18px_18px_18px_6px] border border-line bg-bg-chat px-3 py-2.5 text-[15px] leading-[1.4] font-semibold"
          >
            {comment}
          </p>
        </div>
      ) : null}

      <SectionTitle>{t("rating.week")}</SectionTitle>
      <ol className="flex flex-col gap-1.5 px-5" data-testid="leaderboard">
        {board.map((entry, i) => (
          <li
            key={entry.id}
            data-me={entry.me}
            className={`flex items-center gap-3 rounded-row border px-4 py-3 ${
              entry.me ? "border-accent bg-accent-tint" : "border-line"
            }`}
          >
            <span className="w-6 font-display text-[16px] font-extrabold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold">
                {entry.me ? `${entry.name} (${t("rating.you").toLowerCase()})` : entry.name}
              </p>
              {entry.stale ? (
                <p className="text-[12px] font-bold text-muted">{t("rating.stale")}</p>
              ) : null}
            </div>
            <span className="font-display text-[20px] font-extrabold">{entry.weekly}</span>
            {!entry.me ? (
              <button
                type="button"
                aria-label={t("rating.remove", { name: entry.name })}
                onClick={() => void removeFriend(getRepository(), entry.id)}
                className="flex h-11 w-11 items-center justify-center rounded-icon text-muted"
              >
                <Icon name="cross" size={18} />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="px-5 pt-2 text-[12px] font-semibold text-muted">{t("rating.weekHint")}</p>

      <SectionTitle>{t("rating.invite").toUpperCase()}</SectionTitle>
      <div className="mx-5 flex flex-col gap-3 rounded-row bg-surface p-4">
        <p className="text-[14px] leading-snug font-semibold text-ink-2">
          {t("rating.inviteBody")}
        </p>
        <Button height={48} icon="link" onClick={() => void invite()}>
          {t("rating.share")}
        </Button>
      </div>

      <SectionTitle>{t("rating.duels")}</SectionTitle>
      <div className="mx-5 flex flex-col gap-3 rounded-row bg-surface p-4">
        <p className="text-[14px] leading-snug font-semibold text-ink-2">{t("rating.duelsBody")}</p>
        <Button height={48} icon="dumbbell" disabled={busy} onClick={() => void startDuel()}>
          {t("rating.duelStart")}
        </Button>
      </div>
      {duels.length === 0 ? (
        <p className="px-5 pt-3 text-[14px] font-semibold text-muted">{t("rating.duelsEmpty")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 px-5" data-testid="duels">
          {duels
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((duel) => {
              const { mine, theirs, theirName } = sides(duel);
              const outcome = duelOutcome(duel);
              const link = duelLink(duel);
              const finished = mine !== null;
              return (
                <li key={duel.id} className="rounded-row border border-line px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-extrabold">
                        {duel.opponentName || duel.role === "opponent"
                          ? t("rating.duelWith", { name: theirName })
                          : t("rating.duelUnknown")}
                      </p>
                      <p className="text-[13px] font-bold text-muted">
                        {!finished
                          ? t("rating.duelNotFinished")
                          : theirs === null
                            ? t("rating.duelWaiting")
                            : t("rating.duelScore", { mine, theirs })}
                      </p>
                    </div>
                    <span className="rounded-full bg-surface px-3 py-1.5 text-[12px] leading-none font-extrabold">
                      {t(OUTCOME_LABEL[outcome] ?? "rating.duelOutcome.pending")}
                    </span>
                  </div>
                  {link && (theirs === null || duel.role === "opponent") ? (
                    <Button
                      variant="secondary"
                      height={44}
                      fullWidth
                      className="mt-3"
                      onClick={() => void send(link, t("rating.shareText"))}
                    >
                      {duel.role === "challenger"
                        ? t("rating.duelSendChallenge")
                        : t("rating.duelSendReply")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
        </ul>
      )}

      {notice ? (
        <p role="status" className="px-5 pt-4 text-[13px] font-bold text-accent">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
