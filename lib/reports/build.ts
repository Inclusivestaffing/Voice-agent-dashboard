import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workspace } from "../db/queries";
import { loadAnalyticsCalls } from "../db/queries";
import type { Filters } from "../filters";
import { previousPeriod } from "../metrics/aggregate";
import { snapshotFromCalls, type ReportSnapshot } from "./snapshot";
import { unverifiedNumbers } from "./numbers";
import { anthropic } from "../ai/analyzeCall";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { REPORT_MODEL, ReportNarrative } from "../ai/schemas";
import { REPORT_SYSTEM_PROMPT } from "../ai/prompts";

export type { ReportCall, ReportSnapshot } from "./snapshot";

export async function buildSnapshot(db: SupabaseClient, ws: Workspace, f: Filters): Promise<ReportSnapshot> {
  const calls = await loadAnalyticsCalls(db, ws.id, f, { withAnalysis: true });
  const prev = await loadAnalyticsCalls(db, ws.id, { ...f, ...previousPeriod(f.from, f.to) });
  const ids = calls.map((c) => c.call_id);
  // Transcripts are only needed for the report's call table.
  const transcripts = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("calls").select("call_id, transcript_text").eq("workspace_id", ws.id).in("call_id", ids.slice(i, i + 200));
    for (const r of data ?? []) transcripts.set(r.call_id, r.transcript_text ?? "");
  }
  return snapshotFromCalls({
    calls, prev, transcripts, businessHours: ws.business_hours, period: { from: f.from, to: f.to },
    workspace: { name: ws.name, logo_url: ws.logo_url, brand_primary: ws.brand_primary, agent_name: ws.agent_display_name, timezone: ws.timezone },
  });
}

// ───────────── Narrative (Claude Opus 5.5) with a numbers-must-come-from-the-snapshot check ─────────────

function compactForPrompt(s: ReportSnapshot) {
  const { calls, ...rest } = s;
  return {
    ...rest,
    calls: calls.slice(0, 120).map((c) => ({
      n: c.n, outcome: c.outcome, reason: c.reason, dur_s: c.dur_s, sentiment: c.sentiment, score: c.score,
      root_cause: c.root_cause, summary: c.summary.slice(0, 280), what_failed: c.what_failed.slice(0, 3),
    })),
  };
}

export async function writeNarrative(s: ReportSnapshot): Promise<{ narrative: ReportNarrative; unverified: string[] }> {
  const base = `Write the performance report for ${s.workspace.name}'s AI receptionist${s.workspace.agent_name ? ` (${s.workspace.agent_name})` : ""} for ${s.period.from.slice(0, 10)} to ${s.period.to.slice(0, 10)}.
Notes on the snapshot: rates are fractions (0.62 = 62%); duration_s is seconds; cost_cents is US cents; latency is ms. "customer_calls" excludes silent hangups, spam, voicemail and missing data. "previous" is the prior period of equal length (null if none).

<snapshot>
${JSON.stringify(compactForPrompt(s))}
</snapshot>`;
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().beta.messages.parse({
      model: REPORT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(ReportNarrative) },
      system: REPORT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: base + feedback }],
    });
    if (res.stop_reason === "refusal") throw new Error("The report writer declined this request.");
    if (!res.parsed_output) throw new Error(`Report narrative incomplete (stop_reason=${res.stop_reason}).`);
    const unverified = unverifiedNumbers(res.parsed_output, s);
    if (!unverified.length || attempt === 1) return { narrative: res.parsed_output, unverified };
    feedback = `\n\nYour previous draft used numbers that are not in the snapshot: ${unverified.join(", ")}. Rewrite using only numbers present in the snapshot (rounding allowed).`;
  }
  throw new Error("unreachable");
}
