import type { Repository } from "@/lib/data/repository";
import type { CoachId } from "@/lib/data/types";
import { checkCoachReply } from "@/lib/safety/guard";
import { LIMITS, type MemoryItem } from "./types";

/** Не больше десяти записей на тренера (раздел 6 ТЗ); травмы и ограничения вытесняются последними. */
export const MEMORY_LIMIT = LIMITS.memoryItems;

/** Личные данные в память не попадают: телефоны, почты, ссылки, адреса. */
const PERSONAL = /\d{5,}|@|https?:|www\.|(?<![а-яё])(?:ул\.|улица|проспект|кв\.|дом \d)/i;

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^а-яёa-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Можно ли хранить такую запись. */
export function isStorable(item: MemoryItem): boolean {
  const fact = item.fact.trim();
  if (fact.length < 3) return false;
  if (PERSONAL.test(fact)) return false;
  return checkCoachReply(fact).ok || item.kind === "limitation";
}

/**
 * Сохраняет новые записи в память тренера: без повторов, не длиннее лимита.
 * При переполнении вытесняются самые старые обычные факты, а ограничения по здоровью живут дольше.
 */
export async function saveMemory(
  repo: Repository,
  coachId: CoachId,
  items: readonly MemoryItem[],
  now: number,
): Promise<number> {
  let saved = 0;
  for (const item of items) {
    const fact = item.fact.trim().slice(0, LIMITS.memoryText);
    if (!isStorable({ ...item, fact })) continue;
    const existing = await repo.listMemory(coachId);
    if (existing.some((m) => norm(m.fact) === norm(fact))) continue;

    let overflow = existing.length + 1 - MEMORY_LIMIT;
    if (overflow > 0) {
      const victims = [
        ...existing.filter((m) => m.kind === "fact"),
        ...existing.filter((m) => m.kind === "limitation"),
      ].sort(
        (a, b) =>
          Number(a.kind === "limitation") - Number(b.kind === "limitation") ||
          a.createdAt - b.createdAt,
      );
      for (const victim of victims) {
        if (overflow <= 0) break;
        await repo.deleteMemory(victim.id);
        overflow -= 1;
      }
    }
    await repo.addMemory({ coachId, fact, kind: item.kind, createdAt: now });
    saved += 1;
  }
  return saved;
}
