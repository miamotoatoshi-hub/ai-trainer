import type { AvatarSpec } from "@/lib/coach/face";

/** Громов: фон тёмно-синий, короткие чёрные волосы, сведённые брови, прямой рот. */
export const avatarSpec: AvatarSpec = {
  background: "#0B1B3F",
  skin: "#E9B896",
  skinShade: "#D79F7B",
  browColor: "#15171C",
  browWidth: 3.6,
  eyes: "normal",
  neutralMouth: "line",
  clothes:
    `<path d="M6 100 C8 80 28 73 50 73 C72 73 92 80 94 100 Z" fill="#5A6B3A"/>` +
    `<path d="M41 73 L50 85 L59 73 Z" fill="#D79F7B"/>` +
    `<path d="M36 74 L43 73 L50 85 Z M64 74 L57 73 L50 85 Z" fill="#46552C"/>`,
  frontHair:
    `<path d="M30.5 46 C27.5 24 41 19.5 50 19.5 C59 19.5 72.5 24 69.5 46 C67.5 37 62 31.5 50 31.5 C38 31.5 32.5 37 30.5 46 Z" fill="#15171C"/>` +
    `<rect x="30.5" y="42" width="3" height="9" rx="1.5" fill="#15171C"/>` +
    `<rect x="66.5" y="42" width="3" height="9" rx="1.5" fill="#15171C"/>`,
};
