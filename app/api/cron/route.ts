import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";
import { syncCalls } from "@/lib/retell/sync";
import { processPending } from "@/lib/pipeline/processCall";
import { collectBatches } from "@/lib/pipeline/batch";
import { evaluateAlerts } from "@/lib/alerts";
import { safeEqual } from "@/lib/security";
import { systemListWorkspaces } from "@/lib/live/conn";
import { liveCalls } from "@/lib/live/retell";
import { sweepLive } from "@/lib/humanlike/run";
import { getHumanlikeMany } from "@/lib/humanlike/store";
import { notifyRows } from "@/lib/inbox/notify";
import { dispatchDue } from "@/lib/automation/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron, see vercel.json): starts the scheduled Automation analyses that are due,
 * puts urgent calls the webhook missed in the inbox, and catches up per-call analysis. With a
 * database: incremental sync, pending analyses, AI batches and alert rules.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const results: Record<string, unknown> = {};

  // Workspaces created in Settings (Vercel storage).
  const workspaces = await systemListWorkspaces();
  // 1. Start the scheduled analyses that are due (each runs as its own request).
  const automation = await dispatchDue(workspaces, started + 60_000).catch((e) => ({ error: String(e) }));
  for (const ws of workspaces) {
    if (Date.now() - started > 150_000) break;
    try {
      const calls = await liveCalls(ws, new Date(Date.now() - 2 * 86400_000).toISOString(), new Date().toISOString());
      // 2. Anything urgent the webhook missed goes to the inbox (no AI cost: Retell's data + stored analysis).
      const inbox = await notifyRows(ws, calls, await getHumanlikeMany(ws.id, calls.map((c) => c.call_id)), 20_000);
      // 3. Catch up human-likeness analysis for the last 2 days.
      results[ws.id] = { inbox, ...(await sweepLive(ws, calls.map((c) => c.call_id), { max: 25, budgetMs: 80_000 })) };
    } catch (e) {
      results[ws.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  results.automation = automation;

  // Database-backed workspaces (only when Supabase is configured).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, results, ms: Date.now() - started });
  }
  const db = supabaseAdmin();
  const { data: conns } = await db.from("retell_connections").select("workspace_id");
  for (const c of conns ?? []) {
    if (Date.now() - started > 200_000) break;
    try {
      const sync = await syncCalls(c.workspace_id, { fromMs: Date.now() - 2 * 86400_000, kind: "incremental" });
      const processed = await processPending(c.workspace_id, { limit: 20, budgetMs: 45_000 });
      results[c.workspace_id] = { sync, processed: processed.processed, failed: processed.failed.length };
    } catch (e) {
      results[c.workspace_id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  const batches = await collectBatches().catch((e) => ({ error: String(e) }));
  const alerts = await evaluateAlerts().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ok: true, results, batches, alerts, ms: Date.now() - started });
}
