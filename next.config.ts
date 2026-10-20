import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Плавающая кнопка «N» режима разработки мешает скриншотам и тестам.
  devIndicators: false,
  // Серверный роут чата читает persona.md с диска — нужно включить файлы в сборку.
  outputFileTracingIncludes: {
    "/api/chat": ["./content/coaches/**/*"],
  },
};

export default nextConfig;
