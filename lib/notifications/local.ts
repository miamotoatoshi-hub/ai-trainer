import { t } from "@/lib/i18n";
import { currentPermission } from "./permission";

export interface Notice {
  title: string;
  body: string;
  /** Куда ведёт нажатие. */
  url: string;
  /** Одинаковый tag заменяет прежнее уведомление, а не копит их. */
  tag: string;
}

/** Показывать системное уведомление имеет смысл, только если человек сейчас не смотрит в приложение. */
export function shouldNotify(
  visibility: DocumentVisibilityState,
  permission: ReturnType<typeof currentPermission>,
): boolean {
  return permission === "granted" && visibility !== "visible";
}

/**
 * Системное уведомление через service worker (работает и на телефоне, где `new Notification` запрещён).
 * В каждом уведомлении есть кнопка «Настройки» — лёгкий путь к отключению.
 */
export async function showNotice(notice: Notice): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    // `actions` есть в браузерах, но не в типах DOM.
    const options: NotificationOptions & { actions: { action: string; title: string }[] } = {
      body: notice.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: notice.tag,
      data: { url: notice.url, settingsUrl: "/profile#notifications" },
      actions: [{ action: "settings", title: t("notifications.settings") }],
    };
    await registration.showNotification(notice.title, options);
    return true;
  } catch {
    return false;
  }
}
