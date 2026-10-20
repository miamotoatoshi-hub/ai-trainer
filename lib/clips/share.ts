export type ShareResult = "shared" | "downloaded" | "cancelled" | "failed";

/** Умеет ли браузер отправлять файл через системное меню «Поделиться» (iOS Safari, Android Chrome). */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.canShare &&
    navigator.canShare({ files: [file] })
  );
}

/** Скачивание файла: запасной путь, когда «Поделиться» недоступно. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Браузеру нужно время, чтобы начать загрузку, прежде чем адрес станет недействительным.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** «Поделиться»: системное меню с файлом, а если его нет — скачивание. */
export async function shareClip(file: File, title: string, text: string): Promise<ShareResult> {
  if (!canShareFile(file)) {
    downloadFile(file);
    return "downloaded";
  }
  try {
    await navigator.share({ files: [file], title, text });
    return "shared";
  } catch (error) {
    // Пользователь закрыл меню — это не ошибка.
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    downloadFile(file);
    return "downloaded";
  }
}
