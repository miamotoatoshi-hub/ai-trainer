import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { hasNoHorizontalOverflow, openDemo } from "./helpers";

const SCREENS_DIR = process.env.SCREENS_DIR ?? "test-results/screens";

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, a[href], summary, input")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") continue;
      if (r.width < 43.5 || r.height < 43.5) {
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30);
        bad.push(`${el.tagName} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return bad;
  });
}

const SCREENS: { path: string; ready: (page: Page) => Promise<void> }[] = [
  { path: "/workouts", ready: (p) => expect(p.getByTestId("workouts")).toBeVisible() },
  { path: "/rating", ready: (p) => expect(p.getByTestId("rating")).toBeVisible() },
  { path: "/profile", ready: (p) => expect(p.getByTestId("profile")).toBeVisible() },
  { path: "/support", ready: (p) => expect(p.getByTestId("support")).toBeVisible() },
  { path: "/privacy", ready: (p) => expect(p.getByTestId("legal-privacy")).toBeVisible() },
];

for (const width of [360, 390, 430]) {
  test.describe(`все экраны, ширина ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const screen of SCREENS) {
      test(`${screen.path}: без горизонтальной прокрутки, нажимаемое не меньше 44×44`, async ({
        page,
      }) => {
        await openDemo(page, screen.path);
        await screen.ready(page);
        await page.waitForTimeout(500);
        expect(await hasNoHorizontalOverflow(page)).toBe(true);
        expect(await smallTargets(page), `маленькие элементы на ${screen.path}`).toEqual([]);
      });
    }
  });
}

test.describe("скорость и доступность", () => {
  test("главный экран открывается быстрее 2.5 секунды (рабочая сборка, локально)", async ({
    page,
  }) => {
    // Без подмены часов: иначе браузер не отдаёт замеры загрузки.
    await page.goto("/?demo=1");
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
    });
    expect(timing.dcl).toBeLessThan(2500);
    expect(timing.load).toBeLessThan(2500);
  });

  test("у страниц есть язык, заголовок первого уровня и подписи у кнопок без текста", async ({
    page,
  }) => {
    await openDemo(page, "/profile");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, a[href]")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => !(el.getAttribute("aria-label") ?? el.textContent ?? "").trim())
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });

  test("несуществующая страница показывает понятное сообщение", async ({ page }) => {
    await openDemo(page, "/net-takoy-stranitsy");
    await expect(page.getByText("Такой страницы нет")).toBeVisible();
    await page.getByRole("link", { name: "К тренерам" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
  });
});

test.describe("тур по главным экранам (скриншоты для README)", () => {
  test("снимает основные экраны 390×844", async ({ page }) => {
    await mkdir(SCREENS_DIR, { recursive: true });
    const shot = (name: string) => page.screenshot({ path: `${SCREENS_DIR}/${name}.png` });

    await openDemo(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: "Тренеры" })).toBeVisible();
    await page.waitForTimeout(400);
    await shot("01-trenery");

    await page.getByRole("link", { name: /Открыть чат: Громов/ }).click();
    await expect(page.getByTestId("chat-feed")).toContainText("Молчишь");
    await page.waitForTimeout(300);
    await shot("02-chat-gromov");

    await page.goto("/chat/marina");
    await expect(page.getByTestId("chat-feed")).toBeVisible();
    await page.waitForTimeout(300);
    await shot("03-chat-marina-ignoriruet");

    await page.goto("/workouts");
    await expect(page.getByTestId("workouts")).toBeVisible();
    await shot("04-trenirovki");

    await page.goto("/rating");
    await expect(page.getByTestId("rating")).toBeVisible();
    await shot("05-reiting");

    await page.goto("/profile");
    await expect(page.getByTestId("profile")).toBeVisible();
    await shot("06-profil");

    await page.goto("/support");
    await expect(page.getByTestId("support")).toBeVisible();
    await shot("07-pomosch");
  });
});
