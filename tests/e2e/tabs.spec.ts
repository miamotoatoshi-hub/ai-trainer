import { expect, test, type Page } from "@playwright/test";
import { openDemo, startDemoCall } from "./helpers";

async function copiedText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test.describe("вкладка «Тренировки»", () => {
  test("расписание на неделю, история и каталог с запуском свободной тренировки", async ({
    page,
  }) => {
    await openDemo(page, "/workouts");
    await expect(page.getByRole("heading", { level: 1, name: "Тренировки" })).toBeVisible();
    const week = page.getByTestId("week");
    await expect(week).toContainText("Тренировка: ноги");
    await expect(week).toContainText("Громов");
    await expect(week.getByRole("button", { name: "Позвонить" })).toBeVisible();

    const catalog = page.getByTestId("catalog");
    for (const name of ["Приседания", "Отжимания", "Выпады", "Планка", "Прыжки «джек»"]) {
      await expect(catalog).toContainText(name);
    }
    await page.screenshot({ path: "test-results/screens/workouts-390.png", fullPage: true });

    // свободная: «Отжимания», 1 подход → звонок с этим упражнением
    await catalog
      .locator("li", { hasText: "Отжимания" })
      .getByRole("button", { name: "1 подход" })
      .click();
    await page.waitForURL(/\/call\//);
    await page.goto(`${page.url()}?sim=1&speed=8`);
    await expect(page.getByTestId("caption")).toContainText("Отжимания", { timeout: 40_000 });
  });

  test("после тренировки она появляется в истории", async ({ page }) => {
    const url = await startDemoCall(page);
    await page.goto(`${url}?sim=1&speed=8&kinds=good&plan=quick-check`);
    await page.waitForURL(/\/result\//, { timeout: 90_000 });
    await page.getByRole("link", { name: "Готово" }).click();
    await page.getByRole("link", { name: "Тренировки" }).click();
    const history = page.getByTestId("history");
    await expect(history).toContainText("Приседания");
    await expect(history.locator("li").first()).toContainText("5 повторений");
    await history.locator("li").first().click();
    await expect(page).toHaveURL(/\/result\//);
  });
});

test.describe("вкладка «Рейтинг»", () => {
  test("таблица недели, комментарий тренера и добавление друга по ссылке", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDemo(page, "/rating");
    await expect(page.getByRole("heading", { level: 1, name: "Рейтинг" })).toBeVisible();
    await expect(page.getByTestId("leaderboard").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("rating-comment")).not.toBeEmpty();

    // моя ссылка-приглашение копируется (в обычном браузере её отправили бы через «Поделиться»)
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    const link = await copiedText(page);
    expect(link).toMatch(/\/join\?d=[\w-]+$/);

    // друг открывает ссылку и попадает ко мне в таблицу (здесь — тот же браузер, но ссылка от «другого» человека)
    const friend = Buffer.from(
      JSON.stringify({
        v: 1,
        kind: "friend",
        id: "friend-uuid-0001",
        name: "Аня",
        weekly: 42,
        week: "2026-10-19",
      }),
    ).toString("base64url");
    await page.goto(`/join?d=${friend}`);
    await expect(page.getByTestId("join")).toContainText("Аня зовёт в рейтинг");
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByTestId("join")).toContainText("Аня теперь в твоём рейтинге");
    await page.getByRole("link", { name: "К рейтингу" }).click();
    await expect(page.getByTestId("leaderboard")).toContainText("Аня");
    await page.screenshot({ path: "test-results/screens/rating-390.png", fullPage: true });
    await page.getByRole("button", { name: "Убрать Аня из таблицы" }).click();
    await expect(page.getByTestId("leaderboard").locator("li")).toHaveCount(1);
  });

  test("сломанная ссылка не ломает приложение", async ({ page }) => {
    await openDemo(page, "/join?d=%%%");
    await expect(page.getByTestId("join")).toContainText("Эта ссылка не работает");
  });

  test("дуэль: вызов → принятие другом → ответ → итог у вызвавшего", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctxA = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const ctxB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      // --- игрок А: вызывает ---
      await a.goto("/rating?demo=1");
      await a.getByRole("button", { name: "Вызвать друга" }).click();
      await a.waitForURL(/\/call\//);
      await a.goto(`${a.url()}?sim=1&speed=8&kinds=good`);
      await a.waitForURL(/\/result\//, { timeout: 90_000 });
      const resultA = a.getByTestId("duel-result");
      await expect(resultA).toContainText("Результат:");
      await resultA.getByRole("button", { name: "Отправить вызов другу" }).click();
      const challenge = await copiedText(a);
      expect(challenge).toMatch(/\/join\?d=/);

      // --- игрок Б: меняет имя, принимает вызов ---
      await b.goto("/profile?demo=1");
      await b.getByLabel("Имя", { exact: true }).fill("Борис");
      await b.getByRole("button", { name: "Сохранить", exact: true }).first().click();
      await b.goto(new URL(challenge).pathname + new URL(challenge).search);
      await expect(b.getByTestId("join")).toContainText("вызывает на дуэль");
      await b.getByRole("button", { name: "Принять вызов" }).click();
      await b.waitForURL(/\/call\//);
      await b.goto(`${b.url()}?sim=1&speed=8&kinds=good,shallow`);
      await b.waitForURL(/\/result\//, { timeout: 90_000 });
      const resultB = b.getByTestId("duel-result");
      await expect(resultB.getByTestId("duel-score")).toContainText(":");
      await expect(resultB).toContainText("Поражение");
      await resultB.getByRole("button", { name: "Отправить ответ" }).click();
      const reply = await copiedText(b);

      // --- игрок А: открывает ответ ---
      await a.goto(new URL(reply).pathname + new URL(reply).search);
      await expect(a.getByTestId("join")).toContainText("Борис ответил на вызов");
      await expect(a.getByTestId("join")).toContainText("Победа");
      await a.getByRole("link", { name: "К рейтингу" }).click();
      await expect(a.getByTestId("duels")).toContainText("с Борис");
      await expect(a.getByTestId("duels")).toContainText("Победа");
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

test.describe("вкладка «Профиль»", () => {
  test("имя, переключатели и жёсткость сохраняются; «Без пощады» зависит от возраста", async ({
    page,
  }) => {
    await openDemo(page, "/profile");
    const profile = page.getByTestId("profile");
    await expect(profile).toContainText("Профиль");
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("Алекс");

    await page.getByLabel("Имя", { exact: true }).fill("Дима");
    await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
    await expect(page.getByText("Имя сохранено")).toBeVisible();

    const voice = page.getByTestId("toggle-voice");
    await expect(voice).toHaveAttribute("aria-checked", "true");
    await voice.click();
    await expect(voice).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(page.getByTestId("toggle-voice")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("Дима");

    // демо — 18+: «Без пощады» доступно; сменим возраст на 16–17 → недоступно, жёсткость понижается
    const harsh = page.getByRole("button", { name: /Без пощады/ });
    await expect(harsh).toBeEnabled();
    await harsh.click();
    await expect(harsh).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /16–17/ }).click();
    await expect(harsh).toBeDisabled();
    await expect(page.getByRole("button", { name: /Жёсткий/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.screenshot({ path: "test-results/screens/profile-390.png", fullPage: true });
  });

  test("расписание: смена дней пересобирает тренировки на неделе", async ({ page }) => {
    await openDemo(page, "/profile");
    const save = page.getByRole("button", { name: "Сохранить расписание" });
    await expect(save).toBeDisabled();
    await page.getByRole("button", { name: "Вт", exact: true }).click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Расписание обновлено")).toBeVisible();
    await page.getByRole("link", { name: "Тренировки" }).click();
    await expect(page.getByTestId("week")).toBeVisible();
  });

  test("экспорт скачивает файл с данными, а удаление стирает всё и возвращает на знакомство", async ({
    page,
  }) => {
    await openDemo(page, "/profile");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Скачать мои данные" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^pinok-data-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
    const bundle = JSON.parse(text) as { app: string; data: Record<string, unknown[]> };
    expect(bundle.app).toBe("pinok");
    expect(JSON.stringify(bundle.data)).toContain("Алекс");

    await page.getByRole("button", { name: "Удалить все данные" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Вернуть их нельзя");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Удалить все данные" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await page.waitForURL(/\/onboarding$/);
    await expect(page.getByTestId("onboarding-hello")).toBeVisible();
  });

  test("память тренеров: запись видна и удаляется", async ({ page }) => {
    await openDemo(page, "/profile");
    const list = page.getByTestId("memory-list");
    await expect(list).toContainText("по вторникам футбол");
    await expect(list).toContainText("Громов");
    await page.getByRole("button", { name: "Удалить запись: по вторникам футбол" }).click();
    await expect(page.getByText("Тренеры пока ничего не запомнили.")).toBeVisible();
  });

  test("демо-режим: баннер и выход из демо", async ({ page }) => {
    await openDemo(page, "/profile");
    await expect(page.getByText("Демо-режим: данные на экране не настоящие.")).toBeVisible();
    await page.getByRole("button", { name: "Выйти из демо" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await page.waitForURL(/\/onboarding$/);
  });

  test("политика и условия открываются и помечены как черновик", async ({ page }) => {
    await openDemo(page, "/profile");
    await page.getByRole("link", { name: "Политика конфиденциальности" }).click();
    await expect(page.getByTestId("legal-privacy")).toContainText("проверить юристом");
    await expect(page.getByTestId("legal-privacy")).toContainText("Видео и звук");
    await page.goto("/terms");
    await expect(page.getByTestId("legal-terms")).toContainText("Здоровье");
  });
});
