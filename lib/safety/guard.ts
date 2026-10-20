/**
 * Проверка ответа тренера ПОСЛЕ нейросети. Если в тексте есть то, чего тренер не делает
 * никогда (раздел 10 ТЗ), ответ отбрасывается и вместо него берётся заготовленная реплика.
 */

function word(pattern: string): string {
  return `(?<![а-яёa-z])(?:${pattern})`;
}

/** Телесные оскорбления и унижение внешности, веса, роста, пола, национальности, семьи, денег, учёбы. */
const INSULTS = [
  word("толст"),
  word("жирн"),
  word("жиртрес"),
  word("жирдя"),
  word("тощ"),
  word("дистроф"),
  word("пухл"),
  word("худ(?:ой|ая|ое) как"),
  word("урод(?![а-яё]*(?:ился|илась))"),
  word("страшил"),
  word("некраси"),
  word("уродлив"),
  word("коротыш"),
  word("карлик"),
  word("дылда"),
  word("безрук"),
  word("девчонк[аи] не"),
  word("как баб[аы]"),
  word("как девчонк"),
  word("нищ"),
  word("бедняк"),
  word("тупиц"),
  word("тупой"),
  word("тупая"),
  word("дебил"),
  word("идиот"),
  word("даун"),
  word("твоя мать"),
  word("твоя мама"),
  word("твой отец"),
  word("хач(?![а-яё])"),
  word("чурк"),
  word("жид(?![а-яё])"),
  word("хохол"),
  word("москал"),
].join("|");

const FLIRT = [
  word("люблю тебя"),
  word("целую"),
  word("обнимаю"),
  word("скучаю по тебе"),
  word("ты мне нужен"),
  word("ты мне нужна"),
  word("ты мне нравишься"),
  word("красавчик"),
  word("красотка"),
  word("красавица"),
  word("милаш"),
  word("котик"),
  word("зайка"),
  word("солнышко"),
  word("дорогой мой"),
  word("дорогая моя"),
  word("сексуальн"),
  word("свидани(?:е|ю|ем)(?![а-яё])"),
  word("встретимся"),
  word("ты (?:мой|моя) любим"),
  word("(?:мой|моя) любим(?:ый|ая) (?:человек|парень|девушка|тренер)"),
].join("|");

const PROFANITY = [
  word("ху[йяеи]"),
  word("пизд"),
  word("[её]б[аоуыи]"),
  word("[её]бан"),
  word("бл[яе][дт]"),
  word("бля(?![а-яё])"),
  word("сука"),
  word("суки"),
  word("мудак"),
  word("мудил"),
  word("гандон"),
  word("пидор"),
  word("пидр"),
  word("залуп"),
  word("долбо[её]б"),
  word("шлюх"),
].join("|");

/** Советы по лекарствам, добавкам, диетам и калориям — это не дело тренера в приложении. */
const MEDICAL = [
  word("калори"),
  word("ккал"),
  word("диет"),
  word("таблетк"),
  word("лекарств"),
  word("добавк"),
  word("анаболик"),
  word("стероид"),
  word("жиросжига"),
  word("спортпит"),
  word("протеин"),
  word("креатин"),
  word("голодовк"),
  word("разгрузочн"),
  word("обезболива"),
  word("ибупрофен"),
  word("мазь"),
].join("|");

/** Тренер не должен пытаться работать психологом или врачом. */
const DIAGNOSIS = [word("диагноз"), word("у тебя депресси"), word("у тебя расстройств")].join("|");

/** Опасные «советы терпеть»: боль — повод остановиться, а не проявить характер. */
const UNSAFE = [
  word("терпи(?![а-яё])"),
  word("без боли нет"),
  word("через боль"),
  word("игнорируй боль"),
  word("не обращай внимания на боль"),
  word("боль пройд[её]т"),
  word("не ной(?![а-яё])"),
  word("сам виноват"),
].join("|");

const RULES: { reason: GuardReason; re: RegExp }[] = [
  { reason: "unsafe", re: new RegExp(UNSAFE, "i") },
  { reason: "insult", re: new RegExp(INSULTS, "i") },
  { reason: "flirt", re: new RegExp(FLIRT, "i") },
  { reason: "profanity", re: new RegExp(PROFANITY, "i") },
  { reason: "medical", re: new RegExp(MEDICAL, "i") },
  { reason: "diagnosis", re: new RegExp(DIAGNOSIS, "i") },
];

export type GuardReason =
  "insult" | "flirt" | "profanity" | "medical" | "diagnosis" | "unsafe" | "empty";

export interface GuardVerdict {
  ok: boolean;
  reason?: GuardReason;
}

/** Можно ли показать эту реплику тренера пользователю. */
export function checkCoachReply(
  text: string,
  options: { allowMedicalTerms?: boolean } = {},
): GuardVerdict {
  const clean = text.toLowerCase().trim();
  if (!clean) return { ok: false, reason: "empty" };
  for (const rule of RULES) {
    // Отказ от советов («про лекарства не даю») обязан называть тему — для него медицинские слова допустимы.
    if (options.allowMedicalTerms && rule.reason === "medical") continue;
    if (rule.re.test(clean)) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}
