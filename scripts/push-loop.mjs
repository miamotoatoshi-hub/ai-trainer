// Локальная проверка Web Push: раз в минуту дёргает /api/push/tick (то, что на хостинге делает cron).
// Запуск: pnpm push:loop   (приложение должно работать на localhost:3000, ключи VAPID — в .env.local)
const base = process.env.PUSH_BASE_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET ? `?secret=${encodeURIComponent(process.env.CRON_SECRET)}` : "";

async function tick() {
  try {
    const response = await fetch(`${base}/api/push/tick${secret}`);
    const body = await response.json();
    console.log(new Date().toLocaleTimeString("ru-RU"), response.status, JSON.stringify(body));
  } catch (error) {
    console.log("не получилось достучаться до приложения:", error.message);
  }
}

await tick();
setInterval(tick, 60_000);
