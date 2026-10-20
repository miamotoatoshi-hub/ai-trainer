import { getCoach } from "@/lib/coach/coaches";
import { pickScripted } from "@/lib/coach/scripted";
import type { Repository } from "@/lib/data/repository";
import type { Profile, ScheduledWorkout, UserCoach, WorkoutSession } from "@/lib/data/types";
import { HOUR } from "@/lib/time";
import { currentPermission, type PermissionResult } from "./permission";
import { missedStreak, toneLevel, upcomingAwayMessages, type AwayKind } from "./rules";

/** Что уходит на сервер: время, текст в характере тренера и куда вести нажатие. */
export interface PushNotice {
  id: string;
  at: number;
  title: string;
  body: string;
  url: string;
}

export const PUSH_HORIZON_MS = 48 * HOUR;
const RESYNC_MS = 6 * HOUR;
const META_KEY = "pushSync";

/** Стабильное «случайное» число из строки: один и тот же id всегда даёт одну и ту же реплику. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
}

export interface NoticeInput {
  profile: Pick<
    Profile,
    | "notifFrequency"
    | "supportPausedUntil"
    | "onboardingDone"
    | "quietStart"
    | "quietEnd"
    | "ageBand"
    | "harshness"
  >;
  coaches: readonly UserCoach[];
  scheduled: readonly ScheduledWorkout[];
  sessions: readonly Pick<WorkoutSession, "status" | "endedAt" | "startedAt">[];
  log: readonly { kind: string; coachId: UserCoach["coachId"]; day: string; sentAt: number }[];
  now: number;
}

/** Уведомления на ближайшие 48 часов по тем же правилам, что и сообщения в чате. */
export function buildNotices(input: NoticeInput): PushNotice[] {
  const upcoming = upcomingAwayMessages({
    profile: input.profile,
    coaches: input.coaches,
    scheduled: input.scheduled,
    log: input.log,
    now: input.now,
    horizonMs: PUSH_HORIZON_MS,
  });
  const tone = toneLevel(input.profile, missedStreak(input.scheduled, input.sessions, input.now));
  return upcoming.map((m) => {
    const id = `${m.kind}|${m.coachId}|${m.day}`;
    const kind: AwayKind = m.kind;
    return {
      id,
      at: m.at,
      title: getCoach(m.coachId).fullName,
      body: pickScripted(m.coachId, kind, tone, { rng: seeded(id) }),
      url: `/chat/${m.coachId}`,
    };
  });
}

function toKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface PushDeps {
  fetchImpl?: typeof fetch;
  permission?: () => PermissionResult;
  registration?: () => Promise<ServiceWorkerRegistration | null>;
}

export type PushSyncResult = "off" | "unavailable" | "unchanged" | "synced" | "failed";

interface SyncMeta {
  signature: string;
  at: number;
}

/**
 * Передаёт серверу подписку и ближайшие уведомления. Если Web Push не настроен на сервере
 * (нет ключей) или человек выключил уведомления — ничего не делает.
 */
export async function syncPush(
  repo: Repository,
  now: number,
  deps: PushDeps = {},
): Promise<PushSyncResult> {
  const doFetch = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const permission = (deps.permission ?? currentPermission)();
  const profile = await repo.getProfile();
  if (permission !== "granted" || profile.notifFrequency === "off" || !profile.onboardingDone) {
    // Раньше подписывались, а теперь выключили — снимаем подписку на сервере.
    if (await repo.getMeta<SyncMeta>(META_KEY)) {
      await unsubscribePush(profile.anonId, doFetch);
      await repo.setMeta(META_KEY, undefined);
    }
    return "off";
  }
  try {
    const config = (await (await doFetch("/api/push/config")).json()) as {
      enabled?: boolean;
      publicKey?: string;
    };
    if (!config.enabled || !config.publicKey) return "unavailable";

    const registration = await (deps.registration
      ? deps.registration()
      : navigator.serviceWorker.ready);
    if (!registration?.pushManager) return "unavailable";
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(config.publicKey),
      }));

    const [coaches, scheduled, sessions, log] = await Promise.all([
      repo.listUserCoaches(),
      repo.listScheduled(),
      repo.listSessions(60),
      repo.listNotificationLog(now - 2 * 24 * HOUR),
    ]);
    const notices = buildNotices({ profile, coaches, scheduled, sessions, log, now });
    const json = subscription.toJSON();
    const signature = JSON.stringify([json.endpoint, notices.map((n) => [n.id, n.at, n.body])]);
    const last = await repo.getMeta<SyncMeta>(META_KEY);
    if (last && last.signature === signature && now - last.at < RESYNC_MS) return "unchanged";

    const response = await doFetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anonId: profile.anonId, subscription: json, notices }),
    });
    if (!response.ok) return "failed";
    await repo.setMeta(META_KEY, { signature, at: now } satisfies SyncMeta);
    return "synced";
  } catch {
    return "failed";
  }
}

/** Отписка на сервере (данные удалены или уведомления выключены). Ошибки не важны. */
export async function unsubscribePush(
  anonId: string,
  doFetch: typeof fetch = (input, init) => fetch(input, init),
): Promise<void> {
  try {
    await doFetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anonId }),
    });
  } catch {
    // сервер недоступен — подписка отомрёт сама
  }
}
