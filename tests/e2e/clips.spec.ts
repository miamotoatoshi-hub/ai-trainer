import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startDemoCall } from "./helpers";

test.describe("клипы для соцсетей", () => {
  test("после тренировки есть клип 9:16; перед первым шерингом — экран приватности; файл скачивается", async ({
    page,
  }) => {
    const url = await startDemoCall(page);
    await page.goto(`${url}?sim=1&speed=4&kinds=good,shallow,cave&plan=first-squats`);
    await page.waitForURL(/\/result\//, { timeout: 90_000 });

    const card = page.getByTestId("clip-card");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("Лучший момент:");
    await expect(card).toContainText("хранится только на этом устройстве");

    // видео загрузилось и имеет формат 9:16
    const video = page.getByTestId("clip-video");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    const size = await video.evaluate((v: HTMLVideoElement) => ({
      w: v.videoWidth,
      h: v.videoHeight,
    }));
    expect(size.w / size.h).toBeCloseTo(9 / 16, 2);
    await page.screenshot({ path: "test-results/screens/result-clip-390.png", fullPage: true });

    // первый раз: «Сохранить» → экран приватности
    await card.getByRole("button", { name: "Сохранить" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("В клипе видно тебя и твою комнату");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();

    const [first] = await Promise.all([
      page.waitForEvent("download"),
      (async () => {
        await card.getByRole("button", { name: "Сохранить" }).click();
        await page.getByRole("button", { name: "Понятно, продолжить" }).click();
      })(),
    ]);
    expect(first.suggestedFilename()).toMatch(/^pinok-gromov-\d{4}-\d{2}-\d{2}\.(mp4|webm)$/);
    const path = await first.path();
    expect((await readFile(path)).byteLength).toBeGreaterThan(5_000);

    // второй раз вопрос больше не задают
    const [second] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Сохранить" }).click(),
    ]);
    expect(second.suggestedFilename()).toBeTruthy();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("прерванная тренировка клип не сохраняет", async ({ page }) => {
    const url = await startDemoCall(page);
    await page.goto(`${url}?sim=1&speed=4&kinds=good&plan=first-squats`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Завершить" }).click();
    await page.getByRole("button", { name: "Завершить" }).last().click();
    await page.waitForURL(/\/result\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Тренировка прервана");
    await expect(page.getByTestId("clip-card")).toHaveCount(0);
  });
});
