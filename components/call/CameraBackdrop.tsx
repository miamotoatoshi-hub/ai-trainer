"use client";

import { useEffect, type RefObject } from "react";

interface CameraBackdropProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Зеркалить картинку (фронтальная камера выглядит как зеркало). */
  mirror: boolean;
  /** Вместо видео — тёмный фон симулятора. */
  simMode: boolean;
}

/** Полноэкранное видео с камеры и слой для скелета позы. Видео никуда не отправляется. */
export function CameraBackdrop({ videoRef, canvasRef, mirror, simMode }: CameraBackdropProps) {
  // Холст всегда совпадает по размеру с экраном (с учётом плотности пикселей).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  const flip = mirror && !simMode ? { transform: "scaleX(-1)" } : undefined;
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink" aria-hidden="true">
      {simMode ? (
        <div className="absolute inset-0 bg-gradient-to-b from-[#16295e] to-[#0b1b3f]" />
      ) : null}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover ${simMode ? "hidden" : ""}`}
        style={flip}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={flip} />
    </div>
  );
}
