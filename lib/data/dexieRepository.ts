import Dexie, { type Table } from "dexie";
import { allDefaultUserCoaches, defaultProfile, defaultUserCoach } from "./defaults";
import type { Repository } from "./repository";
import {
  COACH_IDS,
  type ClipRow,
  type CoachId,
  type Duel,
  type ExerciseRecord,
  type ExportBundle,
  type MemoryFact,
  type Message,
  type NewMemoryFact,
  type NewMessage,
  type NewNotificationLogRow,
  type NewRelationshipEventRow,
  type NotificationLogRow,
  type Profile,
  type RelationshipEventRow,
  type ScheduledWorkout,
  type UsageRow,
  type UserCoach,
  type WorkoutSession,
} from "./types";

interface MetaRow {
  key: string;
  value: unknown;
}

class PinokDB extends Dexie {
  profile!: Table<Profile, string>;
  userCoaches!: Table<UserCoach, string>;
  messages!: Table<Message, number, NewMessage>;
  memory!: Table<MemoryFact, number, NewMemoryFact>;
  sessions!: Table<WorkoutSession, string>;
  scheduled!: Table<ScheduledWorkout, string>;
  records!: Table<ExerciseRecord, string>;
  usage!: Table<UsageRow, string>;
  relEvents!: Table<RelationshipEventRow, number, NewRelationshipEventRow>;
  notifLog!: Table<NotificationLogRow, number, NewNotificationLogRow>;
  duels!: Table<Duel, string>;
  clips!: Table<ClipRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      profile: "id",
      userCoaches: "coachId",
      messages: "++id, coachId, createdAt, [coachId+createdAt]",
      memory: "++id, coachId",
      sessions: "id, startedAt, coachId",
      scheduled: "id, scheduledAt, status",
      records: "exerciseId",
      usage: "key",
      relEvents: "++id, coachId, createdAt",
      notifLog: "++id, sentAt, day",
      duels: "id, createdAt",
      clips: "sessionId",
      meta: "key",
    });
  }
}

export class DexieRepository implements Repository {
  private readonly db: PinokDB;
  private readonly listeners = new Set<() => void>();

  constructor(name = "pinok") {
    this.db = new PinokDB(name);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  // --- профиль ---

  async getProfile(): Promise<Profile> {
    return this.db.transaction("rw", this.db.profile, async () => {
      const existing = await this.db.profile.get("me");
      if (existing) return existing;
      const created = defaultProfile(Date.now());
      await this.db.profile.put(created);
      return created;
    });
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
    const next = await this.db.transaction("rw", this.db.profile, async () => {
      const current = (await this.db.profile.get("me")) ?? defaultProfile(Date.now());
      const merged: Profile = { ...current, ...patch, id: "me" };
      await this.db.profile.put(merged);
      return merged;
    });
    this.emit();
    return next;
  }

  // --- тренеры ---

  async listUserCoaches(): Promise<UserCoach[]> {
    await this.ensureCoaches();
    const rows = await this.db.userCoaches.toArray();
    return COACH_IDS.map((id) => rows.find((r) => r.coachId === id)).filter(
      (r): r is UserCoach => r !== undefined,
    );
  }

  async getUserCoach(coachId: CoachId): Promise<UserCoach> {
    return this.db.transaction("rw", this.db.userCoaches, async () => {
      const existing = await this.db.userCoaches.get(coachId);
      if (existing) return existing;
      const created = defaultUserCoach(coachId, Date.now());
      await this.db.userCoaches.put(created);
      return created;
    });
  }

  async putUserCoach(coach: UserCoach): Promise<void> {
    await this.db.userCoaches.put(coach);
    this.emit();
  }

  private async ensureCoaches(): Promise<void> {
    await this.db.transaction("rw", this.db.userCoaches, async () => {
      const have = new Set((await this.db.userCoaches.toArray()).map((r) => r.coachId));
      const missing = allDefaultUserCoaches(Date.now()).filter((c) => !have.has(c.coachId));
      if (missing.length > 0) await this.db.userCoaches.bulkPut(missing);
    });
  }

  // --- сообщения ---

  async listMessages(coachId: CoachId): Promise<Message[]> {
    return this.db.messages
      .where("[coachId+createdAt]")
      .between([coachId, Dexie.minKey], [coachId, Dexie.maxKey])
      .toArray();
  }

  async lastMessages(): Promise<Partial<Record<CoachId, Message>>> {
    const result: Partial<Record<CoachId, Message>> = {};
    for (const coachId of COACH_IDS) {
      const last = await this.db.messages
        .where("[coachId+createdAt]")
        .between([coachId, Dexie.minKey], [coachId, Dexie.maxKey])
        .last();
      if (last) result[coachId] = last;
    }
    return result;
  }

  async unreadCounts(): Promise<Partial<Record<CoachId, number>>> {
    const result: Partial<Record<CoachId, number>> = {};
    for (const coachId of COACH_IDS) {
      const count = await this.db.messages
        .where("coachId")
        .equals(coachId)
        .filter((m) => m.sender !== "user" && m.readAt === null)
        .count();
      if (count > 0) result[coachId] = count;
    }
    return result;
  }

  async addMessage(message: NewMessage): Promise<Message> {
    const id = await this.db.messages.add(message);
    this.emit();
    return { ...message, id };
  }

  async updateMessage(id: number, patch: Partial<Omit<Message, "id">>): Promise<void> {
    await this.db.messages.update(id, patch);
    this.emit();
  }

  async markCoachMessagesRead(coachId: CoachId, at: number): Promise<void> {
    const changed = await this.db.messages
      .where("coachId")
      .equals(coachId)
      .filter((m) => m.sender !== "user" && m.readAt === null)
      .modify({ readAt: at });
    if (changed > 0) this.emit();
  }

  async markUserMessagesRead(coachId: CoachId, at: number): Promise<void> {
    const changed = await this.db.messages
      .where("coachId")
      .equals(coachId)
      .filter((m) => m.sender === "user" && m.readAt === null)
      .modify({ readAt: at });
    if (changed > 0) this.emit();
  }

  // --- память тренера ---

  async listMemory(coachId: CoachId): Promise<MemoryFact[]> {
    const rows = await this.db.memory.where("coachId").equals(coachId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }

  async addMemory(fact: NewMemoryFact): Promise<void> {
    await this.db.memory.add(fact);
    this.emit();
  }

  async deleteMemory(id: number): Promise<void> {
    await this.db.memory.delete(id);
    this.emit();
  }

  // --- тренировки ---

  async getSession(id: string): Promise<WorkoutSession | undefined> {
    return this.db.sessions.get(id);
  }

  async putSession(session: WorkoutSession): Promise<void> {
    await this.db.sessions.put(session);
    this.emit();
  }

  async listSessions(limit?: number): Promise<WorkoutSession[]> {
    const query = this.db.sessions.orderBy("startedAt").reverse();
    return limit ? query.limit(limit).toArray() : query.toArray();
  }

  async listScheduled(): Promise<ScheduledWorkout[]> {
    return this.db.scheduled.orderBy("scheduledAt").toArray();
  }

  async putScheduled(item: ScheduledWorkout): Promise<void> {
    await this.db.scheduled.put(item);
    this.emit();
  }

  async deleteScheduled(id: string): Promise<void> {
    await this.db.scheduled.delete(id);
    this.emit();
  }

  async listRecords(): Promise<ExerciseRecord[]> {
    return this.db.records.toArray();
  }

  async putRecord(record: ExerciseRecord): Promise<void> {
    await this.db.records.put(record);
    this.emit();
  }

  // --- счётчики ---

  async getUsage(key: string): Promise<number> {
    return (await this.db.usage.get(key))?.count ?? 0;
  }

  async incrementUsage(key: string, by = 1): Promise<number> {
    const next = await this.db.transaction("rw", this.db.usage, async () => {
      const current = (await this.db.usage.get(key))?.count ?? 0;
      const count = current + by;
      await this.db.usage.put({ key, count });
      return count;
    });
    this.emit();
    return next;
  }

  async listUsage(): Promise<UsageRow[]> {
    return this.db.usage.toArray();
  }

  // --- отношения и уведомления ---

  async addRelationshipEvent(row: NewRelationshipEventRow): Promise<void> {
    await this.db.relEvents.add(row);
    this.emit();
  }

  async listRelationshipEvents(coachId: CoachId, sinceTs = 0): Promise<RelationshipEventRow[]> {
    return this.db.relEvents
      .where("coachId")
      .equals(coachId)
      .filter((e) => e.createdAt >= sinceTs)
      .toArray();
  }

  async addNotificationLog(row: NewNotificationLogRow): Promise<void> {
    await this.db.notifLog.add(row);
    this.emit();
  }

  async listNotificationLog(sinceTs: number): Promise<NotificationLogRow[]> {
    return this.db.notifLog.where("sentAt").aboveOrEqual(sinceTs).toArray();
  }

  // --- дуэли и клипы ---

  async getDuel(id: string): Promise<Duel | undefined> {
    return this.db.duels.get(id);
  }

  async putDuel(duel: Duel): Promise<void> {
    await this.db.duels.put(duel);
    this.emit();
  }

  async listDuels(): Promise<Duel[]> {
    return this.db.duels.orderBy("createdAt").reverse().toArray();
  }

  async getClip(sessionId: string): Promise<ClipRow | undefined> {
    return this.db.clips.get(sessionId);
  }

  async putClip(clip: ClipRow): Promise<void> {
    await this.db.clips.put(clip);
    this.emit();
  }

  async deleteClip(sessionId: string): Promise<void> {
    await this.db.clips.delete(sessionId);
    this.emit();
  }

  // --- прочее ---

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    const row = await this.db.meta.get(key);
    return row?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
    this.emit();
  }

  async exportAll(): Promise<ExportBundle> {
    const data: Record<string, unknown> = {};
    for (const table of this.db.tables) {
      // Видео-клипы не экспортируем: они большие и остаются на устройстве.
      if (table.name === "clips") continue;
      data[table.name] = await table.toArray();
    }
    return { exportedAt: new Date().toISOString(), app: "pinok", version: 1, data };
  }

  async deleteAll(): Promise<void> {
    await this.db.transaction("rw", this.db.tables, async () => {
      for (const table of this.db.tables) await table.clear();
    });
    this.emit();
  }

  /** Только для тестов: закрыть соединение и удалить базу. */
  async destroy(): Promise<void> {
    this.db.close();
    await Dexie.delete(this.db.name);
  }
}
