import type { Emotion } from "@/lib/data/types";

/** Всё, что отличает одного тренера от другого. Рисуем в квадрате 100×100. */
export interface AvatarSpec {
  background: string;
  skin: string;
  skinShade: string;
  browColor: string;
  browWidth: number;
  /** Форма глаз: обычные или холодный прищур. */
  eyes: "normal" | "narrow";
  /** Спокойное выражение рта: прямая линия или ухмылка. */
  neutralMouth: "line" | "smirk";
  /** Волосы за головой (длинные волосы). */
  backHair?: string;
  /** Одежда: плечи и воротник. */
  clothes: string;
  /** Волосы/кепка поверх головы. */
  frontHair?: string;
  /** Дополнительные детали поверх лица (очки, усы), получают эмоцию. */
  accessories?: (emotion: Emotion) => string;
}

const INK = "#0B1B3F";
const MOUTH = "#5B2A22";

function eyes(emotion: Emotion, spec: AvatarSpec): string {
  const lx = 42;
  const rx = 58;
  const y = emotion === "disappointed" ? 47.8 : 47;
  if (emotion === "surprised") {
    return [lx, rx]
      .map(
        (x) =>
          `<circle cx="${x}" cy="${y}" r="3.6" fill="#fff" stroke="${INK}" stroke-width="0.9"/>` +
          `<circle cx="${x}" cy="${y}" r="1.7" fill="${INK}"/>`,
      )
      .join("");
  }
  if (emotion === "contempt" || spec.eyes === "narrow") {
    // полуприкрытые глаза: тонкий овал и линия века
    return [lx, rx]
      .map(
        (x) =>
          `<ellipse cx="${x}" cy="${y + 0.4}" rx="2.5" ry="1.3" fill="${INK}"/>` +
          `<path d="M${x - 3.4} ${y - 1} L${x + 3.4} ${y - 1}" stroke="${spec.browColor}" stroke-width="1.2" stroke-linecap="round"/>`,
      )
      .join("");
  }
  const ry = emotion === "angry" ? 2.1 : 2.6;
  return [lx, rx]
    .map((x) => `<ellipse cx="${x}" cy="${y}" rx="2.1" ry="${ry}" fill="${INK}"/>`)
    .join("");
}

function brows(emotion: Emotion, spec: AvatarSpec): string {
  const stroke = `stroke="${spec.browColor}" stroke-width="${spec.browWidth}" stroke-linecap="round" fill="none"`;
  const shapes: Record<Emotion, [string, string]> = {
    neutral: ["M36 39.5 L47 39.5", "M53 39.5 L64 39.5"],
    // внутренние концы опущены — сведённые брови
    angry: ["M36 36 L47 41", "M53 41 L64 36"],
    // внутренние концы подняты — «разочарован»
    disappointed: ["M36 41 L47 37.5", "M53 37.5 L64 41"],
    // одна бровь выше другой
    contempt: ["M36 39 L47 39.8", "M53 35.5 Q58.5 33.5 64 36.5"],
    surprised: ["M37 35 Q42 31.5 47 35", "M53 35 Q58 31.5 63 35"],
    proud: ["M37 38.5 Q42 36 47 38.5", "M53 38.5 Q58 36 63 38.5"],
  };
  const [left, right] = shapes[emotion];
  return `<path d="${left}" ${stroke}/><path d="${right}" ${stroke}/>`;
}

function mouth(emotion: Emotion, spec: AvatarSpec): string {
  const stroke = `stroke="${MOUTH}" stroke-width="2.2" stroke-linecap="round" fill="none"`;
  switch (emotion) {
    case "angry":
      return `<path d="M43 61 Q50 55.5 57 61" ${stroke}/>`;
    case "disappointed":
      return `<path d="M44 60 Q50 56.5 56 60" ${stroke}/>`;
    case "contempt":
      return `<path d="M43.5 59 L53 59 Q57 59 58.5 55.5" ${stroke}/>`;
    case "surprised":
      return `<ellipse cx="50" cy="59.5" rx="3.2" ry="4.2" fill="#7A1F1F"/>`;
    case "proud":
      return `<path d="M42 56.5 Q50 64 58 56.5" ${stroke}/>`;
    default:
      return spec.neutralMouth === "smirk"
        ? `<path d="M43.5 58.5 L52 58.5 Q56 58.5 58 55.5" ${stroke}/>`
        : `<path d="M43.5 58.5 L56.5 58.5" ${stroke}/>`;
  }
}

/** Собирает внутренности SVG (viewBox 0 0 100 100) для тренера и эмоции. */
export function buildAvatarMarkup(spec: AvatarSpec, emotion: Emotion): string {
  const body =
    `<rect x="43" y="60" width="14" height="18" rx="5" fill="${spec.skinShade}"/>` +
    `<circle cx="31.2" cy="48" r="3.4" fill="${spec.skinShade}"/>` +
    `<circle cx="68.8" cy="48" r="3.4" fill="${spec.skinShade}"/>` +
    `<ellipse cx="50" cy="46" rx="19" ry="22" fill="${spec.skin}"/>`;
  return (
    `<rect width="100" height="100" fill="${spec.background}"/>` +
    (spec.backHair ?? "") +
    spec.clothes +
    body +
    (spec.frontHair ?? "") +
    eyes(emotion, spec) +
    brows(emotion, spec) +
    mouth(emotion, spec) +
    (spec.accessories ? spec.accessories(emotion) : "")
  );
}
