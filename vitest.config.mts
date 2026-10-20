import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // тот же алиас "@/..." что и в tsconfig.json
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    // e2e-тесты (*.spec.ts) гоняет Playwright, а не Vitest
    include: ["tests/**/*.test.ts"],
  },
});
