import { vapidConfig } from "@/lib/server/push";

export const runtime = "nodejs";

/** GET /api/push/config — включён ли Web Push и какой публичный ключ использовать для подписки. */
export async function GET(): Promise<Response> {
  const config = vapidConfig();
  return Response.json(
    config ? { enabled: true, publicKey: config.publicKey } : { enabled: false },
  );
}
