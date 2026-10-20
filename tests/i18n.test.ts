import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { t } from "@/lib/i18n";

// Собирает все строки-листья из вложенного JSON вместе с их путями.
function collectStrings(node: unknown, path: string[] = []): { path: string; value: string }[] {
  if (typeof node === "string") return [{ path: path.join("."), value: node }];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) => collectStrings(child, [...path, key]));
}

describe("t()", () => {
  it("возвращает строку по ключу", () => {
    expect(t("app.name")).toBe("ПИНОК");
    expect(t("screens.chats")).toBe("Тренеры");
  });

  it("подставляет параметры в {скобках}", () => {
    expect(t("home.streak", { n: 7, unit: "дней" })).toBe("Серия 7 дней");
    expect(t("common.idLabel", { id: "gromov" })).toBe("ID: gromov");
  });

  it("оставляет {параметр} как есть, если значение не передано", () => {
    expect(t("home.streak", {})).toBe("Серия {n} {unit}");
    expect(t("home.streak")).toBe("Серия {n} {unit}");
  });
});

describe("locales/ru.json", () => {
  it("не содержит пустых строк", () => {
    const empty = collectStrings(ru).filter(({ value }) => value.trim() === "");
    expect(empty).toEqual([]);
  });
});
