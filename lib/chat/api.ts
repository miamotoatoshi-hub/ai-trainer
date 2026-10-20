import type { ChatFailReason, ChatOutcome, ChatRequest } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Запрос к /api/chat. Любая неудача (нет сети, таймаут, ошибка сервера) — это `ok: false`, не исключение. */
export async function fetchChatReply(
  req: ChatRequest,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<ChatOutcome> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetchImpl("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    const body = (await response.json()) as ChatOutcome;
    if (body && body.ok === true && Array.isArray(body.reply?.messages)) return body;
    const reason: ChatFailReason =
      body && body.ok === false && typeof body.reason === "string" ? body.reason : "error";
    return { ok: false, reason };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
