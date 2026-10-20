import ru from "@/locales/ru.json";

type Messages = typeof ru;

// Все допустимые ключи вида "screens.chats" — опечатка в ключе не пройдёт компиляцию.
type KeyPath<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${KeyPath<T[K]>}`;
}[keyof T & string];

export type MessageKey = KeyPath<Messages>;
export type MessageParams = Record<string, string | number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Достаёт строку из locales/ru.json по ключу и подставляет {параметры}.
 * Сейчас язык один (ru); когда появится второй — выбор языка добавится сюда.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (isRecord(node) ? node[part] : undefined), ru);

  if (typeof value !== "string") {
    throw new Error(`Нет перевода для ключа "${key}"`);
  }

  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
