import type { AvatarSpec } from "@/lib/coach/face";

/** Макс: фон яркий синий, тёмная кепка, смуглая кожа, ухмылка, белая футболка. */
export const avatarSpec: AvatarSpec = {
  background: "#3D74FF",
  skin: "#C98E62",
  skinShade: "#B57A50",
  browColor: "#3A2A20",
  browWidth: 3.2,
  eyes: "normal",
  neutralMouth: "smirk",
  clothes:
    `<path d="M6 100 C8 80 28 73 50 73 C72 73 92 80 94 100 Z" fill="#FFFFFF"/>` +
    `<path d="M40 73.5 Q50 84 60 73.5" fill="none" stroke="#C9D6F2" stroke-width="2.2" stroke-linecap="round"/>`,
  frontHair:
    // кепка: купол и козырёк
    `<path d="M30 33.5 C30 15 40 11.5 50 11.5 C60 11.5 70 15 70 33.5 Z" fill="#0B1B3F"/>` +
    `<path d="M26.5 31.5 Q50 38 73.5 31.5 Q76 34.5 72.5 36 Q50 41 27.5 36 Q24 34.5 26.5 31.5 Z" fill="#16295E"/>` +
    `<path d="M30.5 40 C29.5 43 30 47 31.5 49 C32.5 46.5 32.5 43.5 33 40 Z M69.5 40 C70.5 43 70 47 68.5 49 C67.5 46.5 67.5 43.5 67 40 Z" fill="#3A2A20"/>`,
};
