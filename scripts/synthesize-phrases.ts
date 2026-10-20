/**
 * Озвучивает весь банк фраз тренеров через ElevenLabs и кладёт mp3 в public/voices/<тренер>/.
 * Запуск:  pnpm synthesize              — озвучить всё, чего ещё нет
 *          pnpm synthesize --dry-run    — только посчитать символы и стоимость
 *          pnpm synthesize --coach gromov
 * Идемпотентно: уже озвученные файлы пропускаются. Ключ берётся из ELEVENLABS_API_KEY (.env.local).
 * Фразы с {name}/{count} не озвучиваются заранее: их читает голос браузера на лету.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allPhrases } from "../lib/coach/phrases";
import { countWord } from "../lib/coach/numberWords";
import { PRERECORDED_COUNT_MAX, VOICE_CONFIG, countPhraseId } from "../lib/coach/voiceConfig";
import { COACH_IDS, type CoachId } from "../lib/data/types";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyCoach = args.includes("--coach") ? (args[args.indexOf("--coach") + 1] as CoachId) : null;

// грубая оценка (ElevenLabs Flash): сверяйся с тарифом на сайте
const USD_PER_1K_CHARS = Number(process.env.COST_TTS_PER_1K_CHARS ?? 0.12);

function loadEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]!] === undefined)
      process.env[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
}

interface Job {
  coachId: CoachId;
  id: string;
  text: string;
}

function jobsFor(coachId: CoachId): Job[] {
  const phrases = allPhrases(coachId)
    .filter((p) => !p.template)
    .map((p) => ({ coachId, id: p.id, text: p.text }));
  const counts = Array.from({ length: PRERECORDED_COUNT_MAX }, (_, i) => ({
    coachId,
    id: countPhraseId(coachId, i + 1),
    text: countWord(i + 1),
  }));
  return [...phrases, ...counts];
}

async function synthesize(job: Job, key: string): Promise<Buffer> {
  const cfg = VOICE_CONFIG[job.coachId].elevenlabs;
  const voiceId = process.env[`ELEVENLABS_VOICE_${job.coachId.toUpperCase()}`] ?? cfg.voiceId;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: job.text,
        model_id: cfg.model,
        voice_settings: {
          stability: cfg.stability,
          similarity_boost: cfg.similarityBoost,
          style: cfg.style,
          speed: cfg.speed,
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main(): Promise<void> {
  loadEnv();
  const coaches = onlyCoach ? [onlyCoach] : [...COACH_IDS];
  const outRoot = path.join(process.cwd(), "public", "voices");
  const manifestPath = path.join(outRoot, "manifest.json");
  const existing = new Set<string>(
    existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as { ids: string[] }).ids
      : [],
  );

  const todo: Job[] = [];
  let totalChars = 0;
  for (const coachId of coaches) {
    for (const job of jobsFor(coachId)) {
      const file = path.join(outRoot, coachId, `${job.id}.mp3`);
      if (existsSync(file)) {
        existing.add(job.id);
        continue;
      }
      todo.push(job);
      totalChars += job.text.length;
    }
  }
  const cost = (totalChars / 1000) * USD_PER_1K_CHARS;
  console.log(
    `К озвучке: ${todo.length} фраз, ${totalChars} символов ≈ $${cost.toFixed(2)} (оценка)`,
  );
  if (dryRun || todo.length === 0) {
    console.log(dryRun ? "Режим --dry-run: ничего не отправлено." : "Всё уже озвучено.");
    return;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error("Нет ELEVENLABS_API_KEY. Впиши ключ в .env.local или запусти с --dry-run.");
    process.exit(1);
  }

  let done = 0;
  let spent = 0;
  for (const job of todo) {
    const dir = path.join(outRoot, job.coachId);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(path.join(dir, `${job.id}.mp3`), await synthesize(job, key));
      existing.add(job.id);
      spent += job.text.length;
      done += 1;
      if (done % 25 === 0) console.log(`  …${done}/${todo.length}`);
    } catch (error) {
      console.error(`Ошибка на ${job.id}: ${(error as Error).message}`);
      break; // остановимся, чтобы не жечь деньги на одинаковых ошибках; повторный запуск продолжит
    }
    // манифест сохраняем по ходу — прерванный запуск не теряет прогресс
    if (done % 25 === 0) writeFileSync(manifestPath, JSON.stringify({ ids: [...existing].sort() }));
  }
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ ids: [...existing].sort() }));
  console.log(
    `Готово: озвучено ${done} из ${todo.length}. Потрачено символов: ${spent} ≈ $${((spent / 1000) * USD_PER_1K_CHARS).toFixed(2)} (оценка).`,
  );
}

void main();
