import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import type { ReactNode } from "react";
import { AppBootstrap } from "@/components/AppBootstrap";
import { t } from "@/lib/i18n";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-manrope",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
  applicationName: t("app.name"),
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Поля ввода по макету — 15px; без этого iOS приближает экран при фокусе.
  maximumScale: 1,
  viewportFit: "cover",
  // тот же синий, что --accent в дизайн-системе
  themeColor: "#1F5BFF",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body>
        <div className="app-shell">
          <div className="app-frame" id="app-frame">
            <AppBootstrap>{children}</AppBootstrap>
          </div>
        </div>
      </body>
    </html>
  );
}
