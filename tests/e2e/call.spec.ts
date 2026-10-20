import { expect, test, type Page } from "@playwright/test";
import { countWord } from "../../lib/coach/numberWords";
import { allPhrases } from "../../lib/coach/phrases";

/** Открывает демо-главную, нажимает «Позвонить» и возвращает адрес экрана звонка. */
async function startCall(page: Page): Promise<string> {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Позвонить" }).click();
  await page.waitForURL(/\/call\//);
  return page.url();
}

/** Перехватывает речь тренера: запоминает, что именно «сказал» браузерный синтез. */
async function spyOnSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      spoken.push(u.text);
    };
  });
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test.describe("звонок = тренировка", () => {
  test("настоящее распознавание позы грузится; человека нет — тренер ворчит", async ({ page }) => {
    await startCall(page);
    await expect(page.getByTestId("body-parts")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Поставь телефон на пол у стены")).toBeVisible();
    // ворчание — фраза «не в кадре» из банка Громова
    const bank = new Set(
      allPhrases("gromov")
        .filter((p) => p.event === "not_in_frame")
        .map((p) => p.text),
    );
    await expect
      .poll(async () => bank.has((await page.getByTestId("grumble").textContent()) ?? ""), {
        timeout: 20_000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="body-parts"] [data-visible="true"]')).toHaveCount(0);
  });

  test("10 приседаний: счёт вслух, реплики из банка, результат с цифрами и вердиктом", async ({
    page,
  }) => {
    await spyOnSpeech(page);
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=8&kinds=good&plan=first-squats`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("caption")).toHaveText("Приседания");
    await page.waitForURL(/\/result\//, { timeout: 60_000 });

    await expect(page.getByTestId("stat-reps")).toHaveText("10");
    await expect(page.getByTestId("stat-clean")).toHaveText("100%");
    await expect(page.getByTestId("stat-streak")).toHaveText("10");
    const verdict = (await page.getByTestId("verdict").textContent()) ?? "";
    const verdicts = allPhrases("gromov")
      .filter((p) => p.event === "verdict_great")
      .map((p) => p.text);
    expect(verdicts.some((v) => verdict.includes(v))).toBe(true);
    await expect(page.getByText("Приседания", { exact: true })).toBeVisible();
    await expect(page.getByText("10 из 10 чистых")).toBeVisible();

    // голос: считал вслух («раз, два…»; на ускорении ×8 часть слов пропускается — счёт не перебивает
    // говорящего), и звучали фразы Громова из банка
    const said = await spoken(page);
    const countWords = new Set(Array.from({ length: 10 }, (_, i) => countWord(i + 1)));
    expect(said.filter((s) => countWords.has(s)).length).toBeGreaterThanOrEqual(2);
    const bank = new Set(allPhrases("gromov").map((p) => p.text));
    expect(said.some((s) => bank.has(s))).toBe(true);
  });

  test("весь план «Корпус»: разминка → планка → приседания → «добивание»", async ({ page }) => {
    test.setTimeout(150_000);
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=10&kinds=good&plan=core-10`);
    await expect(page.getByTestId("caption")).toBeVisible({ timeout: 30_000 });
    const seen: string[] = [];
    const started = Date.now();
    while (!/\/result\//.test(page.url()) && Date.now() - started < 120_000) {
      const caption = await page
        .getByTestId("caption")
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (caption && !seen.includes(caption)) seen.push(caption);
      await page.waitForTimeout(200);
    }
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    expect(seen.some((c) => c.startsWith("Разминка"))).toBe(true);
    expect(seen).toContain("Отдых");
    expect(seen.some((c) => c.startsWith("Планка · подход 1 из 3"))).toBe(true);
    expect(seen.some((c) => c.startsWith("Приседания · подход 2 из 2"))).toBe(true);
    expect(seen.some((c) => c.startsWith("Добивание"))).toBe(true);
    await expect(page.getByText("Планка", { exact: true })).toBeVisible();
    await expect(page.getByText("Прыжки «джек»")).toBeVisible();
  });

  test("неглубокие и приседания с коленями внутрь: ошибка техники и реплики тренера", async ({
    page,
  }) => {
    await spyOnSpeech(page);
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=8&kinds=shallow,cave,good&plan=first-squats`);
    await expect(page.getByTestId("counter")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("quality")).toHaveAttribute("data-quality", "bad", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("subtitle")).not.toBeEmpty();
    const bank = new Set(
      allPhrases("gromov")
        .filter((p) => p.event === "rep_shallow" || p.event === "knees_cave_in")
        .map((p) => p.text),
    );
    // Фраза про ошибку техники — на экране (субтитр) или вслух. Если тренер как раз договаривает
    // похвалу, озвучка пропускается, а субтитр всё равно показывается, поэтому проверяем оба.
    await expect
      .poll(
        async () => {
          const said = await spoken(page).catch(() => [] as string[]);
          const shown =
            (await page
              .getByTestId("subtitle")
              .textContent()
              .catch(() => "")) ?? "";
          return said.some((s) => bank.has(s)) || bank.has(shown.trim());
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test("пауза останавливает счёт, «Завершить» спрашивает подтверждение и сохраняет итог", async ({
    page,
  }) => {
    const url = await startCall(page);
    await page.goto(`${url}?sim=1&speed=4&kinds=good&plan=first-squats`);
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

    await page.getByRole("button", { name: "Завершить" }).click();
    await page.getByRole("button", { name: "Завершить" }).last().click();
    await page.waitForURL(/\/result\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Тренировка прервана");
    await expect(page.getByTestId("stat-reps")).not.toHaveText("0");
  });

  test("если здоровье ещё не подтверждали, звонок начинается с экрана про здоровье", async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await expect(page.getByRole("button", { name: "Позвонить" })).toBeVisible();
    // Демо-данные уже «подтвердили» здоровье, поэтому сбрасываем флаг прямо в базе.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("pinok");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("profile", "readwrite");
            const store = tx.objectStore("profile");
            const get = store.get("me");
            get.onsuccess = () => store.put({ ...get.result, safetyAccepted: false });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.getByRole("button", { name: "Позвонить" }).click();
    await page.waitForURL(/\/call\//);
    await expect(page.getByText("Перед первой тренировкой")).toBeVisible();
    await expect(page.getByText("Останавливайся при боли.")).toBeVisible();
    await page.getByRole("button", { name: "Понятно, поехали" }).click();
    await expect(page.getByText("Поставь телефон на пол у стены")).toBeVisible();
  });
});
