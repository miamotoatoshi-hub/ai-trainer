import type {
  ClipMeta,
  ClipRow,
  CoachId,
  Duel,
  ExerciseRecord,
  ExportBundle,
  MemoryFact,
  Message,
  NewMemoryFact,
  NewMessage,
  NewNotificationLogRow,
  NewRelationshipEventRow,
  NotificationLogRow,
  Profile,
  RelationshipEventRow,
  ScheduledWorkout,
  UsageRow,
  UserCoach,
  WorkoutSession,
} from "./types";

/**
 * Единственная точка доступа к данным. Экраны и сервисы знают только этот интерфейс.
 * Сейчас реализация — Dexie/IndexedDB (lib/data/dexieRepository.ts);
 * позже её можно заменить на Supabase, не трогая экраны.
 */
export interface Repository {
  /** Подписка на любые изменения данных. Возвращает функцию отписки. */
  subscribe(listener: () => void): () => void;

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile>;

  listUserCoaches(): Promise<UserCoach[]>;
  getUserCoach(coachId: CoachId): Promise<UserCoach>;
  putUserCoach(coach: UserCoach): Promise<void>;

  /** Сообщения одного тренера по возрастанию времени. */
  listMessages(coachId: CoachId): Promise<Message[]>;
  lastMessages(): Promise<Partial<Record<CoachId, Message>>>;
  unreadCounts(): Promise<Partial<Record<CoachId, number>>>;
  addMessage(message: NewMessage): Promise<Message>;
  updateMessage(id: number, patch: Partial<Omit<Message, "id">>): Promise<void>;
  /** Пользователь прочитал сообщения тренера. */
  markCoachMessagesRead(coachId: CoachId, at: number): Promise<void>;
  /** Тренер «прочитал» сообщения пользователя (две галочки). */
  markUserMessagesRead(coachId: CoachId, at: number): Promise<void>;

  listMemory(coachId: CoachId): Promise<MemoryFact[]>;
  addMemory(fact: NewMemoryFact): Promise<void>;
  deleteMemory(id: number): Promise<void>;

  getSession(id: string): Promise<WorkoutSession | undefined>;
  putSession(session: WorkoutSession): Promise<void>;
  /** Тренировки по убыванию времени начала. */
  listSessions(limit?: number): Promise<WorkoutSession[]>;

  listScheduled(): Promise<ScheduledWorkout[]>;
  putScheduled(item: ScheduledWorkout): Promise<void>;
  deleteScheduled(id: string): Promise<void>;

  listRecords(): Promise<ExerciseRecord[]>;
  putRecord(record: ExerciseRecord): Promise<void>;

  getUsage(key: string): Promise<number>;
  incrementUsage(key: string, by?: number): Promise<number>;
  listUsage(): Promise<UsageRow[]>;

  addRelationshipEvent(row: NewRelationshipEventRow): Promise<void>;
  listRelationshipEvents(coachId: CoachId, sinceTs?: number): Promise<RelationshipEventRow[]>;

  addNotificationLog(row: NewNotificationLogRow): Promise<void>;
  listNotificationLog(sinceTs: number): Promise<NotificationLogRow[]>;

  getDuel(id: string): Promise<Duel | undefined>;
  putDuel(duel: Duel): Promise<void>;
  listDuels(): Promise<Duel[]>;

  getClip(sessionId: string): Promise<ClipRow | undefined>;
  /** Все клипы без самих видео (для очистки и списка). */
  listClipMeta(): Promise<ClipMeta[]>;
  putClip(clip: ClipRow): Promise<void>;
  deleteClip(sessionId: string): Promise<void>;

  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;

  /** Все данные одним JSON (без видео-клипов). */
  exportAll(): Promise<ExportBundle>;
  /** Полное удаление всех данных пользователя. */
  deleteAll(): Promise<void>;
}
