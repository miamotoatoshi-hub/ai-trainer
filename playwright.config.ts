import { defineConfig, devices } from "@playwright/test";

// Отдельный порт, чтобы не мешать `pnpm dev` на 3000.
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Видео-тесты тяжёлые (распознавание позы, ускоренный звонок): два браузера сразу иногда мешают
  // друг другу. Один надёжнее; для скорости можно: PW_WORKERS=2 pnpm test:e2e
  workers: Number(process.env.PW_WORKERS) || 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    // эталонный экран из ТЗ: 390×844 (iPhone-подобный)
    viewport: { width: 390, height: 844 },
    // Камеру в тестах не открываем по-настоящему: разрешение выдано, а видео подменено
    // (см. tests/e2e/workout.spec.ts — там используется встроенный симулятор позы).
    permissions: ["camera", "microphone"],
    launchOptions: {
      // На своём компьютере не нужен (браузер ставится командой `pnpm exec playwright install chromium`).
      // В облачном окружении Chromium уже установлен — путь к нему передаётся через переменную.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: {
    // Тесты идут на рабочей сборке: dev-сервер компилирует страницы при первом заходе и даёт «плавающие» тесты.
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    // Ключ для проверки закрытой страницы расходов; настоящих ключей в тестах нет.
    env: { ADMIN_TOKEN: "e2e-admin-token" },
  },
});
