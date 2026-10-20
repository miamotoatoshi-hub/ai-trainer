import { expect, test } from "@playwright/test";
import gromovScripted from "../../content/coaches/gromov/scripted.json";
import { hasNoHorizontalOverflow, openDemo } from "./helpers";

test.describe("главный экран «Тренеры»", () => {
  test("показывает карточку-героя, четырёх тренеров и заблокированный слот", async ({ page }) => {
    await openDemo(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();

    const hero = page.locator("section", { hasText: "Ноги. 20 минут." });
    await expect(hero).toContainText("СЕГОДНЯ · 18:00");
    await expect(hero).toContainText("Громов уже ждёт. Не заставляй его звонить первым.");
    await expect(hero).toContainText("Серия 5 дней");
    await expect(hero.getByRole("button", { name: "Позвонить" })).toBeVisible();

    await expect(page.getByText("4 тренера")).toBeVisible();
    const rows = page.getByRole("link", { name: /Открыть чат/ });
    await expect(rows).toHaveCount(4);
    // сначала непрочитанные: Громов (3), затем Палыч (1)
    await expect(rows.nth(0)).toContainText("Громов");
    await expect(rows.nth(0)).toContainText("Презирает");
    await expect(rows.nth(0)).toContainText(
      "Ты где был вчера? В 18:00 жду. Опоздаешь — пожалеешь.",
    );
    await expect(rows.nth(1)).toContainText("Палыч");
    await expect(rows.nth(1)).toContainText("Голосовое · 0:14");
    await expect(rows.nth(2)).toContainText("Марина");
    await expect(rows.nth(2)).toContainText("Игнорирует");
    await expect(rows.nth(2)).toContainText("без ответа");
    await expect(rows.nth(3)).toContainText("Макс");
    await expect(rows.nth(3)).toContainText("12 окт.");

    await expect(page.getByText("Новый тренер")).toBeVisible();
    await expect(page.getByText("Откроется, когда Громов начнёт тебя уважать")).toBeVisible();
    await page.screenshot({ path: "test-results/screens/home-390.png" });
  });

  test("поиск фильтрует чаты", async ({ page }) => {
    await openDemo(page, "/");
    await expect(page.getByRole("link", { name: /Открыть чат/ })).toHaveCount(4);
    await page.getByRole("button", { name: "Поиск" }).click();
    await page.getByRole("searchbox").fill("мари");
    await expect(page.getByRole("link", { name: /Открыть чат/ })).toHaveCount(1);
    await page.getByRole("searchbox").fill("абракадабра");
    await expect(page.getByText("Ничего не найдено")).toBeVisible();
  });

  test("нижняя навигация ведёт по вкладкам", async ({ page }) => {
    await openDemo(page, "/");
    const nav = page.getByRole("navigation", { name: "Основная навигация" });
    await expect(nav.getByRole("link", { name: "Чаты" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Рейтинг" }).click();
    await expect(page).toHaveURL(/\/rating$/);
    await expect(nav.getByRole("link", { name: "Рейтинг" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("чат с тренером", () => {
  test("Громов: шапка, отношение, лента, карточка тренировки", async ({ page }) => {
    await openDemo(page, "/chat/gromov");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сержант Громов");
    await expect(page.getByTestId("coach-status")).toHaveText("в сети · ждёт тебя");
    await expect(page.getByText("ОТНОШЕНИЕ")).toBeVisible();
    await expect(
      page.getByText("Ещё 3 тренировки без пропусков — и он начнёт тебя терпеть"),
    ).toBeVisible();

    const feed = page.getByTestId("chat-feed");
    await expect(feed).toContainText("Вчера");
    await expect(feed).toContainText("Сегодня");
    await expect(feed).toContainText("Молчишь. Понятно.");
    await expect(feed).toContainText("Тренировка: ноги");
    await expect(feed).toContainText("Сегодня, 18:00 · 20 минут · камера");
    await expect(page.getByRole("button", { name: "Начать звонок" })).toBeVisible();
    await expect(page.getByPlaceholder("Оправдывайся тут…")).toBeVisible();
    // сообщения не дублируются
    await expect(
      feed.getByText("Ты где был вчера? В 18:00 жду. Опоздаешь — пожалеешь."),
    ).toHaveCount(1);
    await page.screenshot({ path: "test-results/screens/chat-gromov-390.png" });
  });

  test("Марина игнорирует: статус, подсказка и «прочитано»", async ({ page }) => {
    await openDemo(page, "/chat/marina");
    await expect(page.getByTestId("coach-status")).toHaveText("прочитала · не отвечает");
    await expect(page.getByText("Игнор снимается только делом: заверши тренировку.")).toBeVisible();
    await expect(page.getByPlaceholder("Только коротко…")).toBeVisible();
    await expect(page.getByText("Прости, завтра точно приду")).toBeVisible();
    await expect(page.getByText("Прочитано")).toBeVisible();
  });

  test("переход из списка в чат и обратно", async ({ page }) => {
    await openDemo(page, "/");
    await page.getByRole("link", { name: /Открыть чат: Палыч/ }).click();
    await expect(page).toHaveURL(/\/chat\/palych$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дед Палыч");
    await page.getByRole("link", { name: "Назад" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("неизвестный тренер → 404", async ({ page }) => {
    const response = await page.goto("/chat/nobody");
    expect(response?.status()).toBe(404);
  });
});

for (const width of [360, 390, 430]) {
  test.describe(`ширина ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const path of ["/", "/chat/gromov", "/chat/marina"]) {
      test(`${path}: нет горизонтальной прокрутки`, async ({ page }) => {
        await openDemo(page, path);
        await expect(page.getByRole("heading").first()).toBeVisible();
        await page.waitForTimeout(600);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
      });
    }

    test("нажимаемые элементы не меньше 44×44", async ({ page }) => {
      await openDemo(page, "/");
      await expect(page.getByRole("link", { name: /Открыть чат/ })).toHaveCount(4);
      for (const path of ["/", "/chat/gromov"]) {
        if (path !== "/") {
          await page.goto(`${path}`);
          await expect(page.getByTestId("chat-feed")).toContainText("Молчишь");
        }
        const small = await page.evaluate(() => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("button, a[href], summary")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.width < 43.5 || r.height < 43.5) {
              bad.push(
                `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
              );
            }
          }
          return bad;
        });
        expect(small, `маленькие элементы на ${path}`).toEqual([]);
      }
    });
  });
}

test.describe("ответы тренера в чате (без ключа нейросети)", () => {
  test("на «привет» тренер отвечает фразой из своей базы и ставит «прочитано»", async ({
    page,
  }) => {
    await openDemo(page, "/chat/gromov");
    const feed = page.getByTestId("chat-feed");
    await page.getByLabel("Сообщение тренеру").fill("привет");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(feed).toContainText("привет");
    // пока тренер «печатает», в шапке видно статус
    await expect(page.getByTestId("coach-status")).toContainText("печатает", { timeout: 6000 });

    const greetings = (gromovScripted.lines.greeting as (string | string[])[]).map((l) =>
      typeof l === "string" ? l : l[0]!,
    );
    await expect
      .poll(
        async () => {
          const text = (await feed.textContent()) ?? "";
          return greetings.some((g) => text.includes(g));
        },
        { timeout: 15000 },
      )
      .toBe(true);
  });

  test("на жалобу на боль тренер говорит остановиться, а не шутит", async ({ page }) => {
    await openDemo(page, "/chat/gromov");
    await page.getByLabel("Сообщение тренеру").fill("у меня болит колено");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByTestId("chat-feed")).toContainText("прекращай нагрузку", {
      timeout: 12000,
    });
  });

  test("при кризисе в чате появляется карточка с помощью, она ведёт на «Помощь рядом»", async ({
    page,
  }) => {
    await openDemo(page, "/chat/gromov");
    await page.getByLabel("Сообщение тренеру").fill("я не хочу жить");
    await page.getByRole("button", { name: "Отправить" }).click();
    const card = page.getByRole("link", { name: /Помощь рядом/ });
    await expect(card).toBeVisible({ timeout: 12000 });
    await card.click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole("heading", { level: 1, name: "Помощь рядом" })).toBeVisible();
    await expect(page.getByRole("link", { name: /8-800-2000-122/ })).toHaveAttribute(
      "href",
      "tel:88002000122",
    );
    await expect(page.getByRole("link", { name: /112/ })).toBeVisible();
  });

  test("кнопка микрофона: зажать и говорить (без поддержки в браузере — отключена с пояснением)", async ({
    page,
  }) => {
    await openDemo(page, "/chat/gromov");
    const mic = page.getByTestId("mic-button");
    await expect(mic).toBeVisible();
    const supported = await page.evaluate(
      () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    );
    if (supported) await expect(mic).toBeEnabled();
    else await expect(mic).toBeDisabled();
  });
});

test.describe("служебные страницы", () => {
  test("расходы /admin/costs закрыты без токена, открываются с токеном и не индексируются", async ({
    page,
  }) => {
    await page.goto("/admin/costs");
    await expect(page.getByTestId("admin-locked")).toContainText("Доступ закрыт");
    await page.goto("/admin/costs?token=wrong");
    await expect(page.getByTestId("admin-locked")).toBeVisible();

    await page.goto("/admin/costs?token=e2e-admin-token");
    await expect(page.getByTestId("admin-costs")).toContainText("Расходы по дням");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
