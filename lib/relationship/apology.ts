/** Похоже ли сообщение на извинение. Тренер не верит словам: очки за них не начисляются (0). */
export function looksLikeApology(text: string): boolean {
  return /прост[иы]|извин|сорри|виноват|мой косяк|не повторится/i.test(text);
}
