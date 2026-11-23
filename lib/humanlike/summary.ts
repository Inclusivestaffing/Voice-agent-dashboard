import { CATEGORY_LABEL, isResult, listened, scoreLabel, type HumanlikeResult, type HumanlikeStored, type Moment } from "./schema";

export interface HumanlikeSummary {
  analyzed: number;
  skipped: number;
  pending: number;
  avg: number | null;
  label: string | null;
  sub: Record<"voice" | "timing" | "flow" | "listening" | "accuracy", number | null>;
  roboticPerCall: number | null;
  mistakesPerCall: number | null;
  trend: { x: string[]; y: (number | null)[] };
  patterns: { category: string; label: string; count: number }[];
  worst: { call_id: string; score: number; start_ts: string | null; moment: Moment }[];
  topFixes: { fix: string; count: number }[];
  /** Listening check (Gemini): calls it heard and their average naturalness, 1–5. */
  listen: { calls: number; mos: number | null; issuesPerCall: number | null };
  sample: boolean;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Aggregate per-call human-likeness results for Analytics and the report. */
export function summarizeHumanlike(
  calls: { call_id: string; start_ts: string | null }[],
  results: Map<string, HumanlikeStored>,
  opts: { timezone: string; bucket: "hour" | "day" | "week" | "month" },
): HumanlikeSummary {
  const rs: (HumanlikeResult & { start_ts: string | null })[] = [];
  let skipped = 0;
  for (const c of calls) {
    const r = results.get(c.call_id);
    if (!r) continue;
    if (isResult(r)) rs.push({ ...r, start_ts: c.start_ts }); else skipped++;
  }
  const pending = calls.length - rs.length - skipped;
  const sub = (k: keyof HumanlikeSummary["sub"]) => avg(rs.map((r) => r.subscores[k]).filter((v): v is number => v != null));

  // Trend: average score per bucket, in the workspace time zone.
  const keyOf = (iso: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: opts.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    if (opts.bucket === "month") return `${p.year}-${p.month}`;
    if (opts.bucket === "hour") return `${p.month}-${p.day} ${p.hour}h`;
    if (opts.bucket === "week") {
      const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(5, 10);
    }
    return `${p.month}-${p.day}`;
  };
  const buckets = new Map<string, number[]>();
  for (const r of [...rs].sort((a, b) => (a.start_ts ?? "").localeCompare(b.start_ts ?? ""))) {
    if (!r.start_ts) continue;
    const k = keyOf(r.start_ts);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r.score);
  }

  const counts = new Map<string, number>();
  const fixes = new Map<string, number>();
  for (const r of rs) {
    for (const m of r.moments) if (m.kind !== "natural") counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    for (const f of r.top_fixes) fixes.set(f, (fixes.get(f) ?? 0) + 1);
  }
  // One moment per call, lowest scores first, mistakes before robotic moments, skipping repeats of the same finding.
  const seenWhat = new Set<string>();
  const worst: HumanlikeSummary["worst"] = [];
  for (const r of [...rs].sort((a, b) => a.score - b.score)) {
    const moment = [...r.moments.filter((m) => m.kind === "mistake"), ...r.moments.filter((m) => m.kind === "robotic")]
      .find((m) => !seenWhat.has(m.what.replace(/\d+/g, "#")));
    if (!moment) continue;
    seenWhat.add(moment.what.replace(/\d+/g, "#"));
    worst.push({ call_id: r.call_id, score: r.score, start_ts: r.start_ts, moment });
    if (worst.length === 6) break;
  }

  const overall = avg(rs.map((r) => r.score));
  const heard = rs.map((r) => r.listening).filter(listened);
  return {
    analyzed: rs.length, skipped, pending,
    avg: overall, label: overall == null ? null : scoreLabel(overall),
    sub: { voice: sub("voice"), timing: sub("timing"), flow: sub("flow"), listening: sub("listening"), accuracy: sub("accuracy") },
    roboticPerCall: rs.length ? Math.round((rs.reduce((a, r) => a + r.moments.filter((m) => m.kind === "robotic").length, 0) / rs.length) * 10) / 10 : null,
    mistakesPerCall: rs.length ? Math.round((rs.reduce((a, r) => a + r.moments.filter((m) => m.kind === "mistake").length, 0) / rs.length) * 10) / 10 : null,
    trend: { x: [...buckets.keys()], y: [...buckets.values()].map((v) => avg(v)) },
    patterns: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([category, count]) => ({ category, count, label: CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? category })),
    worst,
    topFixes: [...fixes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([fix, count]) => ({ fix, count })),
    listen: {
      calls: heard.length,
      mos: heard.length ? Math.round((heard.reduce((a, l) => a + l.mos, 0) / heard.length) * 10) / 10 : null,
      issuesPerCall: heard.length ? Math.round((heard.reduce((a, l) => a + l.issues.length, 0) / heard.length) * 10) / 10 : null,
    },
    sample: rs.some((r) => r.source === "sample"),
  };
}
