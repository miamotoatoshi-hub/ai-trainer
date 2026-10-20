import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // any отключает проверки типов — разрешаем только осознанно (с комментарием-причиной)
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    // service worker и скопированный движок MediaPipe — не наш код
    "public/**",
    "next-env.d.ts",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
