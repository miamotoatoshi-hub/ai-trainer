const ONES = [
  "ноль",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

/** Число прописью (0..999): 42 → «сорок два». Нужно, чтобы озвучивать счёт и «осталось три». */
export function numberToWords(n: number): string {
  const value = Math.max(0, Math.min(999, Math.trunc(n)));
  if (value < 20) return ONES[value]!;
  const parts: string[] = [];
  const h = Math.floor(value / 100);
  const rest = value % 100;
  if (h > 0) parts.push(HUNDREDS[h]!);
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]!);
    if (rest % 10 > 0) parts.push(ONES[rest % 10]!);
  } else if (rest > 0) {
    parts.push(ONES[rest]!);
  }
  return parts.join(" ");
}

/** Слово для счёта повторений: «раз, два, три…». */
export function countWord(n: number): string {
  return n === 1 ? "раз" : numberToWords(n);
}
