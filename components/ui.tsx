import Link from "next/link";
import type { ReactNode } from "react";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "@/lib/types";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function Card({
  title,
  sub,
  children,
  className,
  action,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cx("bg-white border border-zinc-200/80 rounded-xl p-5 min-w-0", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-zinc-900 leading-snug">{title}</h2>}
            {sub && <p className="text-[12.5px] text-zinc-500 mt-0.5">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  unit,
  sub,
  delta,
  deltaGoodWhen = "up",
  tone,
  href,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  delta?: number | null;
  deltaGoodWhen?: "up" | "down";
  tone?: "brand" | "bad";
  href?: string;
}) {
  const body = (
    <div className={cx("relative h-full bg-white px-5 py-4 transition-colors duration-150", href && "group-hover/kpi:bg-zinc-50/80")}>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500">
        {tone === "bad" && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />}
        {label}
        {href && <svg className="ml-auto h-3.5 w-3.5 text-zinc-300 opacity-0 transition-opacity group-hover/kpi:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>}
      </div>
      <div className={cx("tabular text-[28px] font-semibold tracking-[-0.03em] text-zinc-900 mt-2 leading-none", tone === "bad" && "text-rose-600")}>
        {value}
        {unit && <span className="text-[15px] font-medium tracking-normal text-zinc-400 ml-1">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-2.5 text-[12.5px] text-zinc-500 min-h-5">
        {delta !== undefined && delta !== null && <Delta value={delta} goodWhen={deltaGoodWhen} />}
        {sub}
      </div>
    </div>
  );
  return href ? <Link href={href} className="group/kpi block h-full focus-visible:outline-offset-[-2px]">{body}</Link> : body;
}

export function Delta({ value, goodWhen = "up" }: { value: number; goodWhen?: "up" | "down" }) {
  const up = value >= 0;
  const good = goodWhen === "up" ? up : !up;
  const neutral = Math.abs(value) < 0.005;

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded-full border",
        neutral
          ? "bg-zinc-100 text-zinc-600 border-zinc-200"
          : good
          ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
          : "bg-rose-50 text-rose-700 border-rose-200/70"
      )}
      title="vs previous period"
    >
      <span>{up ? "↑" : "↓"}</span>
      <span>{Math.abs(value * 100).toFixed(0)}%</span>
    </span>
  );
}

export function KpiGrid({ children, cols = 6 }: { children: ReactNode; cols?: number }) {
  const map: Record<number, string> = {
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  };
  return <div className={cx("grid grid-cols-2 md:grid-cols-3 gap-px overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-200/80", map[cols])}>{children}</div>;
}

const OUTCOME_PILL: Record<string, string> = {
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-lg",
  transfer_ok: "bg-sky-50 text-sky-700 border border-sky-200/80 rounded-lg",
  transfer_fail: "bg-rose-50 text-rose-700 border border-rose-200/80 rounded-lg",
  lead_captured: "bg-purple-50 text-purple-700 border border-purple-200/80 rounded-lg",
  info: "bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg",
  silent: "text-zinc-400 border border-dashed border-zinc-300 rounded-lg",
  spam: "bg-zinc-100 text-zinc-400 line-through",
  abusive: "bg-rose-50 text-rose-700 border border-rose-200 rounded-lg",
  voicemail: "bg-zinc-100 text-zinc-500",
  no_data: "text-zinc-400",
};

export function OutcomePill({ outcome }: { outcome?: string | null }) {
  if (!outcome) return <span className="text-xs text-zinc-400">Pending AI</span>;
  return (
    <span className={cx("inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap shadow-2xs", OUTCOME_PILL[outcome] ?? "bg-zinc-100 text-zinc-700")}>
      {OUTCOME_LABEL[outcome as Outcome] ?? outcome}
    </span>
  );
}

export function RootCauseTag({ cause }: { cause?: string | null }) {
  if (!cause || cause === "none") return null;
  return (
    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/80 rounded-md whitespace-nowrap">
      {ROOT_CAUSE_LABEL[cause as RootCause] ?? cause}
    </span>
  );
}

export function SentimentText({ s }: { s?: string | null }) {
  const cls = s === "Positive" ? "text-emerald-600 font-semibold" : s === "Negative" ? "text-rose-600 font-semibold" : "text-zinc-500 font-medium";
  return <span className={cls}>{s ?? "—"}</span>;
}

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "dark" | "danger" }) {
  const v = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-[0_1px_2px_rgb(24_24_27/0.2),inset_0_1px_0_rgb(255_255_255/0.08)]",
    ghost: "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 shadow-2xs rounded-lg",
    dark: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-xs",
  }[variant];
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 px-4 text-[13px] font-medium rounded-lg press transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
        v,
        className
      )}
    >
      {children}
    </button>
  );
}

export function Insight({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "bad" }) {
  return (
    <div
      className={cx(
        "mt-4 rounded-lg border px-4 py-3 text-[13px] leading-relaxed",
        tone === "bad"
          ? "border-rose-200 bg-rose-50/60 text-rose-900"
          : "border-zinc-200 bg-zinc-50/80 text-zinc-800"
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-zinc-200 rounded-xl bg-white p-12 text-center shadow-card">
      <div className="font-display font-semibold text-zinc-900 text-base">{title}</div>
      {children && <div className="text-sm text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  );
}

export function fmtDur(s: number | null | undefined) {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
}
export function fmtPct(x: number | null | undefined, digits = 0) {
  return x === null || x === undefined ? "—" : `${(x * 100).toFixed(digits)}%`;
}
export function fmtMoney(cents: number | null | undefined) {
  return cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(2)}`;
}
export function fmtMs(ms: number | null | undefined) {
  return ms === null || ms === undefined ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
export function fmtDate(iso: string | null | undefined, tz: string, withTime = true) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }),
  }).format(new Date(iso));
}
export function humanize(s: string | null | undefined) {
  return (s ?? "unknown").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
