import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DexieRepository } from "@/lib/data/dexieRepository";
import { defaultUserCoach } from "@/lib/data/defaults";
import { SCRIPTED_BANKS } from "@/lib/coach/scripted";
import { shouldNotify } from "@/lib/notifications/local";
import { buildNotices, syncPush, type PushNotice } from "@/lib/notifications/pushClient";
import {
  isAllowedEndpoint,
  MAX_LATE_MS,
  parseSubscribeBody,
  removeSubscription,
  resetPushForTests,
  runTick,
  saveSubscription,
  type SendFn,
} from "@/lib/server/push";
import { resetUsageForTests } from "@/lib/server/usage";

const at = (h: number, m = 0, d = 20) => new Date(2026, 9, d, h, m).getTime();
const NOW = at(10);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function body(extra: Record<string, unknown> = {}) {
  return {
    anonId: "anon-1234-abcd",
    subscription: { endpoint: ENDPOINT, keys: { p256dh: "p256", auth: "auth" } },
    notices: [
      {
        id: "reminder|gromov|2026-10-20",
        at: at(17, 30),
        title: "Громов",
        body: "Полчаса до старта.",
        url: "/chat/gromov",
      },
    ],
    ...extra,
  };
}

describe("проверка запроса подписки", () => {
  it("принимает нормальный запрос", () => {
    const parsed = parseSubscribeBody(body(), NOW);
    expect(parsed?.anonId).toBe("anon-1234-abcd");
    expect(parsed?.notices).toHaveLength(1);
  });

  it.each([
    [
      "адрес не из списка push-сервисов",
      { subscription: { endpoint: "https://evil.example/x", keys: { p256dh: "a", auth: "b" } } },
    ],
    [
      "http вместо https",
      {
        subscription: { endpoint: "http://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } },
      },
    ],
    [
      "локальный адрес",
      { subscription: { endpoint: "https://127.0.0.1/x", keys: { p256dh: "a", auth: "b" } } },
    ],
    ["нет ключей", { subscription: { endpoint: ENDPOINT, keys: {} } }],
    ["плохой anonId", { anonId: "../x" }],
  ])("отклоняет: %s", (_n, extra) => {
    expect(parseSubscribeBody(body(extra), NOW)).toBeNull();
  });

  it("плохие уведомления отбрасываются по одному, остальные остаются", () => {
    const parsed = parseSubscribeBody(
      body({
        notices: [
          { id: "ok", at: at(17), title: "Т", body: "Б", url: "/chat/gromov" },
          { id: "далеко", at: at(17, 0, 30), title: "Т", body: "Б", url: "/" },
          { id: "чужой-адрес", at: at(17), title: "Т", body: "Б", url: "//evil.example" },
          { id: "длинный", at: at(17), title: "Т", body: "Б".repeat(500), url: "/" },
          { id: "пустой", at: at(17), title: "", body: "Б", url: "/" },
          "мусор",
        ],
      }),
      NOW,
    );
    expect(parsed?.notices.map((n) => n.id)).toEqual(["ok"]);
  });

  it("разрешены только известные push-сервисы", () => {
    for (const ok of [
      "https://fcm.googleapis.com/x",
      "https://updates.push.services.mozilla.com/x",
      "https://web.push.apple.com/x",
      "https://wns2-par02p.notify.windows.com/x",
    ])
      expect(isAllowedEndpoint(ok)).toBe(true);
    for (const bad of [
      "https://googleapis.com.evil.io/x",
      "https://evilgoogleapis.com/x",
      "not a url",
    ]) {
      expect(isAllowedEndpoint(bad)).toBe(false);
    }
  });
});

describe("отправка по расписанию (tick)", () => {
  beforeEach(() => {
    resetPushForTests();
    resetUsageForTests();
  });

  it("отправляет наступившее один раз, не отправляет будущее и сильно опоздавшее", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue();
    await saveSubscription(
      parseSubscribeBody(
        body({
          notices: [
            { id: "late", at: NOW - MAX_LATE_MS - 60_000, title: "А", body: "опоздало", url: "/" },
            { id: "now", at: NOW - 60_000, title: "Б", body: "пора", url: "/chat/gromov" },
            { id: "future", at: NOW + HOUR, title: "В", body: "потом", url: "/" },
          ],
        }),
        NOW,
      )!,
      NOW,
    );
    const first = await runTick(NOW, send);
    expect(first).toEqual({ sent: 1, failed: 0, removed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toMatchObject({
      title: "Б",
      body: "пора",
      url: "/chat/gromov",
      tag: "now",
    });
    expect((await runTick(NOW + 1000, send)).sent).toBe(0);
    // позже наступает и третье
    expect((await runTick(NOW + 2 * HOUR, send)).sent).toBe(1);
  });

  it("мёртвая подписка (410) удаляется, временная ошибка — нет", async () => {
    await saveSubscription(
      parseSubscribeBody(
        body({ notices: [{ id: "a", at: NOW - 1000, title: "А", body: "Б", url: "/" }] }),
        NOW,
      )!,
      NOW,
    );
    const gone = vi
      .fn<SendFn>()
      .mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await runTick(NOW, gone)).toEqual({ sent: 0, failed: 0, removed: 1 });
    expect(await runTick(NOW + 1, gone)).toEqual({ sent: 0, failed: 0, removed: 0 });

    await saveSubscription(
      parseSubscribeBody(
        body({ notices: [{ id: "a", at: NOW - 1000, title: "А", body: "Б", url: "/" }] }),
        NOW,
      )!,
      NOW,
    );
    const flaky = vi.fn<SendFn>().mockRejectedValue(new Error("timeout"));
    expect(await runTick(NOW, flaky)).toEqual({ sent: 0, failed: 1, removed: 0 });
    const ok = vi.fn<SendFn>().mockResolvedValue();
    expect((await runTick(NOW + 5, ok)).sent).toBe(1); // повторная попытка удалась
  });

  it("новая синхронизация заменяет список, но уже отправленное не повторяется", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue();
    const one = { id: "a", at: NOW - 1000, title: "А", body: "Б", url: "/" };
    await saveSubscription(parseSubscribeBody(body({ notices: [one] }), NOW)!, NOW);
    await runTick(NOW, send);
    await saveSubscription(
      parseSubscribeBody(body({ notices: [one, { ...one, id: "b" }] }), NOW)!,
      NOW,
    );
    const report = await runTick(NOW + 1, send);
    expect(report.sent).toBe(1);
    expect(send.mock.calls.map((c) => c[1].tag)).toEqual(["a", "b"]);
  });

  it("отписка убирает всё", async () => {
    await saveSubscription(parseSubscribeBody(body(), NOW)!, NOW);
    expect(await removeSubscription("anon-1234-abcd")).toBe(true);
    expect(await removeSubscription("anon-1234-abcd")).toBe(false);
  });
});

const HOUR = 3_600_000;

describe("уведомления на 48 часов для сервера", () => {
  const profile = {
    notifFrequency: "normal" as const,
    supportPausedUntil: null,
    onboardingDone: true,
    quietStart: "22:00",
    quietEnd: "08:00",
    ageBand: "18+" as const,
    harshness: 2 as const,
  };
  const coaches = [{ ...defaultUserCoach("gromov", 0), unlocked: true }];
  const scheduled = [
    {
      id: "s1",
      coachId: "gromov" as const,
      planId: "legs-20",
      scheduledAt: at(18, 0, 21),
      status: "planned" as const,
    },
  ];

  it("тексты — из банка тренера и стабильны между вызовами", () => {
    const input = { profile, coaches, scheduled, sessions: [], log: [], now: NOW };
    const a = buildNotices(input);
    const b = buildNotices(input);
    expect(a).toEqual(b);
    expect(a.map((n) => n.id)).toEqual([
      "morning|gromov|2026-10-21",
      "reminder|gromov|2026-10-21",
      "poke|gromov|2026-10-21",
    ]);
    const reminderTexts = SCRIPTED_BANKS.gromov.reminder.map((l) => l.text);
    expect(reminderTexts).toContain(a[1]!.body);
    expect(a.every((n) => n.title === "Сержант Громов" && n.url === "/chat/gromov")).toBe(true);
  });
});

describe("синхронизация подписки", () => {
  let repo: DexieRepository;
  let counter = 0;
  beforeEach(async () => {
    counter += 1;
    repo = new DexieRepository(`pinok-push-${counter}`);
    await repo.updateProfile({ onboardingDone: true, ageBand: "18+", name: "А" });
    await repo.putScheduled({
      id: "s1",
      coachId: "gromov",
      planId: "legs-20",
      scheduledAt: at(18, 0, 21),
      status: "planned",
    });
  });
  afterEach(async () => {
    await repo.destroy();
  });

  const registration = (existing: boolean) =>
    ({
      pushManager: {
        getSubscription: async () =>
          existing
            ? { toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }) }
            : null,
        subscribe: async () => ({
          toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }),
        }),
      },
    }) as unknown as ServiceWorkerRegistration;

  function fetchMock(enabled: boolean, postOk = true) {
    return vi.fn(async (url: string) => {
      if (url === "/api/push/config") {
        return new Response(
          JSON.stringify(
            enabled ? { enabled: true, publicKey: "QUJDREVGR0g" } : { enabled: false },
          ),
        );
      }
      return new Response(JSON.stringify({ ok: postOk }), { status: postOk ? 200 : 500 });
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  }

  it("без разрешения или при частоте «Выкл» ничего не отправляет", async () => {
    const fetchImpl = fetchMock(true);
    expect(
      await syncPush(repo, NOW, {
        fetchImpl,
        permission: () => "default",
        registration: async () => registration(false),
      }),
    ).toBe("off");
    await repo.updateProfile({ notifFrequency: "off" });
    expect(
      await syncPush(repo, NOW, {
        fetchImpl,
        permission: () => "granted",
        registration: async () => registration(false),
      }),
    ).toBe("off");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("сервер без ключей — «недоступно»", async () => {
    const fetchImpl = fetchMock(false);
    expect(
      await syncPush(repo, NOW, {
        fetchImpl,
        permission: () => "granted",
        registration: async () => registration(false),
      }),
    ).toBe("unavailable");
  });

  it("отправляет подписку и уведомления, а повторный вызов без изменений ничего не шлёт", async () => {
    const fetchImpl = fetchMock(true);
    const deps = {
      fetchImpl,
      permission: () => "granted" as const,
      registration: async () => registration(false),
    };
    expect(await syncPush(repo, NOW, deps)).toBe("synced");
    const post = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "/api/push/subscribe",
    )!;
    const sent = JSON.parse(post[1].body as string) as { anonId: string; notices: PushNotice[] };
    expect(sent.anonId).toBe((await repo.getProfile()).anonId);
    expect(sent.notices.map((n) => n.id)).toContain("reminder|gromov|2026-10-21");

    const before = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(await syncPush(repo, NOW + 1000, deps)).toBe("unchanged");
    // config запрашивается, а POST — нет
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1);
  });

  it("ошибка сервера — «failed» без падения; выключили уведомления — подписка снимается", async () => {
    const bad = fetchMock(true, false);
    expect(
      await syncPush(repo, NOW, {
        fetchImpl: bad,
        permission: () => "granted",
        registration: async () => registration(true),
      }),
    ).toBe("failed");

    const ok = fetchMock(true);
    const deps = {
      fetchImpl: ok,
      permission: () => "granted" as const,
      registration: async () => registration(true),
    };
    expect(await syncPush(repo, NOW, deps)).toBe("synced");
    await repo.updateProfile({ notifFrequency: "off" });
    expect(await syncPush(repo, NOW + 10, deps)).toBe("off");
    const calls = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => c[0] === "/api/push/subscribe" && c[1]?.method === "DELETE")).toBe(
      true,
    );
  });
});

describe("когда показывать системное уведомление", () => {
  it("только если разрешено и человек не смотрит в приложение", () => {
    expect(shouldNotify("hidden", "granted")).toBe(true);
    expect(shouldNotify("visible", "granted")).toBe(false);
    expect(shouldNotify("hidden", "default")).toBe(false);
    expect(shouldNotify("hidden", "denied")).toBe(false);
    expect(shouldNotify("hidden", "unsupported")).toBe(false);
  });
});
