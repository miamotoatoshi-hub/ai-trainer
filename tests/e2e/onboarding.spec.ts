import { expect, test, type Page } from "@playwright/test";
import { FIXED_NOW } from "./helpers";

async function startFresh(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_NOW });
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function passGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Погнали" }).click();
  await page.getByLabel("Мне 13 лет или больше").check();
  await page.getByRole("button", { name: "Понятно, поехали" }).click();
}

test.describe("первая встреча", () => {
  test("новичка отправляют на знакомство; путь: 13+ → приседания → анкета → тренеры", async ({
    page,
  }) => {
    await startFresh(page);
    await expect(page.getByTestId("onboarding-hello")).toContainText(
      "Я Громов. Буду тебя тренировать.",
    );
    await page.screenshot({ path: "test-results/screens/onboarding-1-hello.png" });
    await page.getByRole("button", { name: "Погнали" }).click();

    // 13+ и здоровье: без галочки двигаться нельзя
    const accept = page.getByRole("button", { name: "Понятно, поехали" });
    await expect(accept).toBeDisabled();
    await expect(page.getByTestId("onboarding-gate")).toContainText("Останавливайся при боли");
    await page.getByLabel("Мне 13 лет или больше").check();
    await page.screenshot({ path: "test-results/screens/onboarding-2-gate.png" });
    await accept.click();

    // камера: объяснение про приватность и запуск 10 приседаний
    await expect(page.getByTestId("onboarding-camera")).toContainText(
      "Видео не покидает твой телефон",
    );
    await page.screenshot({ path: "test-results/screens/onboarding-3-camera.png" });
    await page.getByRole("button", { name: "Включить камеру" }).click();
    await page.waitForURL(/\/call\//);
    const callUrl = page.url();
    await page.goto(`${callUrl}?sim=1&speed=8&kinds=good`);
    await page.waitForURL(/\/onboarding\?after=/, { timeout: 90_000 });

    // анкета: сначала вердикт за приседания
    const feed = page.getByTestId("anketa-feed");
    await expect(feed).toContainText("Повторений: 10, чистых: 100%");
    const send = page.getByRole("button", { name: "Отправить" });

    await page.getByLabel("Твоё имя").fill("Алекс");
    await send.click();
    await page.getByRole("button", { name: /16–17/ }).click();
    await page.screenshot({ path: "test-results/screens/onboarding-4-anketa.png" });
    await page.getByRole("button", { name: "Стать сильнее" }).click();
    await page.getByRole("button", { name: "20 минут" }).click();
    // дни по умолчанию: Пн, Ср, Пт
    await expect(page.getByRole("button", { name: "Ср" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Готово" }).click();
    await page.getByRole("button", { name: "18:00" }).click();
    // 16–17 лет: «Без пощады» недоступно
    await page.screenshot({ path: "test-results/screens/onboarding-5-harshness.png" });
    await expect(page.getByRole("button", { name: /Без пощады/ })).toBeDisabled();
    await expect(page.getByText("Только с 18 лет")).toBeVisible();
    await page.getByRole("button", { name: /Жёсткий/ }).click();
    await page.getByRole("button", { name: "Ясно" }).click();
    await page.getByRole("button", { name: "Не сейчас" }).click();

    await expect(feed).toContainText("Первая тренировка — Завтра, 18:00");
    await page.getByRole("button", { name: "К тренерам" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    await expect(page.getByText("ЗАВТРА · 18:00")).toBeVisible();

    // чат: приветствие с расписанием и карточка первой тренировки
    await page.getByRole("link", { name: /Открыть чат: Громов/ }).click();
    const chat = page.getByTestId("chat-feed");
    await expect(chat).toContainText("Договорились: Пн, Ср, Пт, 18:00");
    await expect(page.getByRole("button", { name: "Начать звонок" })).toBeVisible();

    // повторно знакомиться не нужно
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/$/);
  });

  test("моложе 13: сообщение и никакого продолжения", async ({ page }) => {
    await startFresh(page);
    await page.getByRole("button", { name: "Погнали" }).click();
    await page.getByRole("button", { name: "Мне ещё нет 13" }).click();
    await expect(page.getByTestId("onboarding-too-young")).toContainText("Подрасти ещё немного");
    await expect(page.getByTestId("onboarding-too-young")).toContainText(
      "Мы ничего о тебе не сохранили",
    );
    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page.getByRole("button", { name: "Понятно, поехали" })).toBeDisabled();
    // и главный экран недоступен
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("без камеры: «Без пощады» открывается только с 18 лет, плохое имя не принимается", async ({
    page,
  }) => {
    await startFresh(page);
    await passGate(page);
    await page.getByRole("button", { name: "Пока без камеры" }).click();
    const feed = page.getByTestId("anketa-feed");
    await expect(feed).toContainText("Без камеры не выйдет");

    await page.getByLabel("Твоё имя").fill("<script>");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Так не пойдёт")).toBeVisible();
    await page.getByLabel("Твоё имя").fill("Мария");
    await page.getByRole("button", { name: "Отправить" }).click();

    await page.getByRole("button", { name: "18 и старше" }).click();
    await page.getByRole("button", { name: "Просто форма" }).click();
    await page.getByRole("button", { name: "10 минут" }).click();
    await page.getByRole("button", { name: "Готово" }).click();
    await page.getByRole("button", { name: "Другое время" }).click();
    await page.getByLabel("Во сколько звоню?").fill("07:30");
    await page.getByRole("button", { name: "Выбрать" }).click();
    await expect(page.getByRole("button", { name: /Без пощады/ })).toBeEnabled();
    await page.getByRole("button", { name: /Без пощады/ }).click();
    await page.getByRole("button", { name: "Ясно" }).click();
    await page.getByRole("button", { name: "Не сейчас" }).click();
    await page.getByRole("button", { name: "К тренерам" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
  });

  test("прервали анкету посреди пути — вернулись и продолжили с того же места", async ({
    page,
  }) => {
    await startFresh(page);
    await passGate(page);
    await page.getByRole("button", { name: "Пока без камеры" }).click();
    await page.getByLabel("Твоё имя").fill("Дима");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("button", { name: /16–17/ })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("anketa-feed")).toContainText("Дима");
    await expect(page.getByRole("button", { name: /16–17/ })).toBeVisible();
  });

  test("ссылка на демо ведёт на готовый пример", async ({ page }) => {
    await startFresh(page);
    await page.getByRole("link", { name: "Сначала посмотреть демо" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Открыть чат/ })).toHaveCount(4);
  });
});
