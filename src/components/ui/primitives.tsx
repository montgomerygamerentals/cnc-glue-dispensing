"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--border)] pb-3 mb-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-[var(--muted)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-[var(--muted-2)]">{hint}</span> : null}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      type="number"
      className="input"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      {...rest}
    />
  );
}

export function TextInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      type="text"
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  children,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {children}
    </select>
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "danger" | "ghost";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    default: "btn",
    primary: "btn btn-primary",
    danger: "btn btn-danger",
    ghost: "btn btn-ghost",
  };
  return (
    <button type="button" className={`${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-2 text-left text-xs"
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function WarningBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-[11px] leading-relaxed text-[var(--warn-text)]">
      {children}
    </div>
  );
}
