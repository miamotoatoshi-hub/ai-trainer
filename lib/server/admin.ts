import { timingSafeEqual } from "node:crypto";

/**
 * Доступ владельца к служебным страницам (/admin/costs). Аккаунтов нет, поэтому защита — секретная
 * строка ADMIN_TOKEN из .env.local: открыть страницу можно, только добавив её в адрес (`?token=…`).
 * Если ADMIN_TOKEN не задан, страница открыта только при локальной разработке.
 */
export function isAdminAllowed(token: string | undefined): boolean {
  const secret = process.env.ADMIN_TOKEN?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
