import Anthropic from "@anthropic-ai/sdk";
import { parseChatRequest } from "@/lib/chat/schema";
import type { ChatFailReason, ChatOutcome } from "@/lib/chat/types";
import { detectSafety } from "@/lib/safety/detector";
import { chatModel, createChatClient, generateReply, loadPersona } from "@/lib/server/chat";
import { llmCostUsd } from "@/lib/server/costs";
import { recordCall, tryConsume } from "@/lib/server/usage";

export const runtime = "nodejs";

function fail(reason: ChatFailReason): Response {
  // Ответ 200: для клиента это обычный путь — он отвечает заготовленной репликой тренера.
  const body: ChatOutcome = { ok: false, reason };
  return Response.json(body);
}

/**
 * POST /api/chat — ответ тренера нейросетью (Anthropic). Ключ ANTHROPIC_API_KEY живёт только
 * здесь, на сервере. Без ключа, при исчерпанном дневном лимите (60 сообщений на пользователя)
 * и при любой ошибке клиент получает `ok: false` и показывает заготовленный ответ.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" } satisfies ChatOutcome, {
      status: 400,
    });
  }
  const req = parseChatRequest(raw);
  if (!req) {
    return Response.json({ ok: false, reason: "bad_request" } satisfies ChatOutcome, {
      status: 400,
    });
  }

  // Сообщения о боли, еде и кризисе нейросеть не получает: на них отвечает приложение.
  if (detectSafety(req.message)) return fail("safety");

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    await recordCall("chat_scripted", 1, 0);
    return fail("no_key");
  }

  const limit = await tryConsume(req.anonId, "chat_llm");
  if (!limit.ok) {
    await recordCall("chat_scripted", 1, 0);
    return fail("limit");
  }

  try {
    const persona = await loadPersona(req.coachId);
    const result = await generateReply(req, { client: createChatClient(key), persona });
    if (!result) {
      await recordCall("chat_scripted", 1, 0);
      return fail("error");
    }
    await recordCall(
      "chat_llm",
      result.inputTokens + result.outputTokens,
      llmCostUsd(result.inputTokens, result.outputTokens),
    );
    const body: ChatOutcome = { ok: true, reply: result.reply, source: "llm" };
    return Response.json(body, { headers: { "x-pinok-model": chatModel() } });
  } catch (error) {
    // Не логируем тексты переписки: только тип ошибки.
    const kind = error instanceof Anthropic.APIError ? `api_${error.status}` : "unknown";
    console.error(`[api/chat] ошибка нейросети: ${kind}`);
    await recordCall("chat_scripted", 1, 0);
    return fail("error");
  }
}
