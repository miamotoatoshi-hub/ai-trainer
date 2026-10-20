import type { Repository } from "@/lib/data/repository";
import { weekKey } from "./week";

export interface Friend {
  id: string;
  name: string;
  /** Чистых повторений за неделю `week` на момент, когда друг прислал ссылку. */
  weekly: number;
  week: string;
  receivedAt: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  weekly: number;
  me: boolean;
  /** Данные друга за прошлую неделю: он давно не присылал свежую ссылку. */
  stale: boolean;
}

const FRIENDS_KEY = "friends";
export const MAX_FRIENDS = 30;

export async function listFriends(repo: Repository): Promise<Friend[]> {
  return (await repo.getMeta<Friend[]>(FRIENDS_KEY)) ?? [];
}

/** Добавляет друга или обновляет его результат (ссылка того же человека заменяет прежнюю). */
export async function upsertFriend(repo: Repository, friend: Friend): Promise<Friend[]> {
  const rest = (await listFriends(repo)).filter((f) => f.id !== friend.id);
  const next = [friend, ...rest].slice(0, MAX_FRIENDS);
  await repo.setMeta(FRIENDS_KEY, next);
  return next;
}

export async function removeFriend(repo: Repository, id: string): Promise<void> {
  const next = (await listFriends(repo)).filter((f) => f.id !== id);
  await repo.setMeta(FRIENDS_KEY, next);
}

/** Таблица недели: ты и друзья по чистым повторениям; устаревшие данные друзей идут с нулём. */
export function buildLeaderboard(
  me: { id: string; name: string; weekly: number },
  friends: readonly Friend[],
  now: number,
): LeaderboardEntry[] {
  const current = weekKey(now);
  const entries: LeaderboardEntry[] = [
    { id: me.id, name: me.name, weekly: me.weekly, me: true, stale: false },
    ...friends.map((f) => {
      const stale = f.week !== current;
      return { id: f.id, name: f.name, weekly: stale ? 0 : f.weekly, me: false, stale };
    }),
  ];
  return entries.sort((a, b) => b.weekly - a.weekly || Number(b.me) - Number(a.me));
}
