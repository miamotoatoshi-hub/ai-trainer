"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3 px-5 pt-6">
      <h2 className="text-[13px] leading-none font-extrabold tracking-[0.06em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] font-extrabold">{label}</p>
      {children}
    </div>
  );
}

/** Выключатель: большая зона нажатия, состояние читают скринридеры. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 items-center gap-3 rounded-row border border-line px-4 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{label}</span>
        {hint ? <span className="block text-[12px] font-semibold text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-accent" : "bg-line-2"
        }`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}

/** Окно подтверждения опасного действия. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="flex w-full max-w-[460px] flex-col gap-4 rounded-[24px] bg-white p-5">
        <h2 id="confirm-title" className="font-display text-[22px] leading-tight font-extrabold">
          {title}
        </h2>
        <p className="text-[15px] leading-snug font-semibold text-ink-2">{body}</p>
        <div className="flex flex-col gap-2">
          <Button variant={danger ? "danger" : "primary"} fullWidth height={52} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" fullWidth height={48} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
