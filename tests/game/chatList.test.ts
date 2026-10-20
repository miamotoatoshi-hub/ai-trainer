import { describe, expect, it } from "vitest";
import { defaultUserCoach } from "@/lib/data/defaults";
import type { CoachId, Message, UserCoach } from "@/lib/data/types";
import { buildChatList } from "@/lib/game/chatList";

const NOW = new Date(2026, 9, 20, 12, 0).getTime();

function coach(id: CoachId, extra: Partial<UserCoach> = {}): UserCoach {
  return { ...defaultUserCoach(id, 0), unlocked: true, ...extra };
}

function msg(id: number, coachId: CoachId, partial: Partial<Message>): Message {
  return {
    id,
    coachId,
    sender: "coach",
    type: "text",
    text: "привет",
    emotion: null,
    durationSec: null,
    meta: {},
    readAt: 1,
    createdAt: NOW - 60_000,
    ...partial,
  };
}

describe("список чатов", () => {
  it("сначала непрочитанные, потом по времени; закрытые не показываем", () => {
    const items = buildChatList({
      coaches: [
        coach("gromov"),
        coach("marina"),
        coach("palych"),
        { ...defaultUserCoach("max", 0), unlocked: false },
      ],
      lastMessages: {
        gromov: msg(1, "gromov", { createdAt: NOW - 3_000_000 }),
        marina: msg(2, "marina", { createdAt: NOW - 1_000_000 }),
        palych: msg(3, "palych", { createdAt: NOW - 9_000_000 }),
      },
      unread: { palych: 1 },
      waiting: new Set(),
      now: NOW,
    });
    expect(items.map((i) => i.coachId)).toEqual(["palych", "marina", "gromov"]);
  });

  it("голосовое: «Голосовое · 0:14»", () => {
    const [item] = buildChatList({
      coaches: [coach("palych")],
      lastMessages: { palych: msg(1, "palych", { type: "voice", durationSec: 14 }) },
      unread: {},
      waiting: new Set(),
      now: NOW,
    });
    expect(item?.preview.kind).toBe("voice");
    expect(item?.preview.text).toBe("Голосовое · 0:14");
  });

  it("игнор: последнее моё — «без ответа»", () => {
    const [ignored] = buildChatList({
      coaches: [coach("marina", { state: "ignoring" })],
      lastMessages: { marina: msg(1, "marina", { sender: "user", text: "Прости" }) },
      unread: {},
      waiting: new Set(),
      now: NOW,
    });
    expect(ignored?.noAnswer).toBe(true);
    expect(ignored?.preview.mine).toBe(true);

    const [normal] = buildChatList({
      coaches: [coach("marina")],
      lastMessages: { marina: msg(1, "marina", { sender: "user", text: "Прости" }) },
      unread: {},
      waiting: new Set(),
      now: NOW,
    });
    expect(normal?.noAnswer).toBe(false);
  });

  it("карточка тренировки в превью, пустой чат — подсказка", () => {
    const [card] = buildChatList({
      coaches: [coach("gromov")],
      lastMessages: {
        gromov: msg(1, "gromov", {
          type: "workout_card",
          meta: { planId: "legs-20", scheduledAt: new Date(2026, 9, 20, 18, 0).getTime() },
        }),
      },
      unread: {},
      waiting: new Set(),
      now: NOW,
    });
    expect(card?.preview.text).toBe("Тренировка: ноги · 18:00");

    const [empty] = buildChatList({
      coaches: [coach("gromov")],
      lastMessages: {},
      unread: {},
      waiting: new Set(),
      now: NOW,
    });
    expect(empty?.preview.kind).toBe("empty");
    expect(empty?.timeLabel).toBe("");
  });
});
