import { NextResponse, type NextRequest } from "next/server";
import { inboxAllowed } from "@/lib/inbox/load";
import { ITEM_ID, getInboxItem, setRead } from "@/lib/inbox/store";
import { listWorkspaces, setActiveWorkspace } from "@/lib/live/conn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open an inbox item: switch to its workspace, mark it read, and go to the call (quality tab when the
 * alert is about quality) or the Automation report. Redirect targets are built here, never taken
 * from the request.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
  if (!(await inboxAllowed())) return to("/unlock");
  if (!ITEM_ID.test(id)) return to("/demo/inbox");
  const it = await getInboxItem(id);
  if (!it || !(await listWorkspaces()).some((w) => w.id === it.ws)) return to("/demo/inbox");
  await setActiveWorkspace(it.ws);
  await setRead([it.id]).catch(() => 0);
  if (it.kind === "call" && it.callId) {
    return to(`/demo/calls?call=${encodeURIComponent(it.callId)}${it.reasons.includes("low_quality") ? "&tab=quality" : ""}`);
  }
  if (it.runId) return to(`/demo/automation/runs/${encodeURIComponent(it.runId)}`);
  return to("/demo/automation");
}
