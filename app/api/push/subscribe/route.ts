import {
  parseSubscribeBody,
  removeSubscription,
  saveSubscription,
  vapidConfig,
} from "@/lib/server/push";

export const runtime = "nodejs";

/** POST /api/push/subscribe — подписка устройства и список ближайших уведомлений. */
export async function POST(request: Request): Promise<Response> {
  if (!vapidConfig()) return Response.json({ ok: false, reason: "no_vapid" }, { status: 501 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  const now = Date.now();
  const body = parseSubscribeBody(raw, now);
  if (!body) return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  await saveSubscription(body, now);
  return Response.json({ ok: true, count: body.notices.length });
}

/** DELETE /api/push/subscribe — отписка (уведомления выключены или данные удалены). */
export async function DELETE(request: Request): Promise<Response> {
  let anonId = "";
  try {
    const body = (await request.json()) as { anonId?: unknown };
    anonId = typeof body.anonId === "string" ? body.anonId : "";
  } catch {
    return Response.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9-]{8,80}$/.test(anonId)) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  return Response.json({ ok: true, removed: await removeSubscription(anonId) });
}
