import { expect, test, type Page } from "@playwright/test";

/** Открывает демо-главную, нажимает «Позвонить» и возвращает адрес экрана звонка. */
async function startCall(page: Page): Promise<string> {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Позвонить" }).click();
  await page.waitForURL(/\/call\//);
  return page.url();
}

test.describe("звонок = тренировка", () => {
  test("настоящее распознавание позы грузится; человека нет — тренер ворчит", async ({ page }) => {
    await startCall(page);
    await expect(page.getByTestId("body-parts")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Поставь телефон на пол у стены")).toBeVisible();
    await expect(page.getByTestId("grumble")).toHaveText("Я тебя не вижу. Встань в кадр целиком.", {
      timeout: 15_000,
    });
    // ни одной ключевой точки не видно
    await expect(page.locator('[data-testid="body-parts"] [data-visible="true"]')).toHaveCount(0);
  });

  test("10 нормальных приседаний с симулятором доходят до экрана результата", async ({ page }) => {
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=8&kinds=good`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    // на 10-м повторе экран сразу уходит на результат
    await page.waitForURL(/\/result\//, { timeout: 60_000 });
  });

  test("неглубокие и приседания с коленями внутрь помечаются как ошибки техники", async ({
    page,
  }) => {
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=8&kinds=shallow,cave,good`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    // после неглубокого (не засчитан) и приседа с коленями внутрь индикатор показывает ошибку
    await expect(page.getByTestId("quality")).toHaveAttribute("data-quality", "bad", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("subtitle")).not.toBeEmpty();
  });

  test("пауза останавливает счёт, «Завершить» спрашивает подтверждение", async ({ page }) => {
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=4&kinds=good`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("counter")).not.toHaveText("0", { timeout: 30_000 });

    await page.getByRole("button", { name: "Пауза" }).click();
    await expect(page.getByTestId("subtitle")).toHaveText("Пауза");
    const frozen = await page.getByTestId("counter").textContent();
    await page.waitForTimeout(1500);
    expect(await page.getByTestId("counter").textContent()).toBe(frozen);

    await page.getByRole("button", { name: "Продолжить" }).click();
    await page.getByRole("button", { name: "Завершить" }).click();
    await expect(page.getByRole("dialog")).toContainText("Завершить тренировку?");
    await page.getByRole("button", { name: "Продолжить" }).last().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("при первом запуске показывается экран про здоровье", async ({ page }) => {
    await page.goto("/");
    // чистый профиль: без демо. Создаём сессию через гостевую карточку «Позвонить».
    await page.getByRole("button", { name: "Позвонить" }).click();
    await page.waitForURL(/\/call\//);
    await expect(page.getByText("Перед первой тренировкой")).toBeVisible();
    await expect(page.getByText("Останавливайся при боли.")).toBeVisible();
    await page.getByRole("button", { name: "Понятно, поехали" }).click();
    await expect(page.getByText("Поставь телефон на пол у стены")).toBeVisible();
  });
});
