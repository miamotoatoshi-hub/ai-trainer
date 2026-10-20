import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    // эталонный экран из ТЗ: 390×844 (iPhone-подобный)
    viewport: { width: 390, height: 844 },
    launchOptions: {
      // На своём компьютере не нужен (браузер ставится командой `pnpm exec playwright install chromium`).
      // В облачном окружении Chromium уже установлен — путь к нему передаётся через переменную.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
