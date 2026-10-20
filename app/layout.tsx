import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // тот же синий, что --accent (#1F5BFF) в дизайн-системе
  themeColor: "#1F5BFF",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
