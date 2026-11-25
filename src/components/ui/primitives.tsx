"use client";

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

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

/** Shows `text` after hovering ~1s. Dotted underline marks tippable labels. */
export function HoverTip({
  text,
  children,
  delayMs = 1000,
}: {
  text: string;
  children: ReactNode;
  delayMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancel = () => {
    clearTimer();
    setOpen(false);
  };

  const schedule = () => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delayMs);
  };

  useEffect(() => () => clearTimer(), []);

  return (
    <span
      className="relative inline-flex max-w-full cursor-help"
      onMouseEnter={schedule}
      onMouseLeave={cancel}
      onFocus={schedule}
      onBlur={cancel}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-50 w-max max-w-[230px] rounded border border-[var(--border-strong)] bg-[#18212c] px-2 py-1.5 text-[10px] font-normal normal-case tracking-normal leading-snug text-[var(--text)] shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  tooltip,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Explains the setting; appears after ~1s hover on the label */
  tooltip?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-[var(--muted)]">
        {tooltip ? <HoverTip text={tooltip}>{label}</HoverTip> : label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-[var(--muted-2)]">{hint}</span> : null}
    </label>
  );
}

function clampNumber(n: number, min?: number, max?: number): number {
  let next = n;
  if (min != null && next < min) next = min;
  if (max != null && next > max) next = max;
  return next;
}

function roundToDecimals(n: number, decimals?: number): number {
  if (decimals == null) return n;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function formatNumber(n: number, decimals?: number): string {
  if (!Number.isFinite(n)) return "";
  return decimals != null ? n.toFixed(decimals) : String(n);
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  decimals = 2,
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Display/commit precision. Defaults to 2 decimal places. */
  decimals?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [draft, setDraft] = useState(() => formatNumber(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatNumber(value, decimals));
    }
  }, [value, focused, decimals]);

  const { onFocus, onBlur, ...inputRest } = rest;

  const commit = (n: number) => roundToDecimals(clampNumber(n, min, max), decimals);

  return (
    <input
      type="number"
      className="input"
      {...inputRest}
      value={draft}
      step={step}
      min={min}
      max={max}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        const raw = e.target.value.trim();
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
          const fallback = commit(Number.isFinite(value) ? value : (min ?? 0));
          setDraft(formatNumber(fallback, decimals));
          if (fallback !== value) onChange(fallback);
        } else {
          const n = Number(raw);
          if (Number.isFinite(n)) {
            const next = commit(n);
            setDraft(formatNumber(next, decimals));
            if (next !== value) onChange(next);
          } else {
            setDraft(formatNumber(value, decimals));
          }
        }
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === "" || raw === "-" || raw === "." || raw === "-.") return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(commit(n));
      }}
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
