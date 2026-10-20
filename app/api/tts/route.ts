import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import voiceGromov from "@/content/coaches/gromov/voice.json";
import voiceMarina from "@/content/coaches/marina/voice.json";
import voiceMax from "@/content/coaches/max/voice.json";
import voicePalych from "@/content/coaches/palych/voice.json";
import { isCoachId } from "@/lib/coach/coaches";
import { ttsCostUsd } from "@/lib/server/costs";
import { recordCall, tryConsume } from "@/lib/server/usage";

export const runtime = "nodejs";

const VOICES = { gromov: voiceGromov, marina: voiceMarina, palych: voicePalych, max: voiceMax };
const MAX_CHARS = 400;
const CACHE_DIR = path.join(process.cwd(), ".cache", "tts");

/** Кэш в памяти на случай, если диск недоступен (например, на хостинге). */
const memoryCache = new Map<string, Buffer>();

function fallback(reason: string, status = 501): Response {
  // Клиент в этом случае озвучивает фразу браузерным голосом (бесплатно).
  return Response.json({ fallback: true, reason }, { status });
}

/**
 * POST /api/tts — озвучка реплики тренера через ElevenLabs. Расходы: ≈ $0.12 за 1000 символов,
 * голосовое в чате (~60 символов) ≈ $0.007. Защита от трат: дневной лимит на пользователя (20)
 * и кэш по хэшу (голос + текст): повторная фраза бесплатна.
 * Без ключа ELEVENLABS_API_KEY отвечает 501 — клиент использует голос браузера.
 */
export async function POST(request: Request): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return fallback("no_key");

  let body: { text?: unknown; coachId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const coachId = typeof body.coachId === "string" ? body.coachId : "";
  if (!text || text.length > MAX_CHARS || !isCoachId(coachId)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const voice = VOICES[coachId];
  const voiceId =
    process.env[`ELEVENLABS_VOICE_${coachId.toUpperCase()}`] ?? voice.elevenlabs.voiceId;
  const model = voice.elevenlabs.model;
  const hash = createHash("sha256").update(`${voiceId}|${model}|${text}`).digest("hex");

  const audioResponse = (audio: Buffer) =>
    new Response(new Uint8Array(audio), {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" },
    });

  // 1) кэш (бесплатно, лимит не тратим)
  const inMemory = memoryCache.get(hash);
  if (inMemory) return audioResponse(inMemory);
  const file = path.join(CACHE_DIR, `${hash}.mp3`);
  try {
    const cached = await fs.readFile(file);
    memoryCache.set(hash, cached);
    return audioResponse(cached);
  } catch {
    // нет в кэше — идём дальше
  }

  // 2) лимит на пользователя
  const anonId = request.headers.get("x-pinok-anon") ?? "anonymous";
  const limit = await tryConsume(anonId, "tts_eleven");
  if (!limit.ok) return fallback("limit", 429);

  // 3) настоящий вызов
  const api = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: voice.elevenlabs.stability,
          similarity_boost: voice.elevenlabs.similarityBoost,
          style: voice.elevenlabs.style,
          speed: voice.elevenlabs.speed,
        },
      }),
    },
  ).catch(() => null);
  if (!api || !api.ok) return fallback("upstream_error", 502);

  const audio = Buffer.from(await api.arrayBuffer());
  await recordCall("tts_eleven", text.length, ttsCostUsd(text.length));
  memoryCache.set(hash, audio);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, audio);
  } catch {
    // без дискового кэша работаем на памяти
  }
  return audioResponse(audio);
}
