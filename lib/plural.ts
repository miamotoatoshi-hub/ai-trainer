/** Русское склонение: plural(1, ["тренировка", "тренировки", "тренировок"]) → "тренировка". */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const last2 = abs % 100;
  const last = abs % 10;
  if (last2 >= 11 && last2 <= 19) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
