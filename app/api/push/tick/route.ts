import webpush from "web-push";
import { runTick, vapidConfig, type SendFn } from "@/lib/server/push";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // Без секрета разрешаем только локальную разработку.
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  const query = new URL(request.url).searchParams.get("secret") ?? "";
  return header === `Bearer ${secret}` || query === secret;
}

/**
 * GET|POST /api/push/tick — отправляет наступившие уведомления. Его должен вызывать планировщик
 * раз в минуту (cron-job.org и подобные, адрес с `?secret=…`). Локально: `pnpm push:loop`.
 */
async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const config = vapidConfig();
  if (!config) return Response.json({ ok: false, reason: "no_vapid" }, { status: 501 });
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const send: SendFn = async (subscription, payload) => {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600 });
  };
  const report = await runTick(Date.now(), send);
  return Response.json({ ok: true, ...report });
}

export const GET = handle;
export const POST = handle;
