/** Max number of calls in progress at the same instant (sweep line over start/end events). */
export function maxConcurrency(calls: { start_ts: string | null; end_ts: string | null; duration_ms?: number | null }[]): {
  max: number;
  at: string | null;
} {
  const events: [number, number][] = [];
  for (const c of calls) {
    if (!c.start_ts) continue;
    const s = Date.parse(c.start_ts);
    const e = c.end_ts ? Date.parse(c.end_ts) : s + (c.duration_ms ?? 0);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    events.push([s, 1], [e, -1]);
  }
  // Ends before starts at the same timestamp so back-to-back calls don't overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0, at: number | null = null;
  for (const [t, d] of events) {
    cur += d;
    if (cur > max) { max = cur; at = t; }
  }
  return { max, at: at === null ? null : new Date(at).toISOString() };
}
