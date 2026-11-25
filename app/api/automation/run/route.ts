import { NextResponse, after, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/security";
import { systemListWorkspaces } from "@/lib/live/conn";
import { runDigest } from "@/lib/automation/digest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Starts one workspace's scheduled analysis. Called only by the daily job (same CRON_SECRET), so
 * each run gets its own 5-minute budget. Answers right away; the run continues in the background.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let id = "";
  try { id = String(((await req.json()) as { ws?: unknown }).ws ?? ""); } catch { /* bad body */ }
  if (!/^ws_[a-z0-9]{1,24}$/.test(id)) return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const ws = (await systemListWorkspaces()).find((w) => w.id === id);
  if (!ws) return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  after(() => runDigest(ws, { trigger: "schedule" }).then(() => undefined));
  return NextResponse.json({ ok: true, started: ws.id }, { status: 202 });
}
