import { NextResponse, after, type NextRequest } from "next/server";
import Retell from "retell-sdk";
import { supabaseAdmin } from "@/lib/db/supabase";
import { getRetellKey } from "@/lib/retell/client";
import { normalizeCall } from "@/lib/retell/normalize";
import { processCall } from "@/lib/pipeline/processCall";
import type { RetellCall } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retell webhook (set per agent or account-wide in Retell to
 * https://<app>/api/webhooks/retell/<workspaceId>). Events: call_started, call_ended, call_analyzed.
 * Signature is verified with the workspace's Retell API key (x-retell-signature).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(workspaceId)) return NextResponse.json({ error: "bad workspace" }, { status: 404 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > 5_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > 5_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const signature = req.headers.get("x-retell-signature") ?? "";

  let apiKey: string;
  try { apiKey = await getRetellKey(workspaceId); } catch { return NextResponse.json({ error: "unknown workspace" }, { status: 404 }); }
  const valid = await Retell.verify(body, apiKey, signature).catch(() => false);
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: { event: string; call: RetellCall };
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const call = payload.call;
  if (!call?.call_id || !/^[A-Za-z0-9_-]{1,128}$/.test(call.call_id)) return NextResponse.json({ ok: true });

  const ended = call.call_status === "ended" || call.call_status === "error" || call.call_status === "not_connected";
  const db = supabaseAdmin();
  await db.from("calls").upsert(normalizeCall(workspaceId, call, ended && !!(call.transcript || call.transcript_object)), { onConflict: "workspace_id,call_id" });

  // Analyze once Retell's own post-call analysis is attached (call_analyzed); fall back to call_ended
  // for agents without post-call analysis configured.
  if (payload.event === "call_analyzed" || (payload.event === "call_ended" && !call.call_analysis)) {
    after(async () => {
      try { await processCall(workspaceId, call.call_id); } catch (e) { console.error("processCall failed", call.call_id, e); }
    });
  }
  return NextResponse.json({ ok: true });
}
