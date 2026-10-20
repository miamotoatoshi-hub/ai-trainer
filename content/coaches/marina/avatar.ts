import type { AvatarSpec } from "@/lib/coach/face";

/** Марина: фон светло-синий, длинные тёмно-синие волосы, холодный прищур, белая одежда. */
export const avatarSpec: AvatarSpec = {
  background: "#BFD4FF",
  skin: "#F2CFBA",
  skinShade: "#E3B8A0",
  browColor: "#1B2A5B",
  browWidth: 2.2,
  eyes: "narrow",
  neutralMouth: "line",
  backHair: `<path d="M26.5 46 C23 27 36 18 50 18 C64 18 77 27 73.5 46 C76 64 75 82 82 96 L18 96 C25 82 24 64 26.5 46 Z" fill="#1B2A5B"/>`,
  clothes:
    `<path d="M6 100 C8 80 28 73 50 73 C72 73 92 80 94 100 Z" fill="#FFFFFF"/>` +
    `<path d="M40 73.5 L50 86 L60 73.5" fill="none" stroke="#C9D6F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  frontHair:
    `<path d="M30 48 C28 29 40 24 50 24 C61 24 72 30 70 48 C68 40 62 33.5 53 32 C46 36 36 38 30 48 Z" fill="#1B2A5B"/>` +
    `<path d="M29.5 46 C28 62 29 72 31 80 C32 66 31.5 56 33 46 Z M70.5 46 C72 62 71 72 69 80 C68 66 68.5 56 67 46 Z" fill="#1B2A5B"/>`,
};
