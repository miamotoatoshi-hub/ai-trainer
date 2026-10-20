import { expect, test, type Page } from "@playwright/test";
import gromov from "../../content/coaches/gromov/scripted.json";

const reminders = (gromov.lines.reminder as (string | string[])[]).map((l) =>
  typeof l === "string" ? l : l[0]!,
);

async function shown(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.getNotifications()).map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      data: n.data as { url: string; settingsUrl: string },
    }));
  });
}

test.describe("уведомления", () => {
  test.use({ permissions: ["notifications"] });

  test("пока приложение в фоне, тренер присылает напоминание за 30 минут; в нём есть путь к настройкам", async ({
    page,
  }) => {
    // Приложение «в фоне»: страница не видна человеку.
    await page.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", {
        get: () => "hidden",
        configurable: true,
      });
    });
    await page.clock.install({ time: new Date(2026, 9, 20, 17, 25) });
    await page.goto("/?demo=1");
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    expect(await shown(page)).toEqual([]);

    // 17:31 — наступило «за 30 минут до тренировки»
    await page.clock.fastForward("06:00");
    await expect.poll(async () => (await shown(page)).length, { timeout: 15_000 }).toBe(1);
    const [notice] = await shown(page);
    expect(notice!.title).toBe("Сержант Громов");
    expect(reminders).toContain(notice!.body);
    expect(notice!.tag).toMatch(/^reminder\|gromov\|2026-10-20$/);
    expect(notice!.data).toEqual({ url: "/chat/gromov", settingsUrl: "/profile#notifications" });

    // то же сообщение лежит и в чате, с карточкой тренировки
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then((r) =>
        r.getNotifications().then((l) => l.forEach((n) => n.close())),
      ),
    );
  });

  test("пока человек смотрит в приложение, системных уведомлений нет, а сообщение приходит в чат", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(2026, 9, 20, 17, 25) });
    await page.goto("/?demo=1");
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.clock.fastForward("06:00");
    await page.goto("/chat/gromov");
    await expect(page.getByTestId("chat-feed")).toContainText("Начать звонок", { timeout: 15_000 });
    expect(await shown(page)).toEqual([]);
  });

  test("в профиле видно состояние разрешения и подсказку про тихие часы для подростка", async ({
    page,
  }) => {
    await page.goto("/profile?demo=1");
    await expect(page.getByTestId("permission-status")).toHaveText("Разрешено");
    await page.getByRole("button", { name: /16–17/ }).click();
    await expect(page.getByText("До 18 лет тихие часы 22:00–08:00 сократить нельзя")).toBeVisible();
  });
});
