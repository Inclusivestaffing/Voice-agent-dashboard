import { NextResponse, after, type NextRequest } from "next/server";
import Retell from "retell-sdk";
import { systemListWorkspaces } from "@/lib/live/conn";
import { analyzeLiveCall } from "@/lib/humanlike/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retell webhook for a workspace created in Settings (no database):
 * https://<app>/api/live/webhook/<workspace id>. When a call has been analyzed by Retell, run the
 * human-likeness analysis right away. The signature is checked with the workspace's own Retell key.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!/^ws_[a-z0-9]{1,24}$/.test(workspaceId)) return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > 5_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > 5_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  const ws = (await systemListWorkspaces()).find((w) => w.id === workspaceId);
  if (!ws) return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const valid = await Retell.verify(body, ws.apiKey, req.headers.get("x-retell-signature") ?? "").catch(() => false);
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: { event?: string; call?: { call_id?: string; agent_id?: string; call_analysis?: unknown } };
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const call = payload.call;
  if (!call?.call_id || !/^[A-Za-z0-9_-]{1,128}$/.test(call.call_id)) return NextResponse.json({ ok: true });
  if (ws.agentIds.length && !ws.agentIds.includes(call.agent_id ?? "")) return NextResponse.json({ ok: true, ignored: "agent not in this workspace" });

  // Wait for Retell's own post-call analysis when the agent has it; otherwise use call_ended.
  if (payload.event === "call_analyzed" || (payload.event === "call_ended" && !call.call_analysis)) {
    const id = call.call_id;
    after(() => analyzeLiveCall(ws, id).then(() => undefined));
  }
  return NextResponse.json({ ok: true });
}
