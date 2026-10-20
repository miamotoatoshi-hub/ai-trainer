/** Разрешение браузера на уведомления. На iPhone работает только у приложения, добавленного на экран «Домой». */
export type NotificationSupport = "supported" | "unsupported";

export function notificationSupport(): NotificationSupport {
  return typeof window !== "undefined" && "Notification" in window ? "supported" : "unsupported";
}

export type PermissionResult = "granted" | "denied" | "default" | "unsupported";

export function currentPermission(): PermissionResult {
  if (notificationSupport() === "unsupported") return "unsupported";
  return Notification.permission;
}

/** Показывает системный запрос. Вызывать только из нажатия кнопки — иначе браузер откажет. */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (notificationSupport() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
