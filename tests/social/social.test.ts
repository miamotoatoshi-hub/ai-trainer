import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/lib/data/dexieRepository";
import type { WorkoutSession } from "@/lib/data/types";
import {
  acceptChallenge,
  applyReply,
  challengeLink,
  createChallenge,
  duelOutcome,
  duelScore,
  getPublicId,
  recordDuelResult,
  replyLink,
  sides,
} from "@/lib/social/duels";
import { buildLeaderboard, listFriends, removeFriend, upsertFriend } from "@/lib/social/friends";
import { buildLink, decodePayload, encodePayload, type SocialPayload } from "@/lib/social/links";
import { weekKey, weeklyClean } from "@/lib/social/week";
import { getPlan } from "@/lib/workout/plans";

const NOW = new Date(2026, 9, 21, 12, 0).getTime(); // среда
const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0).getTime();

/** Ссылка с подделанным содержимым (в обход проверок при создании). */
const forged = (data: object) => encodePayload(data as unknown as SocialPayload);

const DUEL: SocialPayload = {
  v: 1,
  kind: "duel",
  id: "11111111-2222-3333-4444-555555555555",
  name: "Алекс",
  exercise: "squat",
  seconds: 60,
  score: 23,
};

describe("ссылки", () => {
  it("кодируются и читаются обратно, в том числе кириллица", () => {
    expect(decodePayload(encodePayload(DUEL))).toEqual(DUEL);
    const friend: SocialPayload = {
      v: 1,
      kind: "friend",
      id: "abcdefgh-1234",
      name: "Мария-Анна",
      weekly: 48,
      week: "2026-10-19",
    };
    expect(decodePayload(encodePayload(friend))).toEqual(friend);
    expect(buildLink("https://pinok.app", DUEL)).toMatch(/^https:\/\/pinok\.app\/join\?d=[\w-]+$/);
  });

  it.each([
    ["мусор", "!!!"],
    ["не json", btoa("hello")],
    ["чужая версия", forged({ ...DUEL, v: 2 })],
    ["огромный счёт", forged({ ...DUEL, score: 100000 })],
    ["отрицательный счёт", forged({ ...DUEL, score: -1 })],
    ["дробный счёт", forged({ ...DUEL, score: 3.5 })],
    ["странное упражнение", forged({ ...DUEL, exercise: "hack" })],
    ["слишком долгая дуэль", forged({ ...DUEL, seconds: 9999 })],
    ["плохое имя", forged({ ...DUEL, name: "<script>" })],
    ["плохой id", forged({ ...DUEL, id: "../../etc" })],
    ["неизвестный вид", forged({ ...DUEL, kind: "admin" })],
  ])("отклоняет: %s", (_name, raw) => {
    expect(decodePayload(raw)).toBeNull();
  });
});

describe("неделя и таблица", () => {
  it("неделя начинается с понедельника", () => {
    expect(weekKey(at(21))).toBe("2026-10-19");
    expect(weekKey(at(25))).toBe("2026-10-19"); // воскресенье
    expect(weekKey(at(26))).toBe("2026-10-26");
  });

  it("считает чистые повторения только за эту неделю и только завершённые", () => {
    const base = {
      coachId: "gromov",
      planId: "legs-20",
      mode: "plan",
      scheduledId: null,
      totalReps: 0,
      cleanReps: 0,
      shallowReps: 0,
      bestStreak: 0,
      durationSec: 0,
      personalRecords: [],
      outcome: null,
    } as const;
    const session = (
      id: string,
      d: number,
      status: "done" | "abandoned",
      clean: number,
      unit: "reps" | "sec" = "reps",
    ) =>
      ({
        ...base,
        id,
        startedAt: at(d),
        endedAt: at(d),
        status,
        results: [
          { exerciseId: "squat", unit, total: clean, clean, shallow: 0, bestStreak: 0, errors: {} },
        ],
      }) as unknown as WorkoutSession;
    const sessions = [
      session("a", 19, "done", 10),
      session("b", 20, "done", 7),
      session("c", 21, "abandoned", 50),
      session("d", 18, "done", 99), // прошлая неделя
      session("e", 20, "done", 30, "sec"), // планка — секунды не считаем
    ];
    expect(weeklyClean(sessions, NOW)).toBe(17);
  });

  it("таблица сортирует по результату; данные прошлой недели у друга обнуляются", () => {
    const friends = [
      { id: "f1", name: "Аня", weekly: 30, week: "2026-10-19", receivedAt: 1 },
      { id: "f2", name: "Боря", weekly: 99, week: "2026-10-12", receivedAt: 1 },
    ];
    const board = buildLeaderboard({ id: "me", name: "Я", weekly: 12 }, friends, NOW);
    expect(board.map((e) => e.name)).toEqual(["Аня", "Я", "Боря"]);
    expect(board.find((e) => e.name === "Боря")).toMatchObject({ weekly: 0, stale: true });
    // при равенстве «я» выше
    const tie = buildLeaderboard({ id: "me", name: "Я", weekly: 30 }, friends, NOW);
    expect(tie[0]!.me).toBe(true);
  });
});

let repo: DexieRepository;
let counter = 0;
beforeEach(async () => {
  counter += 1;
  repo = new DexieRepository(`pinok-social-${counter}`);
  await repo.updateProfile({ name: "Мария", onboardingDone: true });
});
afterEach(async () => {
  await repo.destroy();
});

describe("друзья", () => {
  it("добавляются, обновляются по id и удаляются", async () => {
    await upsertFriend(repo, {
      id: "f1",
      name: "Аня",
      weekly: 10,
      week: "2026-10-19",
      receivedAt: 1,
    });
    await upsertFriend(repo, {
      id: "f2",
      name: "Боря",
      weekly: 5,
      week: "2026-10-19",
      receivedAt: 2,
    });
    await upsertFriend(repo, {
      id: "f1",
      name: "Аня",
      weekly: 25,
      week: "2026-10-19",
      receivedAt: 3,
    });
    const friends = await listFriends(repo);
    expect(friends.map((f) => [f.id, f.weekly])).toEqual([
      ["f1", 25],
      ["f2", 5],
    ]);
    await removeFriend(repo, "f1");
    expect((await listFriends(repo)).map((f) => f.id)).toEqual(["f2"]);
  });

  it("публичный id постоянный и не равен anonId", async () => {
    const a = await getPublicId(repo);
    expect(await getPublicId(repo)).toBe(a);
    expect(a).not.toBe((await repo.getProfile()).anonId);
  });
});

function finished(sessionId: string, clean: number, status: "done" | "abandoned" = "done") {
  return {
    id: sessionId,
    mode: "duel",
    status,
    results: [
      {
        exerciseId: "squat",
        unit: "reps",
        total: clean + 2,
        clean,
        shallow: 2,
        bestStreak: 3,
        errors: {},
      },
    ],
  } as unknown as WorkoutSession;
}

describe("дуэль", () => {
  it("я вызываю: минута приседаний → результат → ссылка-вызов", async () => {
    const sessionId = await createChallenge(repo, NOW);
    const session = (await repo.getSession(sessionId))!;
    expect(session).toMatchObject({ mode: "duel", planId: "duel:squat:60" });
    expect(getPlan(session.planId).blocks[0]).toMatchObject({ seconds: 60 });

    // пока результата нет, ссылки нет
    const [pending] = await repo.listDuels();
    expect(challengeLink(pending!, "https://x")).toBeNull();

    const updated = await recordDuelResult(repo, finished(sessionId, 23));
    expect(updated).toMatchObject({ role: "challenger", challengerResult: 23 });
    const link = challengeLink(updated!, "https://pinok.app")!;
    const payload = decodePayload(new URL(link).searchParams.get("d")!);
    expect(payload).toMatchObject({ kind: "duel", name: "Мария", score: 23, seconds: 60 });
  });

  it("прерванная минута результата не даёт", async () => {
    const sessionId = await createChallenge(repo, NOW);
    expect(await recordDuelResult(repo, finished(sessionId, 5, "abandoned"))).toBeNull();
    expect((await repo.listDuels())[0]!.challengerResult).toBeNull();
  });

  it("друг принимает вызов, отвечает, и вызвавший видит итог", async () => {
    // устройство Алекса: сделал 23
    const alexPayload = DUEL as Extract<SocialPayload, { kind: "duel" }>;
    // устройство Марии (repo): принимает
    const accepted = await acceptChallenge(repo, alexPayload, NOW);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.duel).toMatchObject({
      role: "opponent",
      challengerResult: 23,
      challengerName: "Алекс",
    });

    const mine = await recordDuelResult(repo, finished(accepted.sessionId, 28));
    expect(mine).toMatchObject({ opponentResult: 28 });
    expect(duelOutcome(mine!)).toBe("win");
    expect(sides(mine!)).toEqual({ mine: 28, theirs: 23, theirName: "Алекс" });

    // ссылка-ответ → на устройстве Алекса
    const reply = replyLink(mine!, "https://pinok.app")!;
    const replyPayload = decodePayload(new URL(reply).searchParams.get("d")!);
    expect(replyPayload).toMatchObject({ kind: "reply", score: 28, name: "Мария" });

    const alex = new DexieRepository(`pinok-social-alex-${counter}`);
    try {
      await alex.putDuel({
        id: DUEL.id,
        role: "challenger",
        exerciseId: "squat",
        durationSec: 60,
        challengerName: "Алекс",
        challengerResult: 23,
        opponentName: null,
        opponentResult: null,
        createdAt: NOW,
      });
      const applied = await applyReply(
        alex,
        replyPayload as Extract<SocialPayload, { kind: "reply" }>,
      );
      expect(applied.ok).toBe(true);
      if (applied.ok) {
        expect(duelOutcome(applied.duel)).toBe("lose");
        expect(sides(applied.duel).theirName).toBe("Мария");
      }
      // ответ на неизвестную дуэль
      const unknown = await applyReply(alex, {
        ...(replyPayload as object),
        id: "99999999-aaaa",
      } as Extract<SocialPayload, { kind: "reply" }>);
      expect(unknown).toEqual({ ok: false, reason: "unknown" });
    } finally {
      await alex.destroy();
    }
  });

  it("нельзя принять собственный вызов и сыграть одну дуэль дважды", async () => {
    const sessionId = await createChallenge(repo, NOW);
    const [own] = await repo.listDuels();
    const result = await acceptChallenge(
      repo,
      { ...(DUEL as Extract<SocialPayload, { kind: "duel" }>), id: own!.id },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, reason: "own" });
    void sessionId;

    const accepted = await acceptChallenge(
      repo,
      DUEL as Extract<SocialPayload, { kind: "duel" }>,
      NOW,
    );
    if (!accepted.ok) throw new Error("ожидали принятие");
    await recordDuelResult(repo, finished(accepted.sessionId, 10));
    const again = await acceptChallenge(
      repo,
      DUEL as Extract<SocialPayload, { kind: "duel" }>,
      NOW,
    );
    expect(again).toMatchObject({ ok: false, reason: "done" });
  });

  it("исход: ничья и ожидание", () => {
    const base = {
      id: "x",
      exerciseId: "squat" as const,
      durationSec: 60,
      challengerName: "А",
      opponentName: "Б",
      createdAt: 0,
    };
    expect(
      duelOutcome({ ...base, role: "challenger", challengerResult: 5, opponentResult: 5 }),
    ).toBe("draw");
    expect(
      duelOutcome({ ...base, role: "challenger", challengerResult: 5, opponentResult: null }),
    ).toBe("pending");
    expect(duelScore(finished("s", 12))).toBe(12);
  });
});
