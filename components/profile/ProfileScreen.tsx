"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Chip } from "@/components/onboarding/Chip";
import { ConfirmDialog, Field, Section, Toggle } from "@/components/profile/parts";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { downloadFile } from "@/lib/clips/share";
import { COACHES } from "@/lib/coach/coaches";
import { getRepository } from "@/lib/data";
import { seedDemo } from "@/lib/data/demo";
import {
  COACH_IDS,
  type AgeBand,
  type CoachId,
  type Goal,
  type Harshness,
  type NotifFrequency,
} from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { rebuildSchedule } from "@/lib/game/schedule";
import { t, type MessageKey } from "@/lib/i18n";
import {
  currentPermission,
  requestNotificationPermission,
  type PermissionResult,
} from "@/lib/notifications/permission";
import {
  AGE_BANDS,
  allowedHarshness,
  checkName,
  GOALS,
  isValidClock,
  MINUTES,
  NAME_MAX,
  sanitizeDays,
  TIMES,
  WEEK_ORDER,
} from "@/lib/onboarding/anketa";
import { weekdayLabel } from "@/lib/onboarding/finish";

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
const FREQ_LABEL: Record<NotifFrequency, MessageKey> = {
  normal: "profile.freq.normal",
  rare: "profile.freq.rare",
  workout_day: "profile.freq.workout_day",
  off: "profile.freq.off",
};
const PERM_LABEL: Record<PermissionResult, MessageKey> = {
  granted: "profile.perm.granted",
  denied: "profile.perm.denied",
  default: "profile.perm.default",
  unsupported: "profile.perm.unsupported",
};

const APP_VERSION = "0.1";

/** Полная перезагрузка страницы: сбрасывает всё, что держится в памяти приложения. */
function hardNavigate(path: string): void {
  window.location.replace(new URL(path, window.location.origin).href);
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-[13px] font-bold text-muted">
      {label}
      <input
        type="time"
        value={value}
        onChange={(e) => isValidClock(e.target.value) && onChange(e.target.value)}
        className="h-11 rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold text-ink"
      />
    </label>
  );
}

/** Вкладка «Профиль»: все настройки, память тренеров, экспорт и удаление данных, демо. */
export function ProfileScreen() {
  const [notice, setNotice] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState(false);
  const [permission, setPermission] = useState<PermissionResult>("default");
  const [confirm, setConfirm] = useState<"delete" | "demo" | null>(null);

  const { data } = useRepoData(async (repo) => {
    const [profile, coaches, memory] = await Promise.all([
      repo.getProfile(),
      repo.listUserCoaches(),
      Promise.all(COACH_IDS.map((id) => repo.listMemory(id))),
    ]);
    return { profile, coaches, memory: memory.flat() };
  });

  useEffect(() => {
    // Разрешение читается из браузера, поэтому после первого показа экрана.
    const timer = window.setTimeout(() => setPermission(currentPermission()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!data)
    return <div className="flex-1 bg-white" role="status" aria-label={t("common.loading")} />;
  const { profile, coaches, memory } = data;
  const repo = getRepository();
  const allowed = allowedHarshness(profile.ageBand);
  const nameValue = nameInput ?? profile.name;
  const scheduleDays = days ?? profile.scheduleDays;
  const scheduleTime = time ?? profile.scheduleTime;
  const scheduleDirty = days !== null || time !== null;

  async function saveName() {
    const check = checkName(nameValue);
    if (!check.ok) return;
    await repo.updateProfile({ name: check.name });
    setNameInput(null);
    setNotice(t("profile.nameSaved"));
  }

  async function saveSchedule() {
    const clean = sanitizeDays(scheduleDays);
    if (clean.length === 0) {
      setNotice(t("profile.scheduleNeedsDay"));
      return;
    }
    await repo.updateProfile({ scheduleDays: clean, scheduleTime });
    await rebuildSchedule(repo, Date.now());
    setDays(null);
    setTime(null);
    setCustomTime(false);
    setNotice(t("profile.scheduleSaved"));
  }

  async function exportData() {
    const bundle = await repo.exportAll();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(
      new File([JSON.stringify(bundle, null, 2)], `pinok-data-${date}.json`, {
        type: "application/json",
      }),
    );
    setNotice(t("profile.exported"));
  }

  async function wipe() {
    await repo.deleteAll();
    // Полная перезагрузка: сбрасывает всё, что держится в памяти страницы.
    hardNavigate("/onboarding");
  }

  async function startDemo() {
    await seedDemo(repo);
    hardNavigate("/");
  }

  async function askPermission() {
    setPermission(await requestNotificationPermission());
  }

  return (
    <main className="flex flex-col pb-10" data-testid="profile">
      <h1 className="px-5 pt-[26px] pb-1 font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("profile.title")}
      </h1>

      {profile.demo ? (
        <div
          role="status"
          className="mx-5 mt-3 flex items-center gap-3 rounded-row border-2 border-accent bg-accent-tint px-4 py-3"
        >
          <p className="flex-1 text-[14px] font-extrabold text-accent">{t("profile.demoBanner")}</p>
          <Button height={44} variant="secondary" onClick={() => setConfirm("delete")}>
            {t("profile.demoExit")}
          </Button>
        </div>
      ) : null}

      <Section title={t("profile.about")}>
        <Field label={t("profile.name")}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input
              value={nameValue}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={NAME_MAX}
              aria-label={t("profile.name")}
              className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-surface-2 px-4 text-[15px] font-semibold"
            />
            <Button
              type="submit"
              height={44}
              disabled={!checkName(nameValue).ok || nameInput === null}
            >
              {t("profile.nameSave")}
            </Button>
          </form>
        </Field>
        <Field label={t("profile.age")}>
          <ChipRow>
            {AGE_BANDS.map((band) => (
              <Chip
                key={band}
                selected={profile.ageBand === band}
                onClick={() => void repo.updateProfile({ ageBand: band })}
              >
                {t(AGE_LABEL[band])}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={t("profile.goal")}>
          <ChipRow>
            {GOALS.map((goal) => (
              <Chip
                key={goal}
                selected={profile.goal === goal}
                onClick={() => void repo.updateProfile({ goal })}
              >
                {t(GOAL_LABEL[goal])}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={t("profile.minutes")}>
          <ChipRow>
            {MINUTES.map((n) => (
              <Chip
                key={n}
                selected={profile.minutesPerDay === n}
                onClick={() => void repo.updateProfile({ minutesPerDay: n })}
              >
                {t("onboarding.a.minutes", { n })}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      </Section>

      <Section id="schedule" title={t("profile.schedule")}>
        <Field label={t("profile.days")}>
          <ChipRow>
            {WEEK_ORDER.map((d) => (
              <Chip
                key={d}
                selected={scheduleDays.includes(d)}
                className="min-w-12 px-3"
                onClick={() =>
                  setDays(
                    scheduleDays.includes(d)
                      ? scheduleDays.filter((x) => x !== d)
                      : [...scheduleDays, d],
                  )
                }
              >
                {weekdayLabel(d)}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={t("profile.time")}>
          {customTime || !TIMES.includes(scheduleTime) ? (
            <TimeInput label={t("profile.time")} value={scheduleTime} onChange={setTime} />
          ) : (
            <ChipRow>
              {TIMES.map((value) => (
                <Chip key={value} selected={scheduleTime === value} onClick={() => setTime(value)}>
                  {value}
                </Chip>
              ))}
              <Chip onClick={() => setCustomTime(true)}>{t("onboarding.a.timeOther")}</Chip>
            </ChipRow>
          )}
        </Field>
        <Button height={48} disabled={!scheduleDirty} onClick={() => void saveSchedule()}>
          {t("profile.scheduleSave")}
        </Button>
      </Section>

      <Section title={t("profile.coach")}>
        <Field label={t("profile.activeCoach")}>
          <ChipRow>
            {coaches
              .filter((c) => c.unlocked)
              .map((c) => (
                <Chip
                  key={c.coachId}
                  selected={profile.activeCoachId === c.coachId}
                  onClick={async () => {
                    await repo.updateProfile({ activeCoachId: c.coachId });
                    await rebuildSchedule(repo, Date.now());
                  }}
                >
                  {COACHES[c.coachId as CoachId].name}
                </Chip>
              ))}
          </ChipRow>
        </Field>
        <Field label={t("profile.harshness")}>
          <ul className="flex flex-col gap-2">
            {([1, 2, 3] as const).map((level) => {
              const locked = !allowed.includes(level);
              return (
                <li key={level}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={profile.harshness === level}
                    onClick={() => void repo.updateProfile({ harshness: level })}
                    className={`flex min-h-14 w-full flex-col items-start justify-center rounded-row border px-4 py-2 text-left disabled:opacity-50 ${
                      profile.harshness === level ? "border-accent bg-accent-tint" : "border-line-2"
                    }`}
                  >
                    <span className="text-[15px] font-extrabold">{t(HARSHNESS_TITLE[level])}</span>
                    <span className="text-[13px] font-semibold text-muted">
                      {locked ? t("profile.harshnessAdultOnly") : t(HARSHNESS_BODY[level])}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Field>
      </Section>

      <Section title={t("profile.voiceAndClips")}>
        <Toggle
          label={t("profile.voice")}
          hint={t("profile.voiceHint")}
          checked={profile.voiceEnabled}
          testId="toggle-voice"
          onChange={(value) => void repo.updateProfile({ voiceEnabled: value })}
        />
        <Toggle
          label={t("profile.clips")}
          hint={t("profile.clipsHint")}
          checked={profile.clipsEnabled !== false}
          testId="toggle-clips"
          onChange={(value) => void repo.updateProfile({ clipsEnabled: value })}
        />
        <Toggle
          label={t("profile.debug")}
          hint={t("profile.debugHint")}
          checked={profile.debug}
          testId="toggle-debug"
          onChange={(value) => void repo.updateProfile({ debug: value })}
        />
      </Section>

      <Section title={t("profile.notifications")}>
        <Field label={t("profile.frequency")}>
          <ChipRow>
            {(Object.keys(FREQ_LABEL) as NotifFrequency[]).map((value) => (
              <Chip
                key={value}
                selected={profile.notifFrequency === value}
                onClick={() => void repo.updateProfile({ notifFrequency: value })}
              >
                {t(FREQ_LABEL[value])}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={t("profile.quiet")}>
          <div className="flex gap-3">
            <TimeInput
              label={t("profile.quietFrom")}
              value={profile.quietStart}
              onChange={(value) => void repo.updateProfile({ quietStart: value })}
            />
            <TimeInput
              label={t("profile.quietTo")}
              value={profile.quietEnd}
              onChange={(value) => void repo.updateProfile({ quietEnd: value })}
            />
          </div>
        </Field>
        <Field label={t("profile.permission")}>
          <p className="text-[14px] font-semibold text-ink-2" data-testid="permission-status">
            {t(PERM_LABEL[permission])}
          </p>
          {permission === "default" ? (
            <Button variant="secondary" height={44} onClick={() => void askPermission()}>
              {t("profile.permAsk")}
            </Button>
          ) : null}
        </Field>
      </Section>

      <Section title={t("profile.memory")}>
        <p className="text-[13px] font-semibold text-muted">{t("profile.memoryHint")}</p>
        {memory.length === 0 ? (
          <p className="text-[14px] font-semibold text-ink-2">{t("profile.memoryEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="memory-list">
            {memory.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-row border border-line px-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">{m.fact}</p>
                  <p className="text-[12px] font-semibold text-muted">
                    {COACHES[m.coachId].name}
                    {m.kind === "limitation" ? ` · ${t("profile.limitation")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t("profile.memoryDelete", { fact: m.fact })}
                  onClick={() => void repo.deleteMemory(m.id)}
                  className="flex h-11 w-11 items-center justify-center rounded-icon text-muted"
                >
                  <Icon name="cross" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("profile.privacy")}>
        <p className="text-[14px] leading-snug font-semibold text-ink-2">
          {t("profile.privacyNote")}
        </p>
        <Button variant="secondary" height={48} onClick={() => void exportData()}>
          {t("profile.export")}
        </Button>
        <Button variant="danger" height={48} onClick={() => setConfirm("delete")}>
          {t("profile.delete")}
        </Button>
        <p className="text-[14px] font-semibold text-ink-2">
          {t("profile.language")}: {t("profile.languageValue")}
        </p>
        <nav className="flex flex-col">
          {(
            [
              ["/privacy", "profile.policy"],
              ["/terms", "profile.terms"],
              ["/support", "profile.help"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center border-b border-line text-[15px] font-extrabold text-accent"
            >
              {t(label)}
            </Link>
          ))}
        </nav>
      </Section>

      <Section title={t("profile.demo")}>
        <p className="text-[14px] leading-snug font-semibold text-ink-2">{t("profile.demoHint")}</p>
        <Button variant="secondary" height={48} onClick={() => setConfirm("demo")}>
          {t("profile.demoStart")}
        </Button>
      </Section>

      {notice ? (
        <p role="status" className="px-5 pt-4 text-[13px] font-bold text-accent">
          {notice}
        </p>
      ) : null}
      <p className="px-5 pt-6 text-[12px] font-bold text-muted">
        {t("profile.version", { version: APP_VERSION })}
      </p>

      {confirm === "delete" ? (
        <ConfirmDialog
          danger
          title={t("profile.deleteTitle")}
          body={t("profile.deleteBody")}
          confirmLabel={t("profile.deleteConfirm")}
          cancelLabel={t("profile.cancel")}
          onConfirm={() => void wipe()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === "demo" ? (
        <ConfirmDialog
          title={t("profile.demoConfirmTitle")}
          body={t("profile.demoConfirmBody")}
          confirmLabel={t("profile.demoConfirm")}
          cancelLabel={t("profile.cancel")}
          onConfirm={() => void startDemo()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </main>
  );
}
