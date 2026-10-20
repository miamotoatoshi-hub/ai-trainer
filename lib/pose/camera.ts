export type CameraErrorKind =
  "denied" | "not_found" | "insecure" | "unsupported" | "busy" | "unknown";

export class CameraError extends Error {
  constructor(readonly kind: CameraErrorKind) {
    super(`camera:${kind}`);
  }
}

/** Переводит исключения getUserMedia в понятные категории (для сообщений пользователю). */
export function classifyCameraError(error: unknown): CameraErrorKind {
  if (error instanceof CameraError) return error.kind;
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (
    name === "NotFoundError" ||
    name === "OverconstrainedError" ||
    name === "DevicesNotFoundError"
  ) {
    return "not_found";
  }
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

export type Facing = "user" | "environment";

/** Открывает камеру (без звука). Видео остаётся на устройстве. */
export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) throw new CameraError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
}

/** Если распознавание тормозит, просим камеру снизить разрешение. */
export async function lowerResolution(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ width: { ideal: 480 }, height: { ideal: 360 } });
  } catch {
    // не все браузеры позволяют менять разрешение на лету
  }
}
