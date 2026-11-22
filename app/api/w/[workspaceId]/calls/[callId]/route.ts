import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db/supabase";
import { UUID } from "@/lib/security";
import { toDrawerData } from "@/lib/calls/drawer";
import type { CallRow } from "@/lib/types";
import { isResult, type HumanlikeStored } from "@/lib/humanlike/schema";

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Call details for the Call History slide-over. Members of the workspace only (RLS applies too). */
export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string; callId: string }> }) {
  const { workspaceId, callId } = await params;
  if (!UUID.test(workspaceId) || !CALL_ID.test(callId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: call }, { data: analysis }, { data: hlRow }] = await Promise.all([
    db.from("calls").select("*").eq("workspace_id", workspaceId).eq("call_id", callId).maybeSingle<CallRow>(),
    db.from("call_analyses").select("outcome, analysis, overall_score, source").eq("workspace_id", workspaceId).eq("call_id", callId).maybeSingle(),
    db.from("call_humanlike").select("result").eq("workspace_id", workspaceId).eq("call_id", callId).maybeSingle(),
  ]);
  const hl = (hlRow?.result ?? null) as HumanlikeStored | null;
  const humanlike = isResult(hl) ? { result: hl, status: "ready" as const }
    : hl ? { result: null, status: "skipped" as const, note: hl.reason }
    : { result: null, status: "pending" as const, note: "This call hasn't been analyzed yet. It's picked up with the next sync." };
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const number = call.direction === "outbound" ? call.to_number : call.from_number;
  // Other calls with the same caller: two plain .eq() queries (no string-built filter expressions).
  const cols = "call_id, start_ts, direction, duration_ms";
  const [{ data: asFrom }, { data: asTo }] = number
    ? await Promise.all([
      db.from("calls").select(cols).eq("workspace_id", workspaceId).eq("from_number", number).order("start_ts", { ascending: false }).limit(20),
      db.from("calls").select(cols).eq("workspace_id", workspaceId).eq("to_number", number).order("start_ts", { ascending: false }).limit(20),
    ])
    : [{ data: [] }, { data: [] }];
  const seen = new Set<string>();
  const contact = [...(asFrom ?? []), ...(asTo ?? [])]
    .filter((c) => !seen.has(c.call_id) && !!seen.add(c.call_id))
    .sort((a, b) => (b.start_ts ?? "").localeCompare(a.start_ts ?? ""))
    .slice(0, 20);

  const data = toDrawerData({ row: call, raw: call.raw, analysis, contactCalls: contact, humanlike });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
