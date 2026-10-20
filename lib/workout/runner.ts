import type { ExerciseId, ExerciseResult } from "@/lib/data/types";
import { createCounter as defaultCounter } from "@/lib/exercises";
import type { CounterSnapshot, ErrorCode, ExerciseCounter } from "@/lib/exercises/types";
import type { PoseFrame } from "@/lib/pose/types";
import type { WorkoutPlan } from "./plans";

export type StepKind = "warmup" | "set" | "finisher" | "rest";

export interface Step {
  kind: StepKind;
  exercise: ExerciseId;
  /** Номер подхода внутри блока (с 0) и сколько их всего. */
  setIndex: number;
  setsTotal: number;
  /** Цель по повторениям (для подходов). */
  reps?: number;
  /** Цель по времени: удержание (планка), длительность разминки/«добивания» или отдых. */
  seconds?: number;
}

/** Пауза после разминки и перед «добиванием»: перейти в нужную позу. */
const TRANSITION_REST_SEC = 15;

/** Превращает JSON-план в последовательность шагов с отдыхом между ними. */
export function buildSteps(plan: WorkoutPlan): Step[] {
  const active: { step: Step; restAfter: number }[] = [];
  for (const block of plan.blocks) {
    if (block.kind === "sets") {
      for (let i = 0; i < block.sets; i += 1) {
        active.push({
          step: {
            kind: "set",
            exercise: block.exercise,
            setIndex: i,
            setsTotal: block.sets,
            reps: block.reps,
            seconds: block.reps === undefined ? block.seconds : undefined,
          },
          restAfter: block.restSec,
        });
      }
    } else {
      active.push({
        step: {
          kind: block.kind,
          exercise: block.exercise,
          setIndex: 0,
          setsTotal: 1,
          seconds: block.seconds,
        },
        restAfter: TRANSITION_REST_SEC,
      });
    }
  }
  const steps: Step[] = [];
  active.forEach(({ step, restAfter }, i) => {
    steps.push(step);
    const next = active[i + 1];
    if (next && restAfter > 0) {
      steps.push({
        kind: "rest",
        exercise: next.step.exercise,
        setIndex: 0,
        setsTotal: 1,
        seconds: restAfter,
      });
    }
  });
  return steps;
}

export type RunnerEvent =
  | { type: "set_start"; step: Step }
  | { type: "rep"; step: Step; count: number; clean: boolean; errors: ErrorCode[] }
  /** Планка: ещё одна секунда удержания. */
  | { type: "count"; step: Step; count: number; clean: boolean }
  | { type: "shallow"; step: Step }
  | { type: "technique"; step: Step; code: ErrorCode }
  | { type: "halfway"; step: Step }
  | { type: "last_3"; step: Step }
  | { type: "personal_record"; step: Step; value: number }
  | { type: "idle"; step: Step }
  | { type: "not_in_frame"; step: Step }
  | { type: "set_end"; step: Step; result: ExerciseResult; reason: "target" | "time" | "timeout" }
  | { type: "rest_start"; step: Step }
  | { type: "rest_end"; step: Step }
  | { type: "workout_complete" };

export type RunnerPhase = "idle" | "active" | "rest" | "done";

export interface RunnerView {
  phase: RunnerPhase;
  stepIndex: number;
  stepCount: number;
  step: Step | null;
  exercise: ExerciseId | null;
  unit: "reps" | "sec";
  /** Повторения (или секунды удержания) в текущем подходе. */
  count: number;
  /** Цель подхода: число повторений или секунд; null — «сколько успеешь за время». */
  target: number | null;
  /** Сколько секунд осталось в шаге с таймером (разминка, «добивание», отдых). */
  timeLeftSec: number | null;
  restLeftSec: number | null;
  paused: boolean;
}

export interface RunnerOptions {
  /** Прежние личные рекорды по упражнениям (лучший подход). */
  records?: Partial<Record<ExerciseId, number>>;
  createCounter?: (id: ExerciseId) => ExerciseCounter;
  /** Сколько мс без движения считать «простоем». */
  idleMs?: number;
  /** Сколько мс человека не видно, прежде чем тренер начнёт ворчать. */
  notInFrameMs?: number;
}

const HALFWAY_MIN_REPS = 6;
const LAST3_MIN_REPS = 8;
const NOT_IN_FRAME_REPEAT_MS = 8000;

function emptyResult(exerciseId: ExerciseId, unit: "reps" | "sec"): ExerciseResult {
  return { exerciseId, unit, total: 0, clean: 0, shallow: 0, bestStreak: 0, errors: {} };
}

/**
 * Ведёт тренировку по плану: подходы, отдых, цели, паузу, реакции на события.
 * Ничего не знает ни про камеру, ни про голос — на вход кадры позы и время, на выход события.
 */
export class WorkoutRunner {
  readonly steps: Step[];
  private phase: RunnerPhase = "idle";
  private index = -1;
  private counter: ExerciseCounter | null = null;
  private stepStartedAt = 0;
  private restEndsAt = 0;
  private lastProgressAt = 0;
  private lostSince: number | null = null;
  private lastNotInFrameAt = Number.NEGATIVE_INFINITY;
  private idleReported = false;
  private halfwayDone = false;
  private last3Done = false;
  private recordDone = false;
  private pausedAt: number | null = null;
  private startedAt = 0;
  private pausedTotal = 0;
  private readonly completed: { step: Step; result: ExerciseResult }[] = [];
  private readonly baseRecords: Partial<Record<ExerciseId, number>>;
  private readonly bestNow: Partial<Record<ExerciseId, number>>;
  private readonly beaten = new Set<ExerciseId>();
  private readonly makeCounter: (id: ExerciseId) => ExerciseCounter;
  private readonly idleMs: number;
  private readonly notInFrameMs: number;

  constructor(
    readonly plan: WorkoutPlan,
    {
      records = {},
      createCounter = defaultCounter,
      idleMs = 10_000,
      notInFrameMs = 3_000,
    }: RunnerOptions = {},
  ) {
    this.steps = buildSteps(plan);
    this.baseRecords = { ...records };
    this.bestNow = { ...records };
    this.makeCounter = createCounter;
    this.idleMs = idleMs;
    this.notInFrameMs = notInFrameMs;
  }

  get currentStep(): Step | null {
    return this.steps[this.index] ?? null;
  }

  get isDone(): boolean {
    return this.phase === "done";
  }

  /** Начать тренировку: запускается первый шаг. */
  start(now: number): RunnerEvent[] {
    if (this.phase !== "idle") return [];
    this.startedAt = now;
    const out: RunnerEvent[] = [];
    this.advance(now, out);
    return out;
  }

  pause(now: number): void {
    if (this.pausedAt === null && this.phase !== "idle" && this.phase !== "done")
      this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt === null) return;
    const delta = now - this.pausedAt;
    this.pausedAt = null;
    // Всё, что считается от времени, сдвигаем на длительность паузы.
    this.stepStartedAt += delta;
    this.restEndsAt += delta;
    this.lastProgressAt += delta;
    this.pausedTotal += delta;
    if (this.lostSince !== null) this.lostSince += delta;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Пропустить отдых и сразу начать следующий подход. */
  skipRest(now: number): RunnerEvent[] {
    if (this.phase !== "rest" || this.pausedAt !== null) return [];
    const out: RunnerEvent[] = [{ type: "rest_end", step: this.currentStep! }];
    this.advance(now, out);
    return out;
  }

  /** Очередной кадр позы (null — человека в кадре нет) и текущее время. */
  update(frame: PoseFrame | null, now: number): RunnerEvent[] {
    if (this.pausedAt !== null) return [];
    const out: RunnerEvent[] = [];
    const step = this.currentStep;
    if (!step) return out;

    if (this.phase === "rest") {
      if (now >= this.restEndsAt) {
        out.push({ type: "rest_end", step });
        this.advance(now, out);
      }
      return out;
    }
    if (this.phase !== "active" || !this.counter) return out;

    if (frame) {
      const events = this.counter.update(frame);
      if (this.counter.snapshot().visible) {
        // Вернулся в кадр: время, пока его не было видно, простоем не считается.
        if (this.lostSince !== null) this.lastProgressAt = now;
        this.lostSince = null;
      } else {
        this.lostSince ??= now;
      }
      for (const e of events) this.handleCounterEvent(e, step, now, out);
    } else {
      this.lostSince ??= now;
    }

    const snap = this.counter.snapshot();
    const elapsed = now - this.stepStartedAt;

    // Человека не видно — тренер ворчит, но пока не считает это простоем.
    if (
      this.lostSince !== null &&
      now - this.lostSince >= this.notInFrameMs &&
      now - this.lastNotInFrameAt >= NOT_IN_FRAME_REPEAT_MS
    ) {
      this.lastNotInFrameAt = now;
      out.push({ type: "not_in_frame", step });
    }
    // Просто стоит — «Эй, продолжай».
    if (this.lostSince === null && !this.idleReported && now - this.lastProgressAt >= this.idleMs) {
      this.idleReported = true;
      out.push({ type: "idle", step });
    }

    // Половина времени у подходов с таймером.
    if (!this.halfwayDone && step.seconds !== undefined && step.seconds >= 20) {
      const spent =
        step.kind === "set" && this.counter.unit === "sec" ? snap.total * 1000 : elapsed;
      if (spent >= (step.seconds * 1000) / 2) {
        this.halfwayDone = true;
        out.push({ type: "halfway", step });
      }
    }

    // Конец шага.
    const end = this.endReason(step, snap.total, elapsed);
    if (end) this.finishStep(end, now, out);
    return out;
  }

  private endReason(
    step: Step,
    total: number,
    elapsedMs: number,
  ): "target" | "time" | "timeout" | null {
    if (step.reps !== undefined) {
      if (total >= step.reps) return "target";
      if (elapsedMs >= Math.max(90_000, step.reps * 12_000)) return "timeout";
      return null;
    }
    const seconds = step.seconds ?? 0;
    if (this.counter?.unit === "sec") {
      // удержание: цель — набранные секунды, но не ждём вечно
      if (total >= seconds) return "target";
      if (elapsedMs >= seconds * 2000 + 15_000) return "timeout";
      return null;
    }
    return elapsedMs >= seconds * 1000 ? "time" : null;
  }

  private handleCounterEvent(
    e: ReturnType<ExerciseCounter["update"]>[number],
    step: Step,
    now: number,
    out: RunnerEvent[],
  ): void {
    const snap = this.counter!.snapshot();
    switch (e.type) {
      case "rep":
        this.lastProgressAt = now;
        this.idleReported = false;
        out.push({ type: "rep", step, count: snap.total, clean: e.clean, errors: e.errors });
        this.checkMilestones(step, snap.total, out);
        break;
      case "second":
        this.lastProgressAt = now;
        this.idleReported = false;
        out.push({ type: "count", step, count: snap.total, clean: e.clean });
        this.checkMilestones(step, snap.total, out);
        break;
      case "shallow":
        this.lastProgressAt = now;
        this.idleReported = false;
        out.push({ type: "shallow", step });
        break;
      case "error":
        out.push({ type: "technique", step, code: e.code });
        break;
      case "phase":
        this.lastProgressAt = now;
        this.idleReported = false;
        break;
    }
  }

  private checkMilestones(step: Step, total: number, out: RunnerEvent[]): void {
    const target = step.reps;
    if (target !== undefined) {
      if (
        !this.halfwayDone &&
        target >= HALFWAY_MIN_REPS &&
        total >= Math.ceil(target / 2) &&
        total < target
      ) {
        this.halfwayDone = true;
        out.push({ type: "halfway", step });
      }
      if (!this.last3Done && target >= LAST3_MIN_REPS && total === target - 3) {
        this.last3Done = true;
        out.push({ type: "last_3", step });
      }
    }
    const record = this.baseRecords[step.exercise] ?? 0;
    if (!this.recordDone && record > 0 && total > record && step.kind !== "warmup") {
      this.recordDone = true;
      this.beaten.add(step.exercise);
      out.push({ type: "personal_record", step, value: total });
    }
  }

  private finishStep(reason: "target" | "time" | "timeout", now: number, out: RunnerEvent[]): void {
    const step = this.currentStep!;
    const result = this.snapshotResult(step);
    this.completed.push({ step, result });
    if (step.kind !== "warmup" && result.total > (this.bestNow[step.exercise] ?? 0)) {
      this.bestNow[step.exercise] = result.total;
    }
    out.push({ type: "set_end", step, result, reason });
    this.counter = null;
    this.advance(now, out);
  }

  /** Переходит к следующему шагу (или завершает тренировку). */
  private advance(now: number, out: RunnerEvent[]): void {
    this.index += 1;
    const step = this.steps[this.index];
    if (!step) {
      this.phase = "done";
      out.push({ type: "workout_complete" });
      return;
    }
    if (step.kind === "rest") {
      this.phase = "rest";
      this.restEndsAt = now + (step.seconds ?? 0) * 1000;
      out.push({ type: "rest_start", step });
      return;
    }
    this.phase = "active";
    this.counter = this.makeCounter(step.exercise);
    this.stepStartedAt = now;
    this.lastProgressAt = now;
    this.lostSince = null;
    this.idleReported = false;
    this.halfwayDone = false;
    this.last3Done = false;
    this.recordDone = false;
    out.push({ type: "set_start", step });
  }

  private snapshotResult(step: Step): ExerciseResult {
    const snap = this.counter!.snapshot();
    return {
      exerciseId: step.exercise,
      unit: snap.unit,
      total: snap.total,
      clean: snap.clean,
      shallow: snap.shallow,
      bestStreak: snap.bestStreak,
      errors: snap.errors,
    };
  }

  /** Завершить досрочно (кнопка «Завершить»): текущий подход тоже попадает в итог. */
  finish(): void {
    if (this.phase === "done") return;
    if (this.phase === "active" && this.counter) {
      const step = this.currentStep!;
      const partial = this.snapshotResult(step);
      if (partial.total > 0 || partial.shallow > 0) this.completed.push({ step, result: partial });
      this.counter = null;
    }
    this.phase = "done";
  }

  /** Итоги по упражнениям (подходы одного упражнения складываются). */
  results(): ExerciseResult[] {
    const merged = new Map<ExerciseId, ExerciseResult>();
    const parts = this.completed.map((c) => c.result);
    if (this.phase === "active" && this.counter) {
      const partial = this.snapshotResult(this.currentStep!);
      if (partial.total > 0 || partial.shallow > 0) parts.push(partial);
    }
    for (const r of parts) {
      const into = merged.get(r.exerciseId) ?? emptyResult(r.exerciseId, r.unit);
      into.total += r.total;
      into.clean += r.clean;
      into.shallow += r.shallow;
      into.bestStreak = Math.max(into.bestStreak, r.bestStreak);
      for (const [code, n] of Object.entries(r.errors))
        into.errors[code] = (into.errors[code] ?? 0) + n;
      merged.set(r.exerciseId, into);
    }
    return [...merged.values()];
  }

  /** Лучший подход по каждому упражнению (для личных рекордов); разминка рекордов не ставит. */
  bestSets(): Partial<Record<ExerciseId, number>> {
    const best: Partial<Record<ExerciseId, number>> = {};
    for (const { step, result } of this.completed) {
      if (step.kind === "warmup") continue;
      best[result.exerciseId] = Math.max(best[result.exerciseId] ?? 0, result.total);
    }
    return best;
  }

  /** Упражнения, в которых побит прежний рекорд (по которому уже был рекорд). */
  recordsBeaten(): ExerciseId[] {
    return [...this.beaten];
  }

  view(now: number): RunnerView {
    const step = this.currentStep;
    const base: RunnerView = {
      phase: this.phase,
      stepIndex: Math.max(0, this.index),
      stepCount: this.steps.length,
      step,
      exercise: step?.exercise ?? null,
      unit: this.counter?.unit ?? "reps",
      count: 0,
      target: null,
      timeLeftSec: null,
      restLeftSec: null,
      paused: this.pausedAt !== null,
    };
    if (!step) return base;
    const at = this.pausedAt ?? now;
    if (this.phase === "rest") {
      return { ...base, restLeftSec: Math.max(0, Math.ceil((this.restEndsAt - at) / 1000)) };
    }
    if (this.phase === "active" && this.counter) {
      const snap = this.counter.snapshot();
      const target = step.reps ?? (snap.unit === "sec" ? (step.seconds ?? null) : null);
      const timeLeftSec =
        step.reps === undefined && snap.unit === "reps" && step.seconds !== undefined
          ? Math.max(0, Math.ceil((step.seconds * 1000 - (at - this.stepStartedAt)) / 1000))
          : null;
      return { ...base, unit: snap.unit, count: snap.total, target, timeLeftSec };
    }
    return base;
  }

  /** Снимок счётчика текущего упражнения (режим отладки: фаза и угол). */
  snapshot(): CounterSnapshot | null {
    return this.counter ? this.counter.snapshot() : null;
  }

  /** Сколько мс прошло с начала тренировки без пауз. */
  elapsedMs(now: number): number {
    if (this.phase === "idle") return 0;
    return (this.pausedAt ?? now) - this.startedAt - this.pausedTotal;
  }
}
