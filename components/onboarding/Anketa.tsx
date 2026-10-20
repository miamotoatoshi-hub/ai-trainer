"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bubble, TypingBubble } from "@/components/chat/Bubble";
import { Chip } from "@/components/onboarding/Chip";
import { Button } from "@/components/ui/Button";
import { CoachAvatar } from "@/components/ui/CoachAvatar";
import { Icon } from "@/components/ui/Icon";
import { getCoach } from "@/lib/coach/coaches";
import { formatWhen } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import {
  AGE_BANDS,
  allowedHarshness,
  answeredCount,
  applyAnswer,
  DAYS_PRESET,
  GOALS,
  MINUTES,
  NAME_MAX,
  nextStep,
  STEP_ORDER,
  TIMES,
  WEEK_ORDER,
  checkName,
  type Draft,
  type NotifAnswer,
  type StepId,
} from "@/lib/onboarding/anketa";
import { daysLabel, weekdayLabel } from "@/lib/onboarding/finish";
import { requestNotificationPermission } from "@/lib/notifications/permission";
import { slotsForProfile } from "@/lib/game/schedule";
import { useNow } from "@/lib/useNow";
import type { AgeBand, Goal, Harshness } from "@/lib/data/types";

const QUESTION: Record<StepId, MessageKey> = {
  name: "onboarding.q.name",
  age: "onboarding.q.age",
  goal: "onboarding.q.goal",
  minutes: "onboarding.q.minutes",
  days: "onboarding.q.days",
  time: "onboarding.q.time",
  harshness: "onboarding.q.harshness",
  coaches: "onboarding.q.coaches",
  notifications: "onboarding.q.notifications",
};

const AGE_LABEL: Record<AgeBand, MessageKey> = {
  "13-15": "onboarding.a.age.13-15",
  "16-17": "onboarding.a.age.16-17",
  "18+": "onboarding.a.age.18+",
};
const GOAL_LABEL: Record<Goal, MessageKey> = {
  strength: "onboarding.a.goal.strength",
  weight: "onboarding.a.goal.weight",
  endurance: "onboarding.a.goal.endurance",
  shape: "onboarding.a.goal.shape",
};
const HARSHNESS_TITLE: Record<Harshness, MessageKey> = {
  1: "onboarding.harshness.1.title",
  2: "onboarding.harshness.2.title",
  3: "onboarding.harshness.3.title",
};
const HARSHNESS_BODY: Record<Harshness, MessageKey> = {
  1: "onboarding.harshness.1.body",
  2: "onboarding.harshness.2.body",
  3: "onboarding.harshness.3.body",
};
const NOTIF_REPLY: Record<NotifAnswer, MessageKey> = {
  allowed: "onboarding.notifReply.allowed",
  later: "onboarding.notifReply.later",
  denied: "onboarding.notifReply.denied",
  unsupported: "onboarding.notifReply.unsupported",
};

/** Текст ответа пользователя в пузыре. */
function answerText(id: StepId, draft: Draft): string {
  switch (id) {
    case "name":
      return draft.name ?? "";
    case "age":
      return draft.ageBand ? t(AGE_LABEL[draft.ageBand]) : "";
    case "goal":
      return draft.goal ? t(GOAL_LABEL[draft.goal]) : "";
    case "minutes":
      return t("onboarding.a.minutes", { n: draft.minutesPerDay ?? 0 });
    case "days":
      return daysLabel(draft.scheduleDays ?? []);
    case "time":
      return draft.scheduleTime ?? "";
    case "harshness":
      return draft.harshness ? t(HARSHNESS_TITLE[draft.harshness]) : "";
    case "coaches":
      return t("onboarding.a.coaches");
    case "notifications":
      return draft.notifications === "allowed"
        ? t("onboarding.a.notif.allow")
        : t("onboarding.a.notif.later");
  }
}

interface AnketaProps {
  draft: Draft;
  /** Вердикт за приседания и прочие реплики Громова перед анкетой. */
  intro: string[];
  onChange: (draft: Draft) => void;
  onFinish: () => void;
  finishing: boolean;
}

/** Анкета знакомства в виде переписки с Громовым: вопрос → быстрый ответ. */
export function Anketa({ draft, intro, onChange, onFinish, finishing }: AnketaProps) {
  const meta = getCoach("gromov");
  const [typing, setTyping] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState(false);
  const [days, setDays] = useState<number[]>([...DAYS_PRESET]);
  const [customTime, setCustomTime] = useState(false);
  const [clock, setClock] = useState("18:00");
  const feedRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const now = useNow(60_000);
  const step = nextStep(draft);
  const answered = answeredCount(draft);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answered, typing]);

  function answer(id: StepId, value: unknown) {
    const next = applyAnswer(draft, id, value);
    if (nextStep(next) === nextStep(draft)) return false;
    onChange(next);
    // Тренер «печатает» следующий вопрос.
    setTyping(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTyping(false), 550);
    return true;
  }

  async function answerNotifications(allow: boolean) {
    if (!allow) {
      answer("notifications", "later");
      return;
    }
    const result = await requestNotificationPermission();
    const mapped: NotifAnswer =
      result === "granted"
        ? "allowed"
        : result === "denied"
          ? "denied"
          : result === "unsupported"
            ? "unsupported"
            : "later";
    answer("notifications", mapped);
  }

  function submitName(event: FormEvent) {
    event.preventDefault();
    if (!checkName(nameInput).ok) {
      setNameError(true);
      return;
    }
    setNameError(false);
    answer("name", nameInput);
  }

  const history = STEP_ORDER.filter((id) => id !== step && isAnswered(id, draft));
  let finalWhen: string | null = null;
  if (step === null && draft.scheduleDays && draft.scheduleTime) {
    const slot = slotsForProfile(
      { scheduleDays: draft.scheduleDays, scheduleTime: draft.scheduleTime },
      now,
    )[0];
    finalWhen = slot ? formatWhen(slot.scheduledAt, now) : null;
  }

  const allowed = allowedHarshness(draft.ageBand);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white" data-testid="anketa">
      <header className="flex items-center gap-2.5 border-b border-line px-4 pt-[max(18px,env(safe-area-inset-top))] pb-3">
        <CoachAvatar coachId="gromov" emotion="neutral" size={44} online />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] leading-tight font-extrabold">{meta.fullName}</h1>
          <p className="text-[13px] leading-tight font-bold text-accent">
            {t("onboarding.progress", {
              n: Math.min(answered + 1, STEP_ORDER.length),
              all: STEP_ORDER.length,
            })}
          </p>
        </div>
      </header>

      <div
        ref={feedRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-bg-chat px-3.5 pt-3.5 pb-3"
        data-testid="anketa-feed"
      >
        {intro.map((line) => (
          <Bubble key={line} mine={false} text={line} time="" bare />
        ))}
        {history.map((id) => (
          <div key={id} className="flex flex-col gap-2">
            <Bubble mine={false} text={t(QUESTION[id])} time="" bare />
            {id === "notifications" && draft.notifications ? (
              <>
                <Bubble mine text={answerText(id, draft)} time="" bare />
                <Bubble mine={false} text={t(NOTIF_REPLY[draft.notifications])} time="" bare />
              </>
            ) : (
              <Bubble mine text={answerText(id, draft)} time="" bare />
            )}
          </div>
        ))}
        {step ? <Bubble mine={false} text={t(QUESTION[step])} time="" bare /> : null}
        {step === null && finalWhen ? (
          <Bubble mine={false} text={t("onboarding.finalLine", { when: finalWhen })} time="" bare />
        ) : null}
        {step === null && !finalWhen ? (
          <Bubble mine={false} text={t("onboarding.finalLineNone")} time="" bare />
        ) : null}
        {typing ? <TypingBubble /> : null}
      </div>

      <div className="border-t border-line bg-white px-3 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        {typing ? null : step === "name" ? (
          <form onSubmit={submitName} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameError(false);
                }}
                aria-label={t("onboarding.inputName")}
                placeholder={t("onboarding.inputName")}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                enterKeyHint="send"
                className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold placeholder:text-muted"
              />
              <button
                type="submit"
                aria-label={t("chat.send")}
                disabled={nameInput.trim().length === 0}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
              >
                <Icon name="send" size={20} />
              </button>
            </div>
            {nameError ? (
              <p role="alert" className="text-[13px] font-bold text-warn">
                {t("onboarding.q.nameBad")}
              </p>
            ) : null}
          </form>
        ) : step === "age" ? (
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((band) => (
              <Chip key={band} onClick={() => answer("age", band)}>
                {t(AGE_LABEL[band])}
              </Chip>
            ))}
          </div>
        ) : step === "goal" ? (
          <div className="flex flex-wrap gap-2">
            {GOALS.map((goal) => (
              <Chip key={goal} onClick={() => answer("goal", goal)}>
                {t(GOAL_LABEL[goal])}
              </Chip>
            ))}
          </div>
        ) : step === "minutes" ? (
          <div className="flex flex-wrap gap-2">
            {MINUTES.map((n) => (
              <Chip key={n} onClick={() => answer("minutes", n)}>
                {t("onboarding.a.minutes", { n })}
              </Chip>
            ))}
          </div>
        ) : step === "days" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {WEEK_ORDER.map((d) => (
                <Chip
                  key={d}
                  selected={days.includes(d)}
                  className="min-w-12 px-3"
                  onClick={() =>
                    setDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                    )
                  }
                >
                  {weekdayLabel(d)}
                </Chip>
              ))}
            </div>
            <Button
              fullWidth
              height={48}
              disabled={days.length === 0}
              onClick={() => answer("days", days)}
            >
              {t("onboarding.a.daysDone")}
            </Button>
          </div>
        ) : step === "time" ? (
          customTime ? (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={clock}
                onChange={(e) => setClock(e.target.value)}
                aria-label={t("onboarding.q.time")}
                className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold"
              />
              <Chip primary onClick={() => answer("time", clock)}>
                {t("onboarding.a.timeSet")}
              </Chip>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {TIMES.map((time) => (
                <Chip key={time} onClick={() => answer("time", time)}>
                  {time}
                </Chip>
              ))}
              <Chip onClick={() => setCustomTime(true)}>{t("onboarding.a.timeOther")}</Chip>
            </div>
          )
        ) : step === "harshness" ? (
          <ul className="flex flex-col gap-2">
            {([1, 2, 3] as const).map((level) => {
              const locked = !allowed.includes(level);
              return (
                <li key={level}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => answer("harshness", level)}
                    className="flex min-h-14 w-full flex-col items-start justify-center rounded-row border border-line-2 bg-white px-4 py-2 text-left disabled:opacity-50"
                  >
                    <span className="text-[15px] font-extrabold">{t(HARSHNESS_TITLE[level])}</span>
                    <span className="text-[13px] font-semibold text-muted">
                      {locked ? t("onboarding.harshness.3.locked") : t(HARSHNESS_BODY[level])}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : step === "coaches" ? (
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 opacity-60" aria-hidden="true">
              {(["marina", "palych", "max"] as const).map((id) => (
                <CoachAvatar
                  key={id}
                  coachId={id}
                  size={40}
                  className="rounded-full ring-2 ring-white"
                />
              ))}
            </div>
            <Chip primary className="ml-auto" onClick={() => answer("coaches", true)}>
              {t("onboarding.a.coaches")}
            </Chip>
          </div>
        ) : step === "notifications" ? (
          <div className="flex flex-wrap gap-2">
            <Chip primary onClick={() => void answerNotifications(true)}>
              {t("onboarding.a.notif.allow")}
            </Chip>
            <Chip onClick={() => void answerNotifications(false)}>
              {t("onboarding.a.notif.later")}
            </Chip>
          </div>
        ) : (
          <Button fullWidth height={52} disabled={finishing} onClick={onFinish}>
            {t("onboarding.finish")}
          </Button>
        )}
      </div>
    </div>
  );
}

function isAnswered(id: StepId, draft: Draft): boolean {
  switch (id) {
    case "name":
      return draft.name !== undefined;
    case "age":
      return draft.ageBand !== undefined;
    case "goal":
      return draft.goal !== undefined;
    case "minutes":
      return draft.minutesPerDay !== undefined;
    case "days":
      return draft.scheduleDays !== undefined;
    case "time":
      return draft.scheduleTime !== undefined;
    case "harshness":
      return draft.harshness !== undefined;
    case "coaches":
      return draft.coaches !== undefined;
    case "notifications":
      return draft.notifications !== undefined;
  }
}
