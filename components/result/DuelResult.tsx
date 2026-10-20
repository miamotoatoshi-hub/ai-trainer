"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { CoachId } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { t } from "@/lib/i18n";
import { duelComment } from "@/lib/social/comments";
import { challengeLink, duelOutcome, replyLink, sides } from "@/lib/social/duels";
import { shareLink } from "@/lib/social/shareLink";

/** Итог дуэли на экране результата: счёт, реплика тренера и ссылка, которую нужно отправить другу. */
export function DuelResult({ sessionId, coachId }: { sessionId: string; coachId: CoachId }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [seed] = useState(() => Math.random());
  const { data: duel } = useRepoData(
    async (repo) => {
      const duelId = await repo.getMeta<string>(`duelSession:${sessionId}`);
      return duelId ? ((await repo.getDuel(duelId)) ?? null) : null;
    },
    [sessionId],
  );

  const view = useMemo(() => {
    if (!duel) return null;
    const { mine, theirs, theirName } = sides(duel);
    const outcome = duelOutcome(duel);
    const diff = mine !== null && theirs !== null ? Math.abs(mine - theirs) : 0;
    return {
      mine,
      theirs,
      theirName,
      outcome,
      comment: duelComment(coachId, outcome, theirName, diff, () => seed),
    };
  }, [duel, coachId, seed]);

  if (!duel || !view) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = duel.role === "challenger" ? challengeLink(duel, origin) : replyLink(duel, origin);

  async function send() {
    if (!link) return;
    const result = await shareLink(link, t("rating.shareTitle"), t("rating.shareText"));
    setNotice(
      result === "copied"
        ? t("rating.copied")
        : result === "failed"
          ? t("rating.linkFailed")
          : null,
    );
  }

  return (
    <section
      data-testid="duel-result"
      className="flex flex-col gap-3 rounded-row border-2 border-accent p-4"
    >
      <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
        {t("duelResult.title").toUpperCase()}
      </h2>
      {view.mine === null ? (
        <p className="text-[15px] font-bold text-ink-2">{t("duelResult.pending")}</p>
      ) : view.theirs === null ? (
        <p className="text-[15px] font-bold text-ink-2">
          {t("duelResult.waiting", { mine: view.mine })}
        </p>
      ) : (
        <>
          <p
            className="font-display text-[34px] leading-none font-extrabold"
            data-testid="duel-score"
          >
            {view.mine} : {view.theirs}
          </p>
          <p className="text-[15px] font-bold text-ink-2">
            {t("duelResult.againstLine", {
              mine: view.mine,
              theirs: view.theirs,
              name: view.theirName,
            })}
          </p>
          <p className="text-[18px] font-extrabold text-accent">
            {t(`rating.duelOutcome.${view.outcome}`)}
          </p>
        </>
      )}
      {view.comment ? (
        <p className="text-[15px] leading-snug font-semibold">{view.comment}</p>
      ) : null}
      {link ? (
        <Button height={48} onClick={() => void send()}>
          {duel.role === "challenger" ? t("duelResult.sendChallenge") : t("duelResult.sendReply")}
        </Button>
      ) : null}
      {notice ? (
        <p role="status" className="text-[13px] font-bold text-accent">
          {notice}
        </p>
      ) : null}
      <Link
        href="/rating"
        className="flex h-11 items-center text-[14px] font-extrabold text-accent"
      >
        {t("duelResult.toRating")}
      </Link>
    </section>
  );
}
