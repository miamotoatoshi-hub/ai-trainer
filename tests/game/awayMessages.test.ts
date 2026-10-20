import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCRIPTED_BANKS } from "@/lib/coach/scripted";
import { DexieRepository } from "@/lib/data/dexieRepository";
import type { CoachId, NotifFrequency } from "@/lib/data/types";
import { dueAwayMessages, postAwayMessages } from "@/lib/game/awayMessages";
import { DAY, MINUTE } from "@/lib/time";

const at = (h: number, m = 0, d = 20) => new Date(2026, 9, d, h, m).getTime();
const SLOT = at(18);

let repo: DexieRepository;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  repo = new DexieRepository(`pinok-away-${counter}`);
  await repo.updateProfile({
    onboardingDone: true,
    ageBand: "18+",
    scheduleDays: [],
    createdAt: at(8, 0, 1),
  });
});
afterEach(async () => {
  await repo.destroy();
});

async function plan(
  coachId: CoachId = "gromov",
  scheduledAt = SLOT,
  status: "planned" | "missed" = "planned",
) {
  const id = `s-${coachId}-${scheduledAt}`;
  await repo.putScheduled({ id, coachId, planId: "legs-20", scheduledAt, status });
  return id;
}

async function kinds(now: number) {
  const profile = await repo.getProfile();
  return dueAwayMessages({
    profile,
    coaches: await repo.listUserCoaches(),
    scheduled: await repo.listScheduled(),
    log: await repo.listNotificationLog(0),
    now,
  }).map((m) => m.kind);
}

describe("правила «пока тебя не было»", () => {
  it("утром — «подъём», за 30 минут — напоминание, через 20 минут после времени — подталкивание", async () => {
    await plan();
    expect(await kinds(at(8, 59))).toEqual([]);
    expect(await kinds(at(9, 0))).toEqual(["morning"]);
    expect(await kinds(at(17, 29))).toEqual(["morning"]);
    expect(await kinds(at(17, 30))).toEqual(["reminder"]);
    expect(await kinds(at(18, 5))).toEqual([]);
    expect(await kinds(at(18, 20))).toEqual(["poke"]);
    expect(await kinds(at(18, 31))).toEqual([]);
  });

  it("не более двух сообщений в день; при нехватке места важнее напоминание и подталкивание", async () => {
    await plan();
    // человек открыл приложение в 18:25: утро, напоминание и подталкивание одновременно «просрочены»
    const profile = await repo.getProfile();
    const due = dueAwayMessages({
      profile,
      coaches: await repo.listUserCoaches(),
      scheduled: await repo.listScheduled(),
      log: [],
      now: at(18, 25),
    });
    // утро и напоминание уже неактуальны, остаётся подталкивание
    expect(due.map((m) => m.kind)).toEqual(["poke"]);
  });

  it("утреннее сообщение не нужно, если тренировка рано утром: сразу напоминание", async () => {
    await plan("gromov", at(9, 30));
    expect(await kinds(at(8, 59))).toEqual([]);
    expect(await kinds(at(9, 0))).toEqual(["reminder"]);
    expect(await kinds(at(9, 6))).toEqual(["reminder"]);
  });

  it("вечером после пропуска — холодное «тренировки не было», но только когда игнор закончился", async () => {
    await plan("gromov", at(8, 0), "missed");
    const coach = await repo.getUserCoach("gromov");
    expect(await kinds(at(20, 59))).toEqual([]);
    expect(await kinds(at(21, 0))).toEqual(["evening_cold"]);
    await repo.putUserCoach({ ...coach, state: "ignoring", ignoringUntil: at(23, 0) });
    expect(await kinds(at(21, 30))).toEqual([]);
  });

  it("закрытый тренер, игнор, пауза после кризиса и состояние «выполнено» сообщений не вызывают", async () => {
    await plan("marina"); // Марина ещё закрыта
    expect(await kinds(at(17, 40))).toEqual([]);

    await plan("gromov");
    const coach = await repo.getUserCoach("gromov");
    await repo.putUserCoach({ ...coach, state: "ignoring", ignoringUntil: SLOT + DAY });
    expect(await kinds(at(17, 40))).toEqual([]);
    await repo.putUserCoach({ ...coach, state: "normal", ignoringUntil: null });
    expect(await kinds(at(17, 40))).toEqual(["reminder"]);

    await repo.updateProfile({ supportPausedUntil: at(17, 40) + DAY });
    expect(await kinds(at(17, 40))).toEqual([]);
    await repo.updateProfile({ supportPausedUntil: null });

    await repo.putScheduled({
      id: `s-gromov-${SLOT}`,
      coachId: "gromov",
      planId: "legs-20",
      scheduledAt: SLOT,
      status: "done",
    });
    expect(await kinds(at(17, 40))).toEqual([]);
  });

  it.each<[NotifFrequency, number, string[]]>([
    ["normal", at(17, 30), ["reminder"]],
    ["workout_day", at(17, 30), ["reminder"]],
    ["rare", at(17, 30), ["reminder"]],
    ["off", at(17, 30), []],
    ["workout_day", at(10, 0), []],
    ["rare", at(10, 0), []],
    ["normal", at(10, 0), ["morning"]],
  ])("частота «%s» в %#: %j", async (freq, now, expected) => {
    await repo.updateProfile({ notifFrequency: freq });
    await plan();
    expect(await kinds(now)).toEqual(expected);
  });

  it("режим «редко»: не больше трёх сообщений за неделю", async () => {
    await repo.updateProfile({ notifFrequency: "rare" });
    await plan();
    const profile = await repo.getProfile();
    const log = [17, 18, 19].map((d) => ({
      kind: "reminder",
      coachId: "gromov" as CoachId,
      day: `2026-10-${d}`,
      sentAt: at(17, 30, d),
    }));
    const due = dueAwayMessages({
      profile,
      coaches: await repo.listUserCoaches(),
      scheduled: await repo.listScheduled(),
      log,
      now: at(17, 30),
    });
    expect(due).toEqual([]);
  });
});

describe("postAwayMessages", () => {
  it("пишет сообщения в чат с условным временем, добавляет карточку и не повторяется", async () => {
    await plan();
    const first = await postAwayMessages(repo, at(17, 40), () => 0.1);
    expect(first.map((m) => m.kind)).toEqual(["reminder"]);
    const messages = await repo.listMessages("gromov");
    expect(messages.map((m) => m.type)).toEqual(["text", "workout_card"]);
    expect(SCRIPTED_BANKS.gromov.reminder.map((l) => l.text)).toContain(messages[0]!.text);
    expect(messages[0]!.createdAt).toBe(at(17, 30));
    expect(messages[0]!.meta.source).toBe("away");
    expect(messages[1]!.meta.scheduledId).toBeTruthy();

    expect(await postAwayMessages(repo, at(17, 45))).toEqual([]);
    expect(await repo.listMessages("gromov")).toHaveLength(2);
  });

  it("после дневного лимита молчит", async () => {
    await plan();
    await postAwayMessages(repo, at(9, 5)); // утро
    await postAwayMessages(repo, at(17, 40)); // напоминание
    expect(await postAwayMessages(repo, at(18, 25))).toEqual([]); // подталкивание уже не влезает
    const sent = await repo.listNotificationLog(0);
    expect(sent.map((l) => l.kind)).toEqual(["morning", "reminder"]);
  });

  it("до онбординга ничего не пишет", async () => {
    await repo.updateProfile({ onboardingDone: false });
    await plan();
    expect(await postAwayMessages(repo, at(17, 40))).toEqual([]);
  });
});

void MINUTE;
