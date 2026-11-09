import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/db/supabase";
import { loadAnalyticsCalls } from "@/lib/db/queries";
import { parseFilters } from "@/lib/filters";
import type { CallDiagnosis } from "@/lib/ai/schemas";

export const runtime = "nodejs";

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell).
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export of the filtered call list with AI diagnosis columns. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: ws } = await db.from("workspaces").select("timezone").eq("id", workspaceId).single();
  const calls = await loadAnalyticsCalls(db, workspaceId, parseFilters(req.nextUrl.searchParams, ws?.timezone ?? "UTC"), { withAnalysis: true });
  const header = ["call_id", "start_time", "agent", "agent_version", "direction", "from_number", "to_number", "duration_s", "status", "disconnection_reason",
    "sentiment", "retell_successful", "outcome", "ai_success", "caller_intent", "primary_root_cause", "severity", "ai_score", "summary", "recommended_fix",
    "e2e_latency_p50_ms", "e2e_latency_p90_ms", "interruptions", "dead_air_pct", "cost_usd"];
  const lines = [header.join(",")];
  for (const c of calls) {
    const d = c.analysis as unknown as CallDiagnosis | null;
    lines.push([
      c.call_id, c.start_ts, c.agent_name, c.agent_version, c.direction, c.from_number, c.to_number,
      c.duration_ms == null ? "" : Math.round(c.duration_ms / 1000), c.call_status, c.disconnection_reason, c.user_sentiment, c.call_successful,
      c.outcome, d?.success, d?.caller_intent, c.primary_root_cause, c.severity, c.overall_score, d?.plain_english_summary ?? c.call_summary, d?.recommended_fix,
      c.e2e_p50_ms, c.e2e_p90_ms, c.m?.interruptions, c.m?.dead_air_pct, c.combined_cost_cents == null ? "" : (c.combined_cost_cents / 100).toFixed(4),
    ].map(csvCell).join(","));
  }
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="calls-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
