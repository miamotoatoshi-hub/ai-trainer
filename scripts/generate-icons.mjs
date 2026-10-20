// Рисует иконки PWA (PNG) из SVG через Chromium из Playwright.
// Запуск: pnpm icons   (в облаке: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm icons)
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

// Буква «П» из ПИНКА: синий фон, белая буква. glyphScale < 1 — запас под маску Android.
function svg({ rounded, glyphScale }) {
  const offset = (512 - 512 * glyphScale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="#1F5BFF"/>
  <g transform="translate(${offset} ${offset}) scale(${glyphScale})">
    <path fill="#FFFFFF" d="M136 372V150H376V372H300V218H212V372Z"/>
  </g>
</svg>`;
}

const icons = [
  { file: "icon-192.png", size: 192, rounded: true, glyphScale: 1 },
  { file: "icon-512.png", size: 512, rounded: true, glyphScale: 1 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, glyphScale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, glyphScale: 0.86 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">
        <div style="width:${icon.size}px;height:${icon.size}px">${svg(icon).replace(
          'width="512" height="512"',
          `width="${icon.size}" height="${icon.size}"`,
        )}</div></body></html>`,
    );
    const png = await page.screenshot({ omitBackground: true });
    await writeFile(join(outDir, icon.file), png);
    await page.close();
    console.log("готово:", icon.file);
  }
} finally {
  await browser.close();
}
