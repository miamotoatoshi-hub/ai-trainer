"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getRepository } from "@/lib/data";
import type { Duel } from "@/lib/data/types";
import { t } from "@/lib/i18n";
import { acceptChallenge, applyReply, duelOutcome, sides } from "@/lib/social/duels";
import { upsertFriend } from "@/lib/social/friends";
import { decodePayload, type SocialPayload } from "@/lib/social/links";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "needs-onboarding" }
  | { kind: "friend"; payload: Extract<SocialPayload, { kind: "friend" }>; added: boolean }
  | { kind: "duel"; payload: Extract<SocialPayload, { kind: "duel" }>; message: string | null }
  | { kind: "reply"; message: string; duel: Duel | null; ok: boolean };

const SCREEN =
  "flex min-h-0 flex-1 flex-col bg-white px-6 pt-[max(40px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]";

/** Куда попадает человек по ссылке от друга: приглашение в рейтинг, вызов на дуэль или ответ на мой вызов. */
export function JoinScreen() {
  const router = useRouter();
  const raw = useSearchParams().get("d");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const payload = raw ? decodePayload(raw) : null;
      const repo = getRepository();
      const profile = await repo.getProfile();
      if (cancelled) return;
      if (!payload) return setState({ kind: "invalid" });
      if (!profile.onboardingDone) return setState({ kind: "needs-onboarding" });

      if (payload.kind === "friend") return setState({ kind: "friend", payload, added: false });
      if (payload.kind === "duel") {
        const existing = await repo.getDuel(payload.id);
        if (cancelled) return;
        if (existing?.role === "challenger") {
          return setState({ kind: "duel", payload, message: t("join.duelOwn") });
        }
        if (existing && existing.opponentResult !== null) {
          const { mine, theirs } = sides(existing);
          return setState({
            kind: "duel",
            payload,
            message: t("join.duelDone", { mine: mine ?? 0, theirs: theirs ?? 0 }),
          });
        }
        return setState({ kind: "duel", payload, message: null });
      }
      const result = await applyReply(repo, payload);
      if (cancelled) return;
      if (!result.ok) {
        return setState({
          kind: "reply",
          ok: false,
          duel: null,
          message: result.reason === "unknown" ? t("join.replyUnknown") : t("join.replyOwn"),
        });
      }
      const { mine, theirs } = sides(result.duel);
      setState({
        kind: "reply",
        ok: true,
        duel: result.duel,
        message: t("join.replyBody", { mine: mine ?? 0, theirs: theirs ?? 0 }),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  async function addFriend(payload: Extract<SocialPayload, { kind: "friend" }>) {
    await upsertFriend(getRepository(), {
      id: payload.id,
      name: payload.name,
      weekly: payload.weekly,
      week: payload.week,
      receivedAt: Date.now(),
    });
    setState({ kind: "friend", payload, added: true });
  }

  async function accept(payload: Extract<SocialPayload, { kind: "duel" }>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await acceptChallenge(getRepository(), payload, Date.now());
      if (result.ok) {
        router.push(`/call/${result.sessionId}`);
        return;
      }
      const { mine, theirs } = sides(result.duel);
      setState({
        kind: "duel",
        payload,
        message:
          result.reason === "own"
            ? t("join.duelOwn")
            : t("join.duelDone", { mine: mine ?? 0, theirs: theirs ?? 0 }),
      });
    } finally {
      setBusy(false);
    }
  }

  const home = (
    <Link
      href="/"
      className="flex h-12 items-center justify-center text-[15px] font-extrabold text-accent"
    >
      {t("join.home")}
    </Link>
  );

  if (state.kind === "loading") {
    return <div className="flex-1 bg-white" role="status" aria-label={t("common.loading")} />;
  }

  return (
    <main className={SCREEN} data-testid="join">
      <div className="flex flex-1 flex-col justify-center gap-4">
        {state.kind === "invalid" ? (
          <p className="text-[18px] leading-snug font-extrabold">{t("join.invalid")}</p>
        ) : null}
        {state.kind === "needs-onboarding" ? (
          <>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">
              {t("join.title")}
            </h1>
            <p className="text-[16px] font-semibold text-ink-2">
              {t("join.friendNeedsOnboarding")}
            </p>
          </>
        ) : null}
        {state.kind === "friend" ? (
          <>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">
              {t("join.friendTitle", { name: state.payload.name })}
            </h1>
            <p className="text-[16px] font-semibold text-ink-2">
              {state.added
                ? t("join.friendAdded", { name: state.payload.name })
                : t("join.friendBody", { n: state.payload.weekly })}
            </p>
          </>
        ) : null}
        {state.kind === "duel" ? (
          <>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">
              {t("join.duelTitle", { name: state.payload.name })}
            </h1>
            <p className="text-[16px] font-semibold text-ink-2">
              {state.message ??
                t("join.duelBody", { n: state.payload.score, sec: state.payload.seconds })}
            </p>
          </>
        ) : null}
        {state.kind === "reply" ? (
          <>
            <h1 className="font-display text-[24px] leading-tight font-extrabold">
              {state.duel && state.ok
                ? t("join.replyTitle", { name: sides(state.duel).theirName })
                : t("join.title")}
            </h1>
            <p className="text-[16px] font-semibold text-ink-2" data-testid="reply-message">
              {state.message}
            </p>
            {state.duel ? (
              <p className="text-[18px] font-extrabold">
                {t(`rating.duelOutcome.${duelOutcome(state.duel)}`)}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {state.kind === "friend" && !state.added ? (
          <Button fullWidth height={52} onClick={() => void addFriend(state.payload)}>
            {t("join.friendAdd")}
          </Button>
        ) : null}
        {state.kind === "duel" && state.message === null ? (
          <Button fullWidth height={52} disabled={busy} onClick={() => void accept(state.payload)}>
            {t("join.duelAccept")}
          </Button>
        ) : null}
        {state.kind === "friend" && state.added ? (
          <Link
            href="/rating"
            className="flex h-12 items-center justify-center rounded-icon bg-accent text-[15px] font-extrabold text-white"
          >
            {t("join.back")}
          </Link>
        ) : null}
        {state.kind === "reply" && state.ok ? (
          <Link
            href="/rating"
            className="flex h-12 items-center justify-center rounded-icon bg-accent text-[15px] font-extrabold text-white"
          >
            {t("join.back")}
          </Link>
        ) : null}
        {home}
      </div>
    </main>
  );
}
