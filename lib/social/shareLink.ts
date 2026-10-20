export type ShareLinkResult = "shared" | "copied" | "cancelled" | "failed";

/** Отправляет ссылку через системное меню, а если его нет — копирует в буфер обмена. */
export async function shareLink(
  url: string,
  title: string,
  text: string,
): Promise<ShareLinkResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
