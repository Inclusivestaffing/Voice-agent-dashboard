// Small, dependency-free statistics helpers. Percentiles use linear interpolation
// (same convention as numpy's default), which is what most dashboards show.

export function nums(xs: (number | null | undefined)[]): number[] {
  return xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

export function sum(xs: (number | null | undefined)[]): number {
  return nums(xs).reduce((a, b) => a + b, 0);
}

export function mean(xs: (number | null | undefined)[]): number | null {
  const v = nums(xs);
  return v.length ? sum(v) / v.length : null;
}

export function percentile(xs: (number | null | undefined)[], p: number): number | null {
  const v = nums(xs).sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const idx = (p / 100) * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

export const median = (xs: (number | null | undefined)[]) => percentile(xs, 50);

export function min(xs: (number | null | undefined)[]): number | null {
  const v = nums(xs);
  return v.length ? Math.min(...v) : null;
}

export function max(xs: (number | null | undefined)[]): number | null {
  const v = nums(xs);
  return v.length ? Math.max(...v) : null;
}

export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface Distribution {
  avg: number | null; median: number | null; p90: number | null;
  min: number | null; max: number | null; sum: number; count: number;
}

export function distribution(xs: (number | null | undefined)[]): Distribution {
  const v = nums(xs);
  return {
    avg: mean(v), median: median(v), p90: percentile(v, 90),
    min: min(v), max: max(v), sum: sum(v), count: v.length,
  };
}

// ── Interval arithmetic (seconds) ──
export type Interval = [number, number];

export function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function totalLength(intervals: Interval[]): number {
  return union(intervals).reduce((acc, [a, b]) => acc + (b - a), 0);
}

export function intersectLength(a: Interval[], b: Interval[]): number {
  const A = union(a), B = union(b);
  let i = 0, j = 0, total = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]);
    const hi = Math.min(A[i][1], B[j][1]);
    if (hi > lo) total += hi - lo;
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return total;
}
