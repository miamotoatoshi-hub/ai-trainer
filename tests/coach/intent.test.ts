import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/coach/intent";
import type { ScriptedCategory } from "@/lib/coach/scripted";

const CASES: [string, ScriptedCategory][] = [
  ["привет", "greeting"],
  ["Здравствуйте, тренер", "greeting"],
  ["добрый вечер", "greeting"],
  ["прости, был занят", "apology"],
  ["извини пожалуйста", "apology"],
  ["сегодня не могу, уроки", "excuse"],
  ["завтра потренируюсь", "excuse"],
  ["я устал", "tired"],
  ["нет сил совсем", "tired"],
  ["слишком тяжело", "hard"],
  ["брошу всё это", "quit"],
  ["мне надоело", "quit"],
  ["что по плану?", "ask_plan"],
  ["когда тренировка", "ask_plan"],
  ["спасибо!", "thanks"],
  ["смотри, я сделал 30 приседаний", "proud_me"],
  ["ты человек?", "who_are_you"],
  ["как дела", "how_are_you"],
  ["ты мне нравишься", "flirt"],
  ["давай встретимся", "flirt"],
  ["ты тупой тренер", "insult_me"],
  ["заткнись", "insult_me"],
  ["погода сегодня хорошая", "fallback"],
  ["", "fallback"],
];

describe("classifyIntent", () => {
  it.each(CASES)("%s → %s", (text, expected) => {
    expect(classifyIntent(text)).toBe(expected);
  });
});
