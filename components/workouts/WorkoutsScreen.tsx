"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getCoach } from "@/lib/coach/coaches";
import { getRepository } from "@/lib/data";
import { EXERCISE_IDS, type ExerciseId } from "@/lib/data/types";
import { useRepoData } from "@/lib/data/useRepoData";
import { formatListTime, formatWhen } from "@/lib/format";
import { pickNextWorkout } from "@/lib/game/hero";
import { cleanRatio } from "@/lib/game/verdict";
import { t, tUnit, type MessageKey } from "@/lib/i18n";
import { addDays, startOfDay } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import { exerciseName } from "@/lib/workout/labels";
import { freePlanId, getPlan, planExercises, type FreePreset } from "@/lib/workout/plans";
import { startWorkoutSession } from "@/lib/workout/startSession";

const STATUS_LABEL: Record<string, MessageKey> = {
  planned: "workouts.status.planned",
  done: "workouts.status.done",
  missed: "workouts.status.missed",
  skipped: "workouts.status.skipped",
};

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-accent-tint text-accent",
  done: "bg-surface text-ink",
  missed: "bg-surface text-warn",
  skipped: "bg-surface text-muted",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="px-5 pt-6 pb-2 text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
      {children}
    </h2>
  );
}

/** Вкладка «Тренировки»: расписание на неделю, история, каталог упражнений и свободная тренировка. */
export function WorkoutsScreen() {
  const router = useRouter();
  const now = useNow(30_000);
  const [starting, setStarting] = useState<string | null>(null);

  const { data } = useRepoData(async (repo) => {
    const [profile, scheduled, sessions] = await Promise.all([
      repo.getProfile(),
      repo.listScheduled(),
      repo.listSessions(60),
    ]);
    return { profile, scheduled, sessions };
  });

  const week = useMemo(() => {
    if (!data) return [];
    const from = startOfDay(now);
    const to = addDays(from, 7);
    return data.scheduled
      .filter((s) => s.scheduledAt >= from && s.scheduledAt < to)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }, [data, now]);

  const next = data ? pickNextWorkout(data.scheduled, now) : null;
  const history = (data?.sessions ?? []).filter((s) => s.status !== "active");

  async function launch(key: string, planId: string, scheduledId: string | null) {
    if (!data || starting) return;
    setStarting(key);
    try {
      const coachId = next && scheduledId ? next.coachId : data.profile.activeCoachId;
      const id = await startWorkoutSession(getRepository(), {
        coachId,
        planId,
        scheduledId,
        mode: scheduledId ? "plan" : "free",
      });
      router.push(`/call/${id}`);
    } catch {
      setStarting(null);
    }
  }

  return (
    <main className="flex flex-col pb-6" data-testid="workouts">
      <h1 className="px-5 pt-[26px] pb-1 font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">
        {t("workouts.title")}
      </h1>

      <SectionTitle>{t("workouts.week")}</SectionTitle>
      {week.length === 0 ? (
        <p className="px-5 text-[14px] font-semibold text-muted">{t("workouts.weekEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-5" data-testid="week">
          {week.map((item) => {
            const plan = getPlan(item.planId);
            const callable = next?.id === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-row border border-line px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold">{plan.cardTitle}</p>
                  <p className="truncate text-[13px] font-bold text-muted">
                    {formatWhen(item.scheduledAt, now)} · {getCoach(item.coachId).name}
                  </p>
                </div>
                {callable ? (
                  <Button
                    height={44}
                    pill
                    disabled={starting !== null}
                    onClick={() => void launch(item.id, item.planId, item.id)}
                  >
                    {t("workouts.callNow")}
                  </Button>
                ) : (
                  <span
                    className={`rounded-full px-3 py-1.5 text-[12px] leading-none font-extrabold ${
                      STATUS_STYLE[item.status] ?? ""
                    }`}
                  >
                    {t(STATUS_LABEL[item.status] ?? "workouts.status.planned")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/profile#schedule"
        className="mx-5 mt-2 flex h-11 items-center text-[14px] font-extrabold text-accent"
      >
        {t("workouts.editSchedule")}
      </Link>

      <SectionTitle>{t("workouts.catalog")}</SectionTitle>
      <p className="px-5 pb-2 text-[14px] font-semibold text-ink-2">{t("workouts.catalogBody")}</p>
      <ul className="flex flex-col gap-2 px-5" data-testid="catalog">
        {EXERCISE_IDS.map((id: ExerciseId) => (
          <li key={id} className="rounded-row border border-line px-4 py-3">
            <p className="text-[16px] font-extrabold">{exerciseName(id)}</p>
            <p className="mt-0.5 text-[13px] font-semibold text-muted">
              {t(`exercises.${id}.hint`)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["quick", "standard"] as FreePreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant={preset === "quick" ? "secondary" : "primary"}
                  height={44}
                  disabled={starting !== null}
                  onClick={() => void launch(`${id}:${preset}`, freePlanId(id, preset), null)}
                >
                  {starting === `${id}:${preset}`
                    ? t("workouts.starting")
                    : t(`workouts.${preset}`)}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <SectionTitle>{t("workouts.history")}</SectionTitle>
      {history.length === 0 ? (
        <p className="px-5 text-[14px] font-semibold text-muted">{t("workouts.historyEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-5" data-testid="history">
          {history.map((s) => {
            const ratio = Math.round(cleanRatio(s.results) * 100);
            const names = planExercises(getPlan(s.planId)).map(exerciseName).join(", ");
            return (
              <li key={s.id}>
                <Link
                  href={`/result/${s.id}`}
                  className="flex items-center gap-3 rounded-row border border-line px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{names}</p>
                    <p className="truncate text-[13px] font-bold text-muted">
                      {formatListTime(s.startedAt, now)} ·{" "}
                      {s.status === "abandoned"
                        ? t("workouts.historyAbandoned", { coach: getCoach(s.coachId).name })
                        : t("workouts.historyLine", {
                            coach: getCoach(s.coachId).name,
                            clean: ratio,
                          })}
                    </p>
                  </div>
                  <span className="text-[13px] font-extrabold text-ink-2">
                    {t("workouts.reps", {
                      n: s.totalReps,
                      unit: tUnit("plural.reps", s.totalReps),
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
