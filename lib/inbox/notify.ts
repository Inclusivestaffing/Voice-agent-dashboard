import "server-only";
import { getAutomationSettings } from "../automation/settings";
import type { AutomationSettings, DigestRun } from "../automation/types";
import { isResult, type HumanlikeStored } from "../humanlike/schema";
import type { LiveWorkspace } from "../live/conn";
import { toRow } from "../live/retell";
import type { DemoCall } from "../demo/openWater";
import type { RetellCall } from "../types";
import { callReasons, detailOf, severityOf, titleOf, transferAttempted, type CallSignals } from "./rules";
import { inboxAvailable, upsertInbox } from "./store";

export const signalsFromRow = (r: DemoCall): CallSignals => ({
  call_id: r.call_id, start_ts: r.start_ts, duration_ms: r.duration_ms, call_status: r.call_status ?? null,
  disconnection_reason: r.disconnection_reason ?? null, user_sentiment: r.user_sentiment ?? null,
  call_successful: r.call_successful ?? null, in_voicemail: r.in_voicemail ?? null, outcome: r.outcome ?? null,
  call_summary: r.call_summary ?? null,
});

export const signalsFromRaw = (raw: RetellCall): CallSignals => ({
  ...signalsFromRow(toRow(raw, new Map(), true)),
  transfer_attempted: transferAttempted(raw),
});

/** Put a call in the inbox if it triggers any enabled alert (merging with what's already there). */
export async function notifyCall(ws: Pick<LiveWorkspace, "id" | "name">, sig: CallSignals, hl: HumanlikeStored | null, settings?: AutomationSettings) {
  if (!inboxAvailable()) return null;
  const s = settings ?? (await getAutomationSettings(ws.id));
  const reasons = callReasons(sig, hl, s.alerts);
  if (!reasons.length) return null;
  const score = isResult(hl) ? hl.score : null;
  const { detail, fix } = detailOf(sig, hl, reasons);
  try {
    return await upsertInbox({
      id: `c:${ws.id}:${sig.call_id}`, kind: "call", ws: ws.id, wsName: ws.name,
      title: titleOf(reasons, score), detail, ...(fix ? { fix } : {}), severity: severityOf(reasons, score),
      reasons, score, callId: sig.call_id, callAt: sig.start_ts,
    });
  } catch (e) {
    console.error("inbox: couldn't save", sig.call_id, e);
    return null;
  }
}

/** Catch-up for many calls at once (cron): uses the call list plus any stored analysis. */
export async function notifyRows(ws: Pick<LiveWorkspace, "id" | "name">, rows: DemoCall[], results: Map<string, HumanlikeStored>, budgetMs = 30_000) {
  if (!inboxAvailable()) return { checked: 0, flagged: 0 };
  const s = await getAutomationSettings(ws.id);
  const started = Date.now();
  let checked = 0, flagged = 0;
  for (const r of rows) {
    if (Date.now() - started > budgetMs) break;
    if (r.call_status === "ongoing" || r.call_status === "registered") continue;
    checked++;
    if (await notifyCall(ws, signalsFromRow(r), results.get(r.call_id) ?? null, s)) flagged++;
  }
  return { checked, flagged };
}

const label = (run: DigestRun) => (run.frequency === "daily" ? "Daily" : "Weekly");

/** A finished Automation report. */
export async function notifyDigest(run: DigestRun) {
  if (!inboxAvailable() || run.status !== "done") return null;
  const n = run.narrative;
  const health = n?.health ?? "watch";
  const count = n?.improvements.length ?? 0;
  return upsertInbox({
    id: `d:${run.ws}:${run.id}`, kind: "digest", ws: run.ws, wsName: run.wsName,
    title: `${label(run)} analysis ready${count ? ` · ${count} improvement${count === 1 ? "" : "s"}` : ""}`,
    detail: n?.headline ?? `${run.stats?.calls ?? 0} calls analyzed.`,
    severity: health === "needs_attention" ? "high" : health === "watch" ? "medium" : "info",
    reasons: [], runId: run.id,
  }).catch(() => null);
}

/** Something the owner needs to know about the system itself (e.g. a scheduled run failed). */
export async function notifySystem(ws: Pick<LiveWorkspace, "id" | "name">, title: string, detail: string, opts: { runId?: string } = {}) {
  if (!inboxAvailable()) return null;
  return upsertInbox({
    id: `s:${ws.id}:${Date.now().toString(36)}`, kind: "system", ws: ws.id, wsName: ws.name,
    title, detail: detail.slice(0, 300), severity: "high", reasons: [], ...(opts.runId ? { runId: opts.runId } : {}),
  }).catch(() => null);
}
