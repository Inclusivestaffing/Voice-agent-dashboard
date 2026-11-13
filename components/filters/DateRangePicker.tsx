"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";

/* ───────────── Date helpers (calendar dates as YYYY-MM-DD strings, no time zones involved) ───────────── */

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
export const addDays = (s: string, n: number) => { const [y, m, d] = parts(s); return ymd(y, m, d + n); };
const dow = (s: string) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (s: string) => { const [y, m, d] = parts(s); return `${SHORT[m - 1]} ${d}, ${y}`; };
export const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

/** Today's calendar date in an IANA time zone. */
export const todayIn = (tz?: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined }).format(new Date());
/** "UTC-05:00" style label for a time zone. */
export function offsetLabel(tz?: string) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, timeZoneName: "longOffset" }).formatToParts(new Date());
    const v = p.find((x) => x.type === "timeZoneName")?.value ?? "GMT";
    return v === "GMT" ? "UTC" : v.replace("GMT", "UTC");
  } catch { return "UTC"; }
}

/** Same day N months back, plus one day; month ends map to month ends ("3 months" to Sep 30 starts Jul 1). */
function monthsBack(s: string, n: number) {
  const [y, m, d] = parts(s);
  const lastThis = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastTarget = new Date(Date.UTC(y, m - 1 - n + 1, 0)).getUTCDate();
  const day = d === lastThis ? lastTarget : Math.min(d, lastTarget);
  return addDays(ymd(y, m - n, day), 1);
}

export interface DRPreset { id: string; label: string; dates: ((today: string) => [string, string]) | null }

/** Presets matching the dashboard's server-side ranges (lib/filters RANGE_PRESETS). */
export const FILTER_PRESETS: DRPreset[] = [
  { id: "today", label: "Today", dates: (t) => [t, t] },
  { id: "7d", label: "Last 7 days", dates: (t) => [addDays(t, -7), t] },
  { id: "4w", label: "Last 4 weeks", dates: (t) => [addDays(t, -28), t] },
  { id: "3m", label: "Last 3 months", dates: (t) => [addDays(t, -91), t] },
  { id: "wtd", label: "Week to date", dates: (t) => [addDays(t, -((dow(t) + 6) % 7)), t] },
  { id: "mtd", label: "Month to date", dates: (t) => [t.slice(0, 8) + "01", t] },
  { id: "ytd", label: "Year to date", dates: (t) => [t.slice(0, 5) + "01-01", t] },
  { id: "all", label: "All time", dates: null },
];

/** Report periods (whole days, ending today). */
export const REPORT_PRESETS: DRPreset[] = [
  { id: "this_month", label: "This month", dates: (t) => [t.slice(0, 8) + "01", t] },
  { id: "last_30", label: "Last 30 days", dates: (t) => [addDays(t, -29), t] },
  { id: "last_90", label: "Last 90 days", dates: (t) => [addDays(t, -89), t] },
  { id: "last_3m", label: "Last 3 months", dates: (t) => [monthsBack(t, 3), t] },
  { id: "last_6m", label: "Last 6 months", dates: (t) => [monthsBack(t, 6), t] },
];

export interface DRValue { preset: string | null; from: string | null; to: string | null; fromTime?: string; toTime?: string }

/* ───────────── Component ───────────── */

/**
 * Date range picker modelled on Retell's: presets on the left, two months to drag a range across,
 * optional start/end times in the workspace time zone, and Cancel / Apply. Nothing changes until Apply.
 */
export default function DateRangePicker({ value, presets, onApply, timezone, today: todayProp, showTime = false, variant = "toolbar", min, max, label = "Date Range" }: {
  value: DRValue; presets: DRPreset[]; onApply: (v: DRValue) => void; timezone?: string; today?: string;
  showTime?: boolean; variant?: "toolbar" | "field"; min?: string; max?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const today = todayProp ?? todayIn(timezone);

  // Draft state: only committed on Apply.
  const [preset, setPreset] = useState<string | null>(value.preset);
  const [from, setFrom] = useState<string | null>(value.from);
  const [to, setTo] = useState<string | null>(value.to);
  const [hover, setHover] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState(value.fromTime || "00:00");
  const [toTime, setToTime] = useState(value.toTime || "23:59");
  const [view, setView] = useState(() => firstMonth(value, presets, today));

  const presetDates = (id: string | null) => presets.find((p) => p.id === id)?.dates?.(today) ?? null;

  function reset() {
    const pd = presetDates(value.preset);
    setPreset(value.preset);
    setFrom(value.from ?? pd?.[0] ?? null);
    setTo(value.to ?? pd?.[1] ?? null);
    setFromTime(value.fromTime || "00:00");
    setToTime(value.toTime || "23:59");
    setHover(null);
    setView(firstMonth(value, presets, today));
  }
  // Re-seed the draft from the committed value each time the picker opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reset(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function pick(d: string) {
    setPreset(null);
    if (!from || (from && to)) { setFrom(d); setTo(null); return; }
    if (d < from) { setTo(from); setFrom(d); } else setTo(d);
    setHover(null);
  }
  function choosePreset(p: DRPreset) {
    setPreset(p.id);
    const d = p.dates?.(today) ?? null;
    setFrom(d?.[0] ?? null); setTo(d?.[1] ?? null);
    if (d) setView(monthStart(addMonths(d[1], -1)));
  }
  const ready = !!preset || (!!from && !!to);
  function apply() {
    if (!ready) return;
    if (preset) onApply({ preset, from: null, to: null });
    else onApply({ preset: null, from, to, fromTime: showTime ? fromTime : undefined, toTime: showTime ? toTime : undefined });
    setOpen(false);
  }

  const committedLabel = value.preset
    ? presets.find((p) => p.id === value.preset)?.label ?? "Custom"
    : value.from && value.to ? fmtRange(value.from, value.to) : "Pick dates";
  const draftLabel = preset ? presets.find((p) => p.id === preset)?.label ?? "" : from && to ? fmtRange(from, to) : from ? `${fmtDate(from)} – pick an end date` : "Pick a start date";
  const tz = offsetLabel(timezone);

  // Range being shown (with hover preview while choosing the end).
  const lo = from && !to && hover ? (hover < from ? hover : from) : from;
  const hi = from && !to && hover ? (hover < from ? from : hover) : to;

  return (
    <div ref={root} className={cx("relative", variant === "field" && "w-full")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
        className={cx(
          "inline-flex items-center gap-2 border transition-colors",
          variant === "toolbar"
            ? "h-9 rounded-lg px-3 text-sm font-medium"
            : "mt-1.5 h-10 w-full rounded-lg px-3 text-sm text-left shadow-[0_1px_1px_rgb(24_24_27/0.03)]",
          open ? "border-zinc-400 bg-zinc-50 text-zinc-900" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
        )}>
        <CalendarIcon />
        {variant === "toolbar" ? (
          <>
            <span>{label}</span>
            <span className="text-[12px] font-normal text-zinc-500 max-w-[220px] truncate">{committedLabel}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-zinc-900">{value.preset ? committedLabel : "Custom range"}</span>
            {value.from && value.to && <span className="truncate text-zinc-500 tabular">{fmtRange(value.from, value.to)}</span>}
          </>
        )}
        <svg className={cx("h-3.5 w-3.5 text-zinc-400 transition-transform", variant === "field" && "ml-auto", open && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div id={dialogId} role="dialog" aria-label="Choose a date range"
          className="palette-in absolute left-0 top-full z-50 mt-2 w-[min(880px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-pop">
          <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-3 text-[13px]">
            <CalendarIcon />
            <span className="text-zinc-500">Date range:</span>
            <span className="font-medium text-zinc-900">{preset ? "Preset" : "Between"}</span>
          </div>

          <div className="flex flex-col sm:flex-row">
            {/* Presets */}
            <div className="flex sm:flex-col gap-1 overflow-x-auto border-b sm:border-b-0 sm:border-r border-zinc-200/70 p-2.5 sm:w-48 shrink-0" role="listbox" aria-label="Presets">
              {presets.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={preset === p.id} onClick={() => choosePreset(p)}
                  className={cx("shrink-0 rounded-lg px-3 py-2 text-left text-[13.5px] whitespace-nowrap transition-colors",
                    preset === p.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900")}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div className="flex-1 min-w-0 p-4">
              <div className="grid gap-6 md:grid-cols-2">
                {[0, 1].map((k) => {
                  const month = addMonths(view, k);
                  return (
                    <div key={k} className={cx(k === 1 && "hidden md:block")}>
                      <div className="mb-2 flex h-8 items-center">
                        {k === 0
                          ? <MonthBtn label="Previous month" onClick={() => setView(addMonths(view, -1))} d="m15 18-6-6 6-6" />
                          : <span className="w-8" aria-hidden />}
                        <span className="flex-1 text-center text-[14px] font-semibold text-zinc-900">{MONTHS[parts(month)[1] - 1]} {parts(month)[0]}</span>
                        <MonthBtn label="Next month" onClick={() => setView(addMonths(view, 1))} d="m9 18 6-6-6-6" className={cx(k === 0 && "md:invisible")} />
                      </div>
                      <Month month={month} today={today} lo={lo} hi={hi} min={min} max={max} onPick={pick} onHover={(d) => from && !to && setHover(d)} />
                      {showTime && (
                        <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 pl-2.5 pr-1 text-[13px]">
                          <span className="text-[12px] text-zinc-500 w-8">{k === 0 ? "From" : "To"}</span>
                          <input type="time" value={k === 0 ? fromTime : toTime} onChange={(e) => { setPreset(null); (k === 0 ? setFromTime : setToTime)(e.target.value || (k === 0 ? "00:00" : "23:59")); if (!from && !to) { const pd = presetDates(preset); if (pd) { setFrom(pd[0]); setTo(pd[1]); } } }}
                            className="flex-1 min-w-0 bg-transparent text-zinc-800 outline-none tabular" />
                          <span className="rounded-md bg-white border border-zinc-200 px-1.5 py-0.5 text-[11.5px] text-zinc-500 tabular">{tz}</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-zinc-200/70 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-500">Range: <span className="text-zinc-900">{draftLabel}</span></span>
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-zinc-200 px-4 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="button" onClick={apply} disabled={!ready}
              className="h-9 rounded-lg bg-zinc-900 px-4 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Month({ month, today, lo, hi, min, max, onPick, onHover }: {
  month: string; today: string; lo: string | null; hi: string | null; min?: string; max?: string;
  onPick: (d: string) => void; onHover: (d: string) => void;
}) {
  const [y, m] = parts(month);
  const first = ymd(y, m, 1);
  const lead = dow(first);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
  while (cells.length < 42) cells.push(null); // always six rows, so both months line up
  return (
    <div role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
      <div className="grid grid-cols-7 text-center text-[12px] text-zinc-400" role="row">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} role="columnheader" className="h-8 grid place-items-center">{d}</span>)}
      </div>
      <div className="grid grid-cols-7" role="rowgroup">
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="h-10" />;
          const disabled = (min && d < min) || (max && d > max);
          const isStart = d === lo, isEnd = d === hi;
          const inRange = lo && hi && d > lo && d < hi;
          const col = i % 7;
          return (
            <div key={d} role="gridcell" className={cx("relative h-10",
              (inRange || ((isStart || isEnd) && lo !== hi && lo && hi)) && "before:absolute before:inset-y-1 before:bg-zinc-100",
              inRange && "before:inset-x-0", isStart && hi && lo !== hi && "before:left-1/2 before:right-0", isEnd && lo && lo !== hi && "before:left-0 before:right-1/2",
              inRange && col === 0 && "before:rounded-l-lg", inRange && col === 6 && "before:rounded-r-lg")}>
              <button type="button" disabled={!!disabled} onClick={() => onPick(d)} onMouseEnter={() => onHover(d)} aria-pressed={isStart || isEnd}
                aria-label={fmtDate(d)}
                className={cx("relative mx-auto grid h-9 w-9 place-items-center rounded-lg text-[13.5px] tabular transition-colors",
                  isStart || isEnd ? "bg-zinc-900 font-medium text-white" : d === today ? "bg-zinc-100 font-medium text-zinc-900 ring-1 ring-inset ring-zinc-300" : "text-zinc-800 hover:bg-zinc-100",
                  disabled && "text-zinc-300 hover:bg-transparent cursor-not-allowed")}>
                {parts(d)[2]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const monthStart = (s: string) => s.slice(0, 8) + "01";
function addMonths(s: string, n: number) { const [y, m] = parts(s); return ymd(y, m + n, 1); }
function firstMonth(v: DRValue, presets: DRPreset[], today: string) {
  const end = v.to ?? presets.find((p) => p.id === v.preset)?.dates?.(today)?.[1] ?? today;
  const start = v.from;
  // Show the start month on the left when the range spans two months; otherwise end month on the right.
  if (start && monthStart(start) !== monthStart(end) && addMonths(start, 1) === monthStart(end)) return monthStart(start);
  return addMonths(end, -1);
}

const CalendarIcon = () => (
  <svg className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
function MonthBtn({ label, onClick, d, className }: { label: string; onClick: () => void; d: string; className?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cx("h-8 w-8 grid place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100", className)}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
    </button>
  );
}
