import gromov from "@/content/coaches/gromov/meta.json";
import marina from "@/content/coaches/marina/meta.json";
import max from "@/content/coaches/max/meta.json";
import palych from "@/content/coaches/palych/meta.json";
import { COACH_IDS, type CoachId } from "@/lib/data/types";

/** Описание тренера из content/coaches/<id>/meta.json. */
export interface CoachMeta {
  id: CoachId;
  name: string;
  fullName: string;
  gender: "m" | "f";
  tagline: string;
  /** Подсказка в поле ввода — у каждого тренера своя. */
  placeholder: string;
  /** Сколько часов тренер игнорирует после пропуска. */
  ignoreHours: number;
  status: { waiting: string; busy: string; ignoring: string; away: string };
  hero: { waiting: string; ignoring: string; free: string };
}

export const COACHES: Record<CoachId, CoachMeta> = {
  gromov: gromov as CoachMeta,
  marina: marina as CoachMeta,
  palych: palych as CoachMeta,
  max: max as CoachMeta,
};

export function isCoachId(value: string): value is CoachId {
  return (COACH_IDS as readonly string[]).includes(value);
}

export function getCoach(id: CoachId): CoachMeta {
  return COACHES[id];
}
