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

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Safety-net job (Vercel Cron, every 15 min): incremental sync for every connected
 * workspace (catches anything a webhook missed), analyzes pending calls, collects
 * finished AI batches and evaluates alert rules.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const results: Record<string, unknown> = {};

  // Workspaces created in Settings (Vercel storage): catch up human-likeness analysis for the last 2 days.
  for (const ws of await systemListWorkspaces()) {
    if (Date.now() - started > 120_000) break;
    try {
      const calls = await liveCalls(ws, new Date(Date.now() - 2 * 86400_000).toISOString(), new Date().toISOString());
      results[ws.id] = await sweepLive(ws, calls.map((c) => c.call_id), { max: 25, budgetMs: 100_000 });
    } catch (e) {
      results[ws.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

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
