import { describe, expect, it } from "vitest";
import {
  clipSizeFor,
  coverRect,
  extensionFor,
  MIME_CANDIDATES,
  pickMimeType,
  wrapLines,
} from "@/lib/clips/layout";
import { MomentTracker, SegmentKeeper, type Segment } from "@/lib/clips/segments";

describe("размер клипа", () => {
  it("формат 9:16; полные 1080×1920 только на мощных устройствах", () => {
    const weak = clipSizeFor({ cores: 4, memoryGb: 2 });
    expect([weak.width, weak.height]).toEqual([720, 1280]);
    const unknown = clipSizeFor({});
    expect(unknown.width).toBe(720);
    const strong = clipSizeFor({ cores: 8, memoryGb: 8 });
    expect([strong.width, strong.height]).toEqual([1080, 1920]);
    for (const size of [weak, strong]) expect(size.width / size.height).toBeCloseTo(9 / 16, 3);
  });
});

describe("coverRect", () => {
  it("горизонтальное видео обрезается по бокам по центру", () => {
    const r = coverRect(1280, 720, 720, 1280);
    expect(r.sh).toBe(720);
    expect(r.sw).toBeCloseTo(720 * (720 / 1280), 5);
    expect(r.sx).toBeCloseTo((1280 - r.sw) / 2, 5);
    expect(r.sy).toBe(0);
    expect(r.sw / r.sh).toBeCloseTo(9 / 16, 5);
  });

  it("узкое видео обрезается сверху и снизу", () => {
    const r = coverRect(720, 1600, 720, 1280);
    expect(r.sw).toBe(720);
    expect(r.sh).toBeCloseTo(1280, 5);
    expect(r.sy).toBeCloseTo(160, 5);
  });

  it("пустой источник даёт нулевой прямоугольник", () => {
    expect(coverRect(0, 0, 720, 1280)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe("wrapLines", () => {
  const measure = (s: string) => s.length * 10;
  it("переносит по словам", () => {
    expect(wrapLines(measure, "Это не присед, это ты в туалет садишься", 200, 4)).toEqual([
      "Это не присед, это",
      "ты в туалет садишься",
    ]);
    expect(wrapLines(measure, "Это не присед, это ты в туалет садишься", 150, 4)).toEqual([
      "Это не присед,",
      "это ты в туалет",
      "садишься",
    ]);
  });

  it("слишком длинное слово не ломает перенос", () => {
    expect(wrapLines(measure, "Абракадабраабракадабра ок", 100, 3)).toEqual([
      "Абракадабраабракадабра",
      "ок",
    ]);
  });

  it("лишние строки заменяются многоточием", () => {
    const lines = wrapLines(measure, "раз два три четыре пять шесть семь", 50, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  it("пустой текст — пустой список", () => {
    expect(wrapLines(measure, "   ", 100, 2)).toEqual([]);
  });
});

describe("формат файла", () => {
  it("предпочитает mp4, потом webm", () => {
    expect(pickMimeType((m) => m.startsWith("video/mp4"))).toBe(MIME_CANDIDATES[0]);
    expect(pickMimeType((m) => m === "video/webm")).toBe("video/webm");
    expect(pickMimeType(() => false)).toBeNull();
  });

  it("расширение по типу", () => {
    expect(extensionFor("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensionFor("video/webm;codecs=vp9")).toBe("webm");
  });
});

function segment(partial: Partial<Segment>): Segment {
  return {
    blob: new Blob(["x".repeat(100)]),
    mime: "video/webm",
    durationSec: 15,
    weight: 0,
    moment: "",
    subtitle: null,
    ...partial,
  };
}

describe("лучший отрезок", () => {
  it("выигрывает отрезок с самым весомым моментом", () => {
    const keeper = new SegmentKeeper();
    keeper.add(segment({ weight: 3, moment: "halfway" }));
    keeper.add(segment({ weight: 8, moment: "knees_cave_in" }));
    keeper.add(segment({ weight: 5, moment: "too_fast" }));
    expect(keeper.best()?.moment).toBe("knees_cave_in");
  });

  it("при равном весе берётся более длинный, а при равной длине — более поздний", () => {
    const keeper = new SegmentKeeper();
    keeper.add(segment({ weight: 5, durationSec: 15, moment: "a" }));
    keeper.add(segment({ weight: 5, durationSec: 8, moment: "b" }));
    expect(keeper.best()?.moment).toBe("a");
    keeper.add(segment({ weight: 5, durationSec: 15, moment: "c" }));
    expect(keeper.best()?.moment).toBe("c");
  });

  it("слишком короткие и пустые отрезки пропускаются", () => {
    const keeper = new SegmentKeeper();
    keeper.add(segment({ durationSec: 2, weight: 9 }));
    keeper.add(segment({ blob: new Blob([]), weight: 9 }));
    expect(keeper.best()).toBeNull();
  });
});

describe("MomentTracker", () => {
  it("запоминает самый весомый момент отрезка и сбрасывается", () => {
    const tracker = new MomentTracker();
    tracker.mark(3, "halfway", "Половина");
    tracker.mark(8, "knees_cave_in", "Колени!");
    tracker.mark(2, "rep_good", "Раз");
    expect(tracker).toMatchObject({ weight: 8, moment: "knees_cave_in", subtitle: "Колени!" });
    tracker.reset();
    expect(tracker.weight).toBe(0);
    expect(tracker.subtitle).toBeNull();
  });
});
