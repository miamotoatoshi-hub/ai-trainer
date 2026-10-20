import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPushForTests } from "@/lib/server/push";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { GET as config } from "@/app/api/push/config/route";
import { DELETE, POST as subscribe } from "@/app/api/push/subscribe/route";
import { GET as tick } from "@/app/api/push/tick/route";

const json = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/push/subscribe", { method, body: JSON.stringify(body) });

const valid = () => ({
  anonId: "anon-route-0001",
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/x",
    keys: { p256dh: "p", auth: "a" },
  },
  notices: [
    { id: "n1", at: Date.now() - 1000, title: "Громов", body: "Пора.", url: "/chat/gromov" },
  ],
});

beforeEach(() => {
  resetPushForTests();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({});
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Web Push без ключей", () => {
  it("конфигурация говорит «выключено», подписка и отправка отвечают 501", async () => {
    expect(await (await config()).json()).toEqual({ enabled: false });
    expect((await subscribe(json(valid()))).status).toBe(501);
    expect((await tick(new Request("http://localhost/api/push/tick"))).status).toBe(501);
  });
});

describe("Web Push с ключами", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPublic");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  });

  it("публичный ключ отдаётся, секретный — никогда", async () => {
    const res = await (await config()).json();
    expect(res).toEqual({ enabled: true, publicKey: "BPublic" });
    expect(JSON.stringify(res)).not.toContain("private");
  });

  it("подписка → tick отправляет → повтор ничего не шлёт → отписка", async () => {
    expect((await (await subscribe(json(valid()))).json()).ok).toBe(true);
    const first = await (await tick(new Request("http://localhost/api/push/tick"))).json();
    expect(first).toMatchObject({ ok: true, sent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, payload] = sendNotification.mock.calls[0]!;
    expect(sub.endpoint).toContain("googleapis");
    expect(JSON.parse(payload as string)).toMatchObject({ title: "Громов", url: "/chat/gromov" });
    expect((await (await tick(new Request("http://localhost/api/push/tick"))).json()).sent).toBe(0);

    const del = await DELETE(json({ anonId: "anon-route-0001" }, "DELETE"));
    expect(await del.json()).toEqual({ ok: true, removed: true });
  });

  it("чужой адрес подписки и кривое тело отклоняются", async () => {
    const evil = {
      ...valid(),
      subscription: { endpoint: "https://evil.example/x", keys: { p256dh: "p", auth: "a" } },
    };
    expect((await subscribe(json(evil))).status).toBe(400);
    expect(
      (await subscribe(new Request("http://localhost", { method: "POST", body: "{" }))).status,
    ).toBe(400);
    expect((await DELETE(json({ anonId: "x" }, "DELETE"))).status).toBe(400);
  });

  it("с CRON_SECRET отправка требует секрет", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    await subscribe(json(valid()));
    expect((await tick(new Request("http://localhost/api/push/tick"))).status).toBe(401);
    expect((await tick(new Request("http://localhost/api/push/tick?secret=wrong"))).status).toBe(
      401,
    );
    const ok = await tick(
      new Request("http://localhost/api/push/tick", {
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(ok.status).toBe(200);
    const viaQuery = await tick(new Request("http://localhost/api/push/tick?secret=s3cret"));
    expect(viaQuery.status).toBe(200);
  });
});
