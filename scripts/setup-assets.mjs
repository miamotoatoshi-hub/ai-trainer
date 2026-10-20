// Готовит файлы для камеры. Запускается сам после `pnpm install` и перед `pnpm dev` / `pnpm build`.
//  1. WASM-движок MediaPipe копируется из node_modules в public/mediapipe/wasm
//  2. Модель позы (lite, ~5.8 МБ) скачивается в public/models, если её там ещё нет
// Если сети нет — не падаем: приложение подгрузит модель с CDN во время работы.
import { access, cp, mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
  const to = join(root, "public", "mediapipe", "wasm");
  if (!(await exists(from))) {
    console.warn("[setup-assets] @mediapipe/tasks-vision не установлен — пропускаю WASM");
    return;
  }
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    const source = join(from, name);
    const target = join(to, name);
    // Файлы по 13 МБ копируем только если их ещё нет или размер изменился.
    const same = (await exists(target)) && (await stat(target)).size === (await stat(source)).size;
    if (!same) await cp(source, target);
  }
}

async function downloadModel() {
  const target = join(root, "public", "models", "pose_landmarker_lite.task");
  if (await exists(target)) return;
  await mkdir(dirname(target), { recursive: true });
  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const tmp = `${target}.part`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);
    console.log(`[setup-assets] модель позы скачана (${(bytes.length / 1e6).toFixed(1)} МБ)`);
  } catch (error) {
    console.warn(
      `[setup-assets] не удалось скачать модель позы (${error.message}). ` +
        "Приложение возьмёт её с CDN при первом запуске камеры.",
    );
  }
}

await copyWasm();
await downloadModel();
