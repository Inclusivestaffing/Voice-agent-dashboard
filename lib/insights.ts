// Cross-call insight aggregation: turns hundreds of per-call diagnoses into a ranked
// list of problems with evidence and fixes, plus version and intent comparisons.

import type { AnalyticsCallFull } from "./db/queries";
import { summarize, type WorkspaceTimeCtx } from "./metrics/aggregate";
import type { CallDiagnosis } from "./ai/schemas";

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };

export interface Issue {
  cause: string;
  count: number;
  share: number;
  prevCount: number;
  severity: Record<string, number>;
  fixes: { text: string; count: number }[];
  promptChanges: string[];
  examples: { call_id: string; summary: string; severity: string }[];
}

function diag(c: AnalyticsCallFull): CallDiagnosis | null {
  return (c.analysis as unknown as CallDiagnosis) ?? null;
}

function normFix(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 10).join(" ");
}

export function topIssues(calls: AnalyticsCallFull[], prev: AnalyticsCallFull[]): Issue[] {
  const analyzed = calls.filter((c) => c.analysis);
  const groups = new Map<string, AnalyticsCallFull[]>();
  for (const c of analyzed) {
    for (const cause of (c.root_causes ?? []).filter((r) => r !== "none" && r !== "spam_or_abuse")) {
      if (!groups.has(cause)) groups.set(cause, []);
      groups.get(cause)!.push(c);
    }
  }
  const prevCounts = new Map<string, number>();
  for (const c of prev) for (const cause of c.root_causes ?? []) prevCounts.set(cause, (prevCounts.get(cause) ?? 0) + 1);

  return [...groups.entries()].map(([cause, cs]) => {
    const severity: Record<string, number> = {};
    const fixCounts = new Map<string, { text: string; count: number; sev: number }>();
    const prompts = new Set<string>();
    for (const c of cs) {
      const d = diag(c);
      severity[c.severity ?? "none"] = (severity[c.severity ?? "none"] ?? 0) + 1;
      if (d?.recommended_fix && c.primary_root_cause === cause && !/^none/i.test(d.recommended_fix)) {
        const k = normFix(d.recommended_fix);
        const cur = fixCounts.get(k);
        if (cur) cur.count++; else fixCounts.set(k, { text: d.recommended_fix, count: 1, sev: SEV_RANK[c.severity ?? "none"] });
      }
      if (d?.prompt_change_suggestion && c.primary_root_cause === cause) prompts.add(d.prompt_change_suggestion.trim());
    }
    const examples = [...cs]
      .sort((a, b) => (SEV_RANK[b.severity ?? "none"] ?? 0) - (SEV_RANK[a.severity ?? "none"] ?? 0))
      .slice(0, 5)
      .map((c) => ({ call_id: c.call_id, summary: diag(c)?.plain_english_summary ?? c.call_summary ?? "", severity: c.severity ?? "none" }));
    return {
      cause, count: cs.length, share: cs.length / Math.max(1, analyzed.length), prevCount: prevCounts.get(cause) ?? 0, severity,
      fixes: [...fixCounts.values()].sort((a, b) => b.count - a.count || b.sev - a.sev).slice(0, 3).map(({ text, count }) => ({ text, count })),
      promptChanges: [...prompts].slice(0, 3),
      examples,
    };
  }).sort((a, b) => {
    const w = (i: Issue) => i.count * (1 + (i.severity.critical ?? 0) * 0.5 + (i.severity.high ?? 0) * 0.25);
    return w(b) - w(a);
  });
}

export function versionComparison(calls: AnalyticsCallFull[], ctx: WorkspaceTimeCtx) {
  const groups = new Map<string, AnalyticsCallFull[]>();
  for (const c of calls) {
    const k = `${c.agent_name ?? c.agent_id ?? "agent"}|${c.agent_version ?? "?"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  return [...groups.entries()].map(([k, cs]) => {
    const [agent, version] = k.split("|");
    const s = summarize(cs, ctx);
    const first = cs.reduce((m, c) => (c.start_ts && (!m || c.start_ts < m) ? c.start_ts : m), null as string | null);
    return { agent, version, calls: cs.length, first, s };
  }).sort((a, b) => a.agent.localeCompare(b.agent) || Number(b.version) - Number(a.version));
}

export function intentMix(calls: AnalyticsCallFull[]) {
  const groups = new Map<string, { n: number; ok: number; scores: number[] }>();
  for (const c of calls) {
    const d = diag(c);
    if (!d || c.outcome === "spam" || c.outcome === "silent" || c.outcome === "no_data" || c.outcome === "voicemail") continue;
    const k = (d.intent_category || "other").toLowerCase();
    const g = groups.get(k) ?? { n: 0, ok: 0, scores: [] };
    g.n++; if (d.success) g.ok++;
    if (c.overall_score != null) g.scores.push(c.overall_score);
    groups.set(k, g);
  }
  return [...groups.entries()].map(([intent, g]) => ({
    intent, calls: g.n, successRate: g.ok / g.n,
    avgScore: g.scores.length ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : null,
  })).sort((a, b) => b.calls - a.calls);
}

export function scorecardAverages(calls: AnalyticsCallFull[]) {
  const keys = ["intent_understanding", "information_accuracy", "flow_efficiency", "tone_and_empathy", "task_completion", "instruction_compliance"] as const;
  const sums: Record<string, { s: number; n: number }> = {};
  for (const c of calls) {
    const d = diag(c);
    if (!d?.scorecard || c.overall_score == null) continue;
    for (const k of keys) { sums[k] ??= { s: 0, n: 0 }; sums[k].s += d.scorecard[k]; sums[k].n++; }
  }
  return keys.map((k) => ({ key: k, avg: sums[k] ? sums[k].s / sums[k].n : null }));
}

export function reviewQueue(calls: AnalyticsCallFull[]) {
  return calls.filter((c) => c.analysis && (
    (c.overall_score != null && c.overall_score < 50) || c.severity === "high" || c.severity === "critical" ||
    c.outcome === "transfer_fail" || c.user_sentiment === "Negative"))
    .sort((a, b) => (SEV_RANK[b.severity ?? "none"] - SEV_RANK[a.severity ?? "none"]) || ((a.overall_score ?? 100) - (b.overall_score ?? 100)))
    .slice(0, 20);
}

export function followUps(calls: AnalyticsCallFull[]) {
  return calls.filter((c) => diag(c)?.followup_required).slice(0, 50);
}
