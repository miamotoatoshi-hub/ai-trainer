import type { AvatarSpec } from "@/lib/coach/face";

const GRAY = "#D3D7DE";

/** Палыч: фон бледно-синий, седые виски, круглые очки, седые усы, синяя одежда. */
export const avatarSpec: AvatarSpec = {
  background: "#DCE7FF",
  skin: "#E7B79B",
  skinShade: "#D29E80",
  browColor: "#9AA1AE",
  browWidth: 3.2,
  eyes: "normal",
  neutralMouth: "line",
  clothes:
    `<path d="M6 100 C8 80 28 73 50 73 C72 73 92 80 94 100 Z" fill="#2F5DC9"/>` +
    `<path d="M42 73 L50 82 L58 73 Z" fill="#D29E80"/>` +
    `<path d="M36 74 L42 73 L50 82 Z M64 74 L58 73 L50 82 Z" fill="#244BA3"/>`,
  frontHair:
    `<path d="M31 46 C28.5 36 32 29 38 27 C35 33 35 40 33.5 48 Z" fill="${GRAY}"/>` +
    `<path d="M69 46 C71.5 36 68 29 62 27 C65 33 65 40 66.5 48 Z" fill="${GRAY}"/>`,
  accessories: (emotion) => {
    const lens = emotion === "surprised" ? 7.2 : 6.4;
    const glasses =
      `<circle cx="42" cy="47" r="${lens}" fill="rgba(255,255,255,0.22)" stroke="#0B1B3F" stroke-width="1.7"/>` +
      `<circle cx="58" cy="47" r="${lens}" fill="rgba(255,255,255,0.22)" stroke="#0B1B3F" stroke-width="1.7"/>` +
      `<path d="M48.4 46.5 Q50 45 51.6 46.5" fill="none" stroke="#0B1B3F" stroke-width="1.7"/>`;
    const moustache = `<path d="M41.5 56.5 C45 53 48.5 55 50 56 C51.5 55 55 53 58.5 56.5 C56 60.5 53 59.5 50 58.5 C47 59.5 44 60.5 41.5 56.5 Z" fill="${GRAY}"/>`;
    return glasses + moustache;
  },
};
