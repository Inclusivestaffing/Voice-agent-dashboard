// "Every number in the narrative must come from the data" check, shared by the report
// generator and tests. Pure (no server-only imports).
import type { ReportNarrative } from "../ai/schemas";
import type { ReportSnapshot } from "./snapshot";

function allowedNumbers(s: ReportSnapshot): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    for (const v of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100, n * 100, Math.round(n * 100), Math.round(n * 1000) / 10, n / 60, Math.round((n / 60) * 10) / 10, Math.round(n / 60), n / 100, Math.round(n) / 100, Math.round(n / 1000 * 10) / 10]) {
      out.add(String(Math.round(v * 100) / 100));
    }
  };
  const walk = (x: unknown) => {
    if (typeof x === "number") add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(s.summary); walk(s.previous); walk(s.issues.map((i) => [i.count, i.examples]));
  s.calls.forEach((c) => { add(c.n); if (c.dur_s != null) add(c.dur_s); if (c.score != null) add(c.score); });
  for (let i = 0; i <= 12; i++) out.add(String(i));
  const from = new Date(s.period.from), to = new Date(s.period.to);
  for (const d of [from, to]) { out.add(String(d.getUTCFullYear())); out.add(String(d.getUTCDate())); out.add(String(d.getUTCMonth() + 1)); }
  const days = Math.round((+to - +from) / 86400_000);
  add(days); add(Math.round(days / 7));
  out.add("24"); out.add("90"); out.add("100");
  return out;
}

export function unverifiedNumbers(n: ReportNarrative, s: ReportSnapshot): string[] {
  const allowed = allowedNumbers(s);
  const text = JSON.stringify(n);
  const found = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const bad = new Set<string>();
  for (const raw of found) {
    const v = String(Math.round(Number(raw.replace(",", "")) * 100) / 100);
    if (!allowed.has(v)) bad.add(raw);
  }
  return [...bad];
}

