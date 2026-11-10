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
    <section className={cx("bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 min-w-0", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">{title}</h2>}
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
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
    <div
      className={cx(
        "relative bg-white border border-slate-200/90 rounded-xl p-5 h-full shadow-xs transition-[border-color,box-shadow] duration-150",
        href && "hover:border-slate-300 hover:shadow-sm cursor-pointer"
      )}
    >
      {tone === "bad" && <div className="absolute inset-x-0 top-0 h-[3px] bg-rose-500 rounded-t-xl" />}
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={cx("text-[30px] font-bold tracking-tight text-slate-900 mt-2 leading-none", tone === "bad" && "text-rose-600")}>
        {value}
        {unit && <span className="text-base font-semibold text-slate-400 ml-1">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-500 min-h-4">
        {delta !== undefined && delta !== null && <Delta value={delta} goodWhen={deltaGoodWhen} />}
        {sub}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block press rounded-xl focus-visible:outline-offset-4">{body}</Link> : body;
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
          ? "bg-slate-100 text-slate-600 border-slate-200"
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
  return <div className={cx("grid grid-cols-2 md:grid-cols-3 gap-3.5", map[cols])}>{children}</div>;
}

const OUTCOME_PILL: Record<string, string> = {
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
  transfer_ok: "bg-sky-50 text-sky-700 border border-sky-200/80",
  transfer_fail: "bg-rose-50 text-rose-700 border border-rose-200/80",
  lead_captured: "bg-purple-50 text-purple-700 border border-purple-200/80",
  info: "bg-slate-100 text-slate-700 border border-slate-200",
  silent: "text-slate-400 border border-dashed border-slate-300",
  spam: "bg-slate-100 text-slate-400 line-through",
  abusive: "bg-rose-50 text-rose-700 border border-rose-200",
  voicemail: "bg-slate-100 text-slate-500",
  no_data: "text-slate-400",
};

export function OutcomePill({ outcome }: { outcome?: string | null }) {
  if (!outcome) return <span className="text-xs text-slate-400">Pending AI</span>;
  return (
    <span className={cx("inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap shadow-2xs", OUTCOME_PILL[outcome] ?? "bg-slate-100 text-slate-700")}>
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
  const cls = s === "Positive" ? "text-emerald-600 font-semibold" : s === "Negative" ? "text-rose-600 font-semibold" : "text-slate-500 font-medium";
  return <span className={cls}>{s ?? "—"}</span>;
}

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "dark" | "danger" }) {
  const v = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-xs",
    ghost: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs",
    dark: "bg-slate-900 text-white hover:bg-slate-800 shadow-xs",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-xs",
  }[variant];
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg press transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
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
        "mt-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed shadow-2xs",
        tone === "bad"
          ? "border-rose-200 bg-rose-50/60 text-rose-900"
          : "border-slate-200 bg-slate-50/80 text-slate-800"
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-slate-200 rounded-xl bg-white p-12 text-center shadow-xs">
      <div className="font-semibold text-slate-800 text-base">{title}</div>
      {children && <div className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
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
