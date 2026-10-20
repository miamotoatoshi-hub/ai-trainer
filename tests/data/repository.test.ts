import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/lib/data/dexieRepository";
import type { NewMessage } from "@/lib/data/types";

let repo: DexieRepository;
let counter = 0;

beforeEach(() => {
  counter += 1;
  repo = new DexieRepository(`pinok-test-${counter}`);
});

afterEach(async () => {
  await repo.destroy();
});

function msg(partial: Partial<NewMessage> = {}): NewMessage {
  return {
    coachId: "gromov",
    sender: "coach",
    type: "text",
    text: "Привет",
    emotion: null,
    durationSec: null,
    meta: {},
    readAt: null,
    createdAt: 1000,
    ...partial,
  };
}

describe("Repository (Dexie)", () => {
  it("создаёт профиль один раз и сохраняет изменения", async () => {
    const a = await repo.getProfile();
    const b = await repo.getProfile();
    expect(a.anonId).toBe(b.anonId);
    expect(a.onboardingDone).toBe(false);

    const updated = await repo.updateProfile({ name: "Алекс", harshness: 3 });
    expect(updated.name).toBe("Алекс");
    expect((await repo.getProfile()).harshness).toBe(3);
    expect((await repo.getProfile()).anonId).toBe(a.anonId);
  });

  it("создаёт четырёх тренеров, открыт только Громов", async () => {
    const coaches = await repo.listUserCoaches();
    expect(coaches.map((c) => c.coachId)).toEqual(["gromov", "marina", "palych", "max"]);
    expect(coaches.filter((c) => c.unlocked).map((c) => c.coachId)).toEqual(["gromov"]);
    expect(coaches.every((c) => c.score === 0 && c.level === "despises")).toBe(true);
  });

  it("хранит сообщения по порядку и считает непрочитанные", async () => {
    await repo.addMessage(msg({ text: "второе", createdAt: 2000 }));
    await repo.addMessage(msg({ text: "первое", createdAt: 1000 }));
    await repo.addMessage(msg({ sender: "user", text: "моё", createdAt: 3000 }));
    await repo.addMessage(msg({ coachId: "marina", text: "чужое", createdAt: 500 }));

    const list = await repo.listMessages("gromov");
    expect(list.map((m) => m.text)).toEqual(["первое", "второе", "моё"]);

    expect(await repo.unreadCounts()).toEqual({ gromov: 2, marina: 1 });
    const last = await repo.lastMessages();
    expect(last.gromov?.text).toBe("моё");
    expect(last.marina?.text).toBe("чужое");
    expect(last.palych).toBeUndefined();

    await repo.markCoachMessagesRead("gromov", 5000);
    expect(await repo.unreadCounts()).toEqual({ marina: 1 });

    // «прочитано тренером» относится только к сообщениям пользователя
    await repo.markUserMessagesRead("gromov", 6000);
    const after = await repo.listMessages("gromov");
    expect(after.find((m) => m.sender === "user")?.readAt).toBe(6000);
  });

  it("уведомляет подписчиков об изменениях", async () => {
    let calls = 0;
    const off = repo.subscribe(() => {
      calls += 1;
    });
    await repo.addMessage(msg());
    await repo.incrementUsage("2026-10-20:chat");
    expect(calls).toBeGreaterThanOrEqual(2);
    off();
    const before = calls;
    await repo.addMessage(msg());
    expect(calls).toBe(before);
  });

  it("считает использование", async () => {
    expect(await repo.getUsage("k")).toBe(0);
    expect(await repo.incrementUsage("k")).toBe(1);
    expect(await repo.incrementUsage("k", 4)).toBe(5);
    expect(await repo.getUsage("k")).toBe(5);
  });

  it("exportAll не включает клипы, deleteAll стирает всё", async () => {
    await repo.getProfile();
    await repo.addMessage(msg());
    await repo.putClip({
      sessionId: "s1",
      blob: new Blob(["x"]),
      mime: "video/webm",
      durationSec: 12,
      moment: "test",
      createdAt: 1,
    });

    const bundle = await repo.exportAll();
    expect(bundle.app).toBe("pinok");
    expect(Object.keys(bundle.data)).toContain("messages");
    expect(Object.keys(bundle.data)).not.toContain("clips");

    await repo.deleteAll();
    expect(await repo.listMessages("gromov")).toEqual([]);
    expect(await repo.getClip("s1")).toBeUndefined();
    // после удаления профиль создаётся заново, уже с новым anonId
    expect((await repo.getProfile()).onboardingDone).toBe(false);
  });
});
