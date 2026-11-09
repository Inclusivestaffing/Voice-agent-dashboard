// One filter model shared by the overview, calls, insights and report builder.
// Filters live in the URL query string so views are linkable and savable.

export interface Filters {
  customFrom?: string;    // the YYYY-MM-DD the user picked (custom ranges)
  customTo?: string;
  range: string;          // Retell presets: today | 7d | 4w | 3m | wtd | mtd | ytd | all | custom
  from: string;           // ISO
  to: string;             // ISO
  agent: string[];
  version: string[];      // "agentId:version"
  direction: string[];
  callType: string[];     // web_call | phone_call
  status: string[];
  outcome: string[];
  sentiment: string[];
  success: "" | "true" | "false";
  disconnection: string[];
  rootCause: string[];
  minDur?: number; maxDur?: number;          // seconds
  minCost?: number; maxCost?: number;        // dollars
  minLatency?: number; maxLatency?: number;  // ms (e2e p50)
  minScore?: number; maxScore?: number;      // 0-100
  fromNumber: string;
  toNumber: string;
  callId: string;         // Retell "Session ID"
  transferTo: string;     // Retell "Transfer Agent" (transfer destination)
  fromTime: string;       // HH:MM for custom ranges (Retell's start time)
  toTime: string;         // HH:MM for custom ranges (Retell's end time)
  batchCallId: string;
  q: string;              // transcript full-text search
  custom: Record<string, string>;   // post-call extraction (custom_analysis) key -> value
  metadata: Record<string, string>; // metadata key -> value
  dynVars: Record<string, string>;  // dynamic variable key -> value
}

/** Same presets as Retell's analytics dashboard. */
export const RANGE_PRESETS: { id: string; label: string; short: string }[] = [
  { id: "today", label: "Today", short: "Today" },
  { id: "7d", label: "Last 7 days", short: "7 days" },
  { id: "4w", label: "Last 4 weeks", short: "4 weeks" },
  { id: "3m", label: "Last 3 months", short: "3 months" },
  { id: "wtd", label: "Week to date", short: "WTD" },
  { id: "mtd", label: "Month to date", short: "MTD" },
  { id: "ytd", label: "Year to date", short: "YTD" },
  { id: "all", label: "All time", short: "All time" },
  { id: "custom", label: "Custom", short: "Custom" },
];

export const DEFAULT_RANGE = "4w";

/** Keys used in JSON-path filters must be plain identifiers (prevents PostgREST filter injection). */
export const SAFE_KEY = /^[A-Za-z0-9_]{1,64}$/;

/** UTC instant of local midnight for the calendar day containing `d` in `tz`. */
function startOfDay(d: Date, tz: string): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(d.getTime() / 1000) * 1000; // tz offset in ms
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

function localYmd(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/** Local midnight (in tz) of a calendar date. Day overflow (e.g. day 32) rolls over like Date.UTC. */
function midnightOf(y: number, m: number, d: number, tz: string): Date {
  return startOfDay(new Date(Date.UTC(y, m - 1, d, 12)), tz);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function resolveRange(range: string, from?: string | null, to?: string | null, now = new Date(), tz = "UTC", times?: { from?: string; to?: string }): { from: string; to: string } {
  const end = new Date(now);
  const day = 86400_000;
  const today = localYmd(end, tz);
  switch (range) {
    case "today": return { from: startOfDay(end, tz).toISOString(), to: end.toISOString() };
    case "7d": return { from: new Date(+end - 7 * day).toISOString(), to: end.toISOString() };
    case "4w": case "30d": return { from: new Date(+end - 28 * day).toISOString(), to: end.toISOString() };
    case "3m": case "90d": return { from: new Date(+end - 91 * day).toISOString(), to: end.toISOString() };
    case "wtd": {
      const back = (today.dow + 6) % 7; // weeks start Monday
      return { from: midnightOf(today.y, today.m, today.d - back, tz).toISOString(), to: end.toISOString() };
    }
    case "mtd": case "this_month": return { from: midnightOf(today.y, today.m, 1, tz).toISOString(), to: end.toISOString() };
    case "ytd": return { from: midnightOf(today.y, 1, 1, tz).toISOString(), to: end.toISOString() };
    case "last_month": {
      const pm = today.m === 1 ? 12 : today.m - 1, py = today.m === 1 ? today.y - 1 : today.y;
      return { from: midnightOf(py, pm, 1, tz).toISOString(), to: midnightOf(today.y, today.m, 1, tz).toISOString() };
    }
    case "all": return { from: new Date("2023-01-01T00:00:00Z").toISOString(), to: end.toISOString() };
    case "custom":
      if (from && to && /^\d{4}-\d{2}-\d{2}/.test(from) && /^\d{4}-\d{2}-\d{2}/.test(to)) {
        const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
        const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
        let f = midnightOf(fy, fm, fd, tz);
        let t = new Date(+midnightOf(ty, tm, td + 1, tz) - 1); // inclusive end of the "to" day
        if (times?.from && HHMM.test(times.from)) { const [h, mi] = times.from.split(":").map(Number); f = new Date(+f + (h * 60 + mi) * 60_000); }
        if (times?.to && HHMM.test(times.to)) { const [h, mi] = times.to.split(":").map(Number); t = new Date(+midnightOf(ty, tm, td, tz) + (h * 60 + mi) * 60_000 + 59_999); }
        if (Number.isFinite(+f) && Number.isFinite(+t) && f <= t) return { from: f.toISOString(), to: t.toISOString() };
      }
      return resolveRange(DEFAULT_RANGE, null, null, now, tz);
    default: return resolveRange(DEFAULT_RANGE, null, null, now, tz);
  }
}

type SP = Record<string, string | string[] | undefined> | URLSearchParams;

function getAll(sp: SP, k: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);
  const v = sp[k];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(",")).filter(Boolean);
}
function get1(sp: SP, k: string): string {
  return getAll(sp, k)[0] ?? "";
}
function num(sp: SP, k: string): number | undefined {
  const v = get1(sp, k);
  return v === "" || isNaN(Number(v)) ? undefined : Number(v);
}

export function parseFilters(sp: SP, tz = "UTC"): Filters {
  const range = get1(sp, "range") || DEFAULT_RANGE;
  const fromTime = get1(sp, "ft"), toTime = get1(sp, "tt");
  const { from, to } = resolveRange(range, get1(sp, "from"), get1(sp, "to"), new Date(), tz, { from: fromTime, to: toTime });
  const custom: Record<string, string> = {}, metadata: Record<string, string> = {}, dynVars: Record<string, string> = {};
  const keys = sp instanceof URLSearchParams ? [...sp.keys()] : Object.keys(sp);
  for (const k of keys) {
    const prefix = k.slice(0, 3), key = k.slice(3);
    if (!SAFE_KEY.test(key)) continue; // ignore anything that isn't a plain identifier
    const v = get1(sp, k).slice(0, 200);
    if (prefix === "cf.") custom[key] = v;
    else if (prefix === "md.") metadata[key] = v;
    else if (prefix === "dv.") dynVars[key] = v;
  }
  const success = get1(sp, "success");
  return {
    range, from, to,
    agent: getAll(sp, "agent"),
    version: getAll(sp, "version"),
    direction: getAll(sp, "direction"),
    callType: getAll(sp, "call_type").filter((v) => v === "web_call" || v === "phone_call"),
    status: getAll(sp, "status"),
    outcome: getAll(sp, "outcome"),
    sentiment: getAll(sp, "sentiment"),
    success: success === "true" || success === "false" ? success : "",
    disconnection: getAll(sp, "disconnection"),
    rootCause: getAll(sp, "root_cause"),
    minDur: num(sp, "min_dur"), maxDur: num(sp, "max_dur"),
    minCost: num(sp, "min_cost"), maxCost: num(sp, "max_cost"),
    minLatency: num(sp, "min_lat"), maxLatency: num(sp, "max_lat"),
    minScore: num(sp, "min_score"), maxScore: num(sp, "max_score"),
    fromNumber: get1(sp, "from_number"),
    toNumber: get1(sp, "to_number"),
    customFrom: range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(get1(sp, "from")) ? get1(sp, "from") : undefined,
    customTo: range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(get1(sp, "to")) ? get1(sp, "to") : undefined,
    callId: get1(sp, "call_id").slice(0, 100),
    transferTo: get1(sp, "transfer").slice(0, 100),
    fromTime: HHMM.test(fromTime) ? fromTime : "",
    toTime: HHMM.test(toTime) ? toTime : "",
    batchCallId: get1(sp, "batch_call_id").slice(0, 100),
    q: get1(sp, "q").slice(0, 200),
    custom, metadata, dynVars,
  };
}

/** Serialize back to a query string (used for links, saved views and report filters). */
export function filtersToQuery(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  if (f.range) p.set("range", f.range);
  if (f.range === "custom") {
    const fd = f.customFrom ?? f.from?.slice(0, 10), td = f.customTo ?? f.to?.slice(0, 10);
    if (fd) p.set("from", fd); if (td) p.set("to", td);
    if (f.fromTime) p.set("ft", f.fromTime); if (f.toTime) p.set("tt", f.toTime);
  }
  const arr: [keyof Filters, string][] = [["agent", "agent"], ["version", "version"], ["direction", "direction"], ["callType", "call_type"], ["status", "status"],
    ["outcome", "outcome"], ["sentiment", "sentiment"], ["disconnection", "disconnection"], ["rootCause", "root_cause"]];
  for (const [k, q] of arr) { const v = f[k] as string[] | undefined; if (v?.length) p.set(q, v.join(",")); }
  const scalars: [keyof Filters, string][] = [["success", "success"], ["minDur", "min_dur"], ["maxDur", "max_dur"], ["minCost", "min_cost"],
    ["maxCost", "max_cost"], ["minLatency", "min_lat"], ["maxLatency", "max_lat"], ["minScore", "min_score"], ["maxScore", "max_score"],
    ["fromNumber", "from_number"], ["toNumber", "to_number"], ["callId", "call_id"], ["transferTo", "transfer"], ["batchCallId", "batch_call_id"], ["q", "q"]];
  for (const [k, q] of scalars) { const v = f[k]; if (v !== undefined && v !== "") p.set(q, String(v)); }
  for (const [k, v] of Object.entries(f.custom ?? {})) if (v) p.set(`cf.${k}`, v);
  for (const [k, v] of Object.entries(f.metadata ?? {})) if (v) p.set(`md.${k}`, v);
  for (const [k, v] of Object.entries(f.dynVars ?? {})) if (v) p.set(`dv.${k}`, v);
  return p.toString();
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  for (const k of ["agent", "version", "direction", "callType", "status", "outcome", "sentiment", "disconnection", "rootCause"] as const) if (f[k].length) n++;
  for (const k of ["success", "fromNumber", "toNumber", "callId", "transferTo", "batchCallId", "q"] as const) if (f[k]) n++;
  for (const k of ["minDur", "maxDur", "minCost", "maxCost", "minLatency", "maxLatency", "minScore", "maxScore"] as const) if (f[k] !== undefined) n++;
  return n + Object.keys(f.custom).length + Object.keys(f.metadata).length + Object.keys(f.dynVars).length;
}
