import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MEMORY_LIMIT, saveMemory } from "@/lib/chat/memory";
import { DexieRepository } from "@/lib/data/dexieRepository";

let repo: DexieRepository;
let counter = 0;

beforeEach(() => {
  counter += 1;
  repo = new DexieRepository(`pinok-memory-${counter}`);
});
afterEach(async () => {
  await repo.destroy();
});

describe("память тренера", () => {
  it("сохраняет факты и не дублирует одинаковые", async () => {
    await saveMemory(repo, "gromov", [{ fact: "Любит приседания", kind: "fact" }], 1);
    await saveMemory(repo, "gromov", [{ fact: "любит  приседания!", kind: "fact" }], 2);
    expect(await repo.listMemory("gromov")).toHaveLength(1);
  });

  it("не хранит личные данные: телефоны, почту, ссылки, адреса", async () => {
    const saved = await saveMemory(
      repo,
      "gromov",
      [
        { fact: "телефон 89161234567", kind: "fact" },
        { fact: "пишите на a@b.ru", kind: "fact" },
        { fact: "живёт на ул. Ленина", kind: "fact" },
      ],
      1,
    );
    expect(saved).toBe(0);
    expect(await repo.listMemory("gromov")).toHaveLength(0);
  });

  it("держит не больше десяти записей: сначала вытесняются старые факты, ограничения — последними", async () => {
    await saveMemory(repo, "gromov", [{ fact: "колено: осторожно", kind: "limitation" }], 0);
    for (let i = 1; i <= 14; i += 1) {
      await saveMemory(repo, "gromov", [{ fact: `факт номер ${i}`, kind: "fact" }], i);
    }
    const all = await repo.listMemory("gromov");
    expect(all).toHaveLength(MEMORY_LIMIT);
    expect(all.some((m) => m.kind === "limitation")).toBe(true);
    expect(all.some((m) => m.fact === "факт номер 1")).toBe(false);
    expect(all.some((m) => m.fact === "факт номер 14")).toBe(true);
  });

  it("у каждого тренера своя память", async () => {
    await saveMemory(repo, "gromov", [{ fact: "для громова", kind: "fact" }], 1);
    expect(await repo.listMemory("marina")).toHaveLength(0);
  });
});
