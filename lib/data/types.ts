// Общие типы данных ПИНКА. Всё хранится на устройстве (IndexedDB), см. DECISIONS.md.

export const COACH_IDS = ["gromov", "marina", "palych", "max"] as const;
export type CoachId = (typeof COACH_IDS)[number];

export const EMOTIONS = [
  "angry",
  "disappointed",
  "contempt",
  "surprised",
  "neutral",
  "proud",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type Harshness = 1 | 2 | 3;
export type AgeBand = "13-15" | "16-17" | "18+";
export type Goal = "strength" | "weight" | "endurance" | "shape";
export type NotifFrequency = "normal" | "rare" | "workout_day" | "off";

export const EXERCISE_IDS = ["squat", "pushup", "lunge", "plank", "jumping_jack"] as const;
export type ExerciseId = (typeof EXERCISE_IDS)[number];

/** Уровни отношения тренера: Презирает → Терпит → Уважает → Гордится. */
export const LEVELS = ["despises", "tolerates", "respects", "proud"] as const;
export type RelationshipLevel = (typeof LEVELS)[number];

/** Состояние тренера. «Гордится» — это уровень, а не состояние; игнор — временное состояние. */
export type CoachState = "normal" | "ignoring";

export interface Profile {
  id: "me";
  /** Случайный идентификатор для серверных лимитов (аккаунтов нет). */
  anonId: string;
  name: string;
  ageBand: AgeBand | null;
  goal: Goal | null;
  minutesPerDay: number;
  /** Дни тренировок: 0 = воскресенье … 6 = суббота (как в JS Date.getDay). */
  scheduleDays: number[];
  /** Время тренировки "HH:MM". */
  scheduleTime: string;
  harshness: Harshness;
  voiceEnabled: boolean;
  notifFrequency: NotifFrequency;
  quietStart: string;
  quietEnd: string;
  /** Тренер, чья тренировка показана в карточке-герое по умолчанию. */
  activeCoachId: CoachId;
  onboardingDone: boolean;
  ageConfirmed13: boolean;
  safetyAccepted: boolean;
  clipPrivacyAccepted: boolean;
  /** Режим отладки: скелет позы и углы на экране тренировки. */
  debug: boolean;
  demo: boolean;
  /** До какого момента (мс) уколы и игнор выключены после сигнала кризиса. */
  supportPausedUntil: number | null;
  lastOpenedAt: number | null;
  createdAt: number;
}

export interface UserCoach {
  coachId: CoachId;
  /** Очки отношения 0..100. */
  score: number;
  /** Текущий уровень с «буфером» на понижение (см. lib/relationship). */
  level: RelationshipLevel;
  state: CoachState;
  ignoringUntil: number | null;
  ignoreStartedAt: number | null;
  /** Когда должно прийти единственное «холодное» сообщение за период игнора. */
  coldMessageDueAt: number | null;
  coldMessageSent: boolean;
  unlocked: boolean;
  unlockedAt: number | null;
  lastInteractionAt: number | null;
  lastWorkoutAt: number | null;
  /** Последний день ("YYYY-MM-DD"), за который уже начислен штраф «день без тренировки». */
  lastDecayDay: string | null;
  statusPostedAt: number | null;
}

export type MessageSender = "user" | "coach" | "system";
export type MessageType = "text" | "voice" | "workout_card" | "status" | "support";

export interface MessageMeta {
  planId?: string;
  scheduledId?: string;
  scheduledAt?: number;
  /** Что тренер сказал голосом (для голосового сообщения это его текст). */
  transcript?: string;
  /** Откуда взялось сообщение (для отладки и подсчёта затрат). */
  source?: "llm" | "scripted" | "away" | "system";
}

export interface Message {
  id: number;
  coachId: CoachId;
  sender: MessageSender;
  type: MessageType;
  text: string;
  emotion: Emotion | null;
  durationSec: number | null;
  meta: MessageMeta;
  /** Для сообщений пользователя — «прочитано тренером» (две галочки); для тренера — прочитано пользователем. */
  readAt: number | null;
  createdAt: number;
}
export type NewMessage = Omit<Message, "id">;

export interface MemoryFact {
  id: number;
  coachId: CoachId;
  fact: string;
  kind: "fact" | "limitation";
  createdAt: number;
}
export type NewMemoryFact = Omit<MemoryFact, "id">;

export interface ExerciseResult {
  exerciseId: ExerciseId;
  /** reps — повторения, sec — секунды удержания. */
  unit: "reps" | "sec";
  total: number;
  clean: number;
  shallow: number;
  bestStreak: number;
  errors: Record<string, number>;
}

export interface SessionOutcome {
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  levelBefore: RelationshipLevel;
  levelAfter: RelationshipLevel;
  levelUp: boolean;
  capped: boolean;
  events: { type: string; delta: number }[];
  verdictKind: "great" | "ok" | "bad";
  verdictText: string;
  /** id заранее озвученной фразы вердикта (если есть mp3). */
  verdictPhraseId?: string;
  emotion: Emotion;
  ignoreEnded: boolean;
  streak: number;
}

export interface WorkoutSession {
  id: string;
  coachId: CoachId;
  planId: string;
  mode: "plan" | "onboarding" | "free" | "duel";
  startedAt: number;
  endedAt: number | null;
  status: "active" | "done" | "abandoned";
  scheduledId: string | null;
  totalReps: number;
  cleanReps: number;
  shallowReps: number;
  bestStreak: number;
  durationSec: number;
  results: ExerciseResult[];
  personalRecords: ExerciseId[];
  outcome: SessionOutcome | null;
}

export interface ScheduledWorkout {
  id: string;
  coachId: CoachId;
  planId: string;
  scheduledAt: number;
  status: "planned" | "done" | "missed" | "skipped";
}

export interface ExerciseRecord {
  exerciseId: ExerciseId;
  bestTotal: number;
  bestClean: number;
  updatedAt: number;
}

export interface UsageRow {
  /** "YYYY-MM-DD:kind", например "2026-10-20:chat". */
  key: string;
  count: number;
}

export interface RelationshipEventRow {
  id: number;
  coachId: CoachId;
  type: string;
  /** Сколько очков реально применено (после потолка и границ 0..100). */
  delta: number;
  rawDelta: number;
  day: string;
  createdAt: number;
}
export type NewRelationshipEventRow = Omit<RelationshipEventRow, "id">;

export interface NotificationLogRow {
  id: number;
  kind: string;
  coachId: CoachId;
  day: string;
  sentAt: number;
}
export type NewNotificationLogRow = Omit<NotificationLogRow, "id">;

export interface Duel {
  /** Код вызова из ссылки. */
  id: string;
  role: "challenger" | "opponent";
  exerciseId: ExerciseId;
  durationSec: number;
  challengerName: string;
  challengerResult: number | null;
  opponentName: string | null;
  opponentResult: number | null;
  createdAt: number;
}

export interface ClipRow {
  sessionId: string;
  blob: Blob;
  mime: string;
  durationSec: number;
  moment: string;
  createdAt: number;
}

export interface ExportBundle {
  exportedAt: string;
  app: "pinok";
  version: 1;
  data: Record<string, unknown>;
}
