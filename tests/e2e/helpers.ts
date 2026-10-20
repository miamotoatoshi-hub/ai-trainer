import type { Page } from "@playwright/test";

/** Фиксированное «сейчас»: вторник 20 октября 2026, 10:30 — чтобы тексты вроде «СЕГОДНЯ · 18:00» не плавали. */
export const FIXED_NOW = new Date(2026, 9, 20, 10, 30);

/** Открывает адрес с демо-данными и зафиксированным временем. */
export async function openDemo(page: Page, path: string): Promise<void> {
  await page.clock.install({ time: FIXED_NOW });
  const sep = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${sep}demo=1`);
}

/** Нет горизонтальной прокрутки страницы и внутри рамки приложения. */
export async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const frame = document.getElementById("app-frame");
    const frameOk = !frame || frame.scrollWidth <= frame.clientWidth + 1;
    return doc.scrollWidth <= doc.clientWidth + 1 && frameOk;
  });
}

/** Открывает демо-главную, нажимает «Позвонить» и возвращает адрес экрана звонка. */
export async function startDemoCall(page: Page): Promise<string> {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Позвонить" }).click();
  await page.waitForURL(/\/call\//);
  return page.url();
}
