/**
 * Оценка стоимости платных вызовов. Цены меняются — это ОЦЕНКА для контроля порядка расходов,
 * а не бухгалтерия. Переопределяются переменными COST_* в .env.local.
 */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const COST = {
  /** ElevenLabs Flash: доллары за 1000 символов. */
  ttsPer1kChars: () => num(process.env.COST_TTS_PER_1K_CHARS, 0.12),
  /** Чат: доллары за миллион входных и выходных токенов (модель по умолчанию). */
  llmInputPerMTok: () => num(process.env.COST_LLM_INPUT_PER_MTOK, 0.1),
  llmOutputPerMTok: () => num(process.env.COST_LLM_OUTPUT_PER_MTOK, 0.5),
};

export function ttsCostUsd(chars: number): number {
  return (chars / 1000) * COST.ttsPer1kChars();
}

export function llmCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST.llmInputPerMTok() +
    (outputTokens / 1_000_000) * COST.llmOutputPerMTok()
  );
}
