import { expect, test } from "@playwright/test";
import { t, type MessageKey } from "../../lib/i18n";

// Каждый маршрут из ТЗ (раздел 4) открывается и показывает свой заголовок.
const routes: { path: string; title: MessageKey }[] = [
  { path: "/chats", title: "screens.chats" },
  { path: "/workouts", title: "screens.workouts" },
  { path: "/rating", title: "screens.rating" },
  { path: "/profile", title: "screens.profile" },
  { path: "/chat/gromov", title: "screens.chat" },
  { path: "/call/demo-session", title: "screens.call" },
  { path: "/result/demo-session", title: "screens.result" },
  { path: "/onboarding", title: "screens.onboarding" },
];

for (const { path, title } of routes) {
  test(`${path} открывается и показывает заголовок`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(title));
  });
}

test("корень / ведёт на список тренеров", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chats$/);
});

test("динамические адреса показывают свой ID", async ({ page }) => {
  await page.goto("/chat/marina");
  await expect(page.getByText(t("common.idLabel", { id: "marina" }))).toBeVisible();
});
