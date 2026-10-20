import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Web Push (необязательно): отправка уведомлений, пока приложение закрыто.
 * Клиент присылает свою подписку и список того, что тренеры должны написать в ближайшие 48 часов;
 * сервер по расписанию (вызов /api/push/tick) отправляет то, что наступило.
 * Хранится в памяти процесса и в .data/push.json — для постоянного хостинга. На serverless-хостинге
 * без постоянного диска доставка при закрытом приложении ненадёжна (см. README).
 */

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface StoredNotice {
  id: string;
  /** Когда отправить, мс. */
  at: number;
  title: string;
  body: string;
  url: string;
}

interface Entry {
  subscription: PushSubscriptionData;
  notices: StoredNotice[];
  sent: string[];
  updatedAt: number;
}

type PushData = Record<string, Entry>;

const FILE = path.join(process.cwd(), ".data", "push.json");
let state: PushData | null = null;
let loading: Promise<PushData> | null = null;

async function load(): Promise<PushData> {
  if (state) return state;
  loading ??= (async () => {
    try {
      state = JSON.parse(await fs.readFile(FILE, "utf8")) as PushData;
    } catch {
      state = {};
    }
    return state;
  })();
  return loading;
}

async function persist(data: PushData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data));
  } catch {
    // Нет прав на запись — остаёмся с памятью процесса.
  }
}

export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
    process.env.VAPID_PUBLIC_KEY ??
    ""
  ).trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim() || "mailto:owner@example.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

/** Сервисы, которые выдают адреса подписок. Любой другой адрес отвергается, чтобы сервер не слал запросы куда попало. */
const PUSH_HOST_SUFFIXES = [
  "googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_HOST_SUFFIXES.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SubscribeBody {
  anonId: string;
  subscription: PushSubscriptionData;
  notices: StoredNotice[];
}

const MAX_NOTICES = 24;

/** Проверка тела запроса: размеры, адрес подписки и время уведомлений. */
export function parseSubscribeBody(raw: unknown, now: number): SubscribeBody | null {
  if (!isRecord(raw) || !isRecord(raw.subscription)) return null;
  const anonId = typeof raw.anonId === "string" ? raw.anonId : "";
  const sub = raw.subscription;
  const keys = isRecord(sub.keys) ? sub.keys : {};
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "";
  if (!/^[A-Za-z0-9-]{8,80}$/.test(anonId)) return null;
  if (endpoint.length > 600 || !isAllowedEndpoint(endpoint)) return null;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  if (keys.p256dh.length > 200 || keys.auth.length > 100) return null;

  const notices: StoredNotice[] = [];
  const list = Array.isArray(raw.notices) ? raw.notices.slice(0, MAX_NOTICES) : [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const { id, at, title, body, url } = item;
    if (
      typeof id !== "string" ||
      id.length > 120 ||
      typeof at !== "number" ||
      !Number.isFinite(at) ||
      at < now - 24 * 3_600_000 ||
      at > now + 4 * 24 * 3_600_000 ||
      typeof title !== "string" ||
      title.length === 0 ||
      title.length > 60 ||
      typeof body !== "string" ||
      body.length === 0 ||
      body.length > 200 ||
      typeof url !== "string" ||
      !url.startsWith("/") ||
      url.startsWith("//") ||
      url.length > 100
    ) {
      continue;
    }
    notices.push({ id, at, title, body, url });
  }
  return {
    anonId,
    subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    notices,
  };
}

/** Запоминает подписку и список уведомлений (прежний список заменяется; уже отправленные не повторяются). */
export async function saveSubscription(body: SubscribeBody, now: number): Promise<void> {
  const data = await load();
  const previous = data[body.anonId];
  const ids = new Set(body.notices.map((n) => n.id));
  data[body.anonId] = {
    subscription: body.subscription,
    notices: body.notices,
    sent: (previous?.sent ?? []).filter((id) => ids.has(id)),
    updatedAt: now,
  };
  await persist(data);
}

export async function removeSubscription(anonId: string): Promise<boolean> {
  const data = await load();
  if (!data[anonId]) return false;
  delete data[anonId];
  await persist(data);
  return true;
}

export type SendFn = (
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url: string; tag: string },
) => Promise<void>;

export interface TickReport {
  sent: number;
  failed: number;
  removed: number;
}

/** Не отправляем то, что опоздало больше чем на 2 часа: утреннее «подъём» вечером бессмысленно. */
export const MAX_LATE_MS = 2 * 3_600_000;

/** Отправляет всё, что наступило. Мёртвые подписки (404/410) удаляются. */
export async function runTick(now: number, send: SendFn): Promise<TickReport> {
  const data = await load();
  const report: TickReport = { sent: 0, failed: 0, removed: 0 };
  for (const [anonId, entry] of Object.entries(data)) {
    const due = entry.notices.filter(
      (n) => n.at <= now && n.at > now - MAX_LATE_MS && !entry.sent.includes(n.id),
    );
    for (const notice of due) {
      try {
        await send(entry.subscription, {
          title: notice.title,
          body: notice.body,
          url: notice.url,
          tag: notice.id,
        });
        entry.sent.push(notice.id);
        report.sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          delete data[anonId];
          report.removed += 1;
          break;
        }
        report.failed += 1;
      }
    }
    // Старое чистим, чтобы файл не рос.
    if (data[anonId]) {
      entry.notices = entry.notices.filter((n) => n.at > now - 24 * 3_600_000);
      const keep = new Set(entry.notices.map((n) => n.id));
      entry.sent = entry.sent.filter((id) => keep.has(id));
    }
  }
  await persist(data);
  return report;
}

/** Только для тестов. */
export function resetPushForTests(): void {
  state = {};
  loading = null;
}
