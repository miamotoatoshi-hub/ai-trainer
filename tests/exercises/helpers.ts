import type { CounterEvent, ExerciseCounter } from "@/lib/exercises/types";
import type { PoseFrame } from "@/lib/pose/types";

export function feed(counter: ExerciseCounter, frames: readonly PoseFrame[]): CounterEvent[] {
  return frames.flatMap((frame) => counter.update(frame));
}

export function reps(events: readonly CounterEvent[]) {
  return events.filter((e): e is Extract<CounterEvent, { type: "rep" }> => e.type === "rep");
}

export function errorCodes(events: readonly CounterEvent[]): string[] {
  return events.flatMap((e) => (e.type === "error" ? [e.code] : []));
}
