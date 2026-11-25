import { demoCalls } from "../demo/openWater";
import { sampleHumanlike } from "../humanlike/sample";
import { defaultSettings } from "../automation/types";
import { SAMPLE_RUN_ID } from "../automation/sample";
import { callReasons, detailOf, severityOf, titleOf } from "./rules";
import { isResult } from "../humanlike/schema";
import type { InboxItem } from "./types";

/** What the inbox would hold for the Open Water Marine sample (newest 12 urgent calls + the sample report). */
export function sampleInbox(): InboxItem[] {
  const s = defaultSettings();
  const hl = sampleHumanlike();
  const items: InboxItem[] = [];
  for (const c of demoCalls()) {
    const sig = {
      call_id: c.call_id, start_ts: c.start_ts, duration_ms: c.duration_ms, call_status: c.call_status ?? null,
      disconnection_reason: c.disconnection_reason ?? null, user_sentiment: c.user_sentiment ?? null,
      call_successful: c.call_successful ?? null, in_voicemail: c.in_voicemail ?? null, outcome: c.outcome ?? null, call_summary: c.call_summary,
    };
    const r = hl.get(c.call_id) ?? null;
    const reasons = callReasons(sig, r, s.alerts);
    if (!reasons.length) continue;
    const score = isResult(r) ? r.score : null;
    const at = c.end_ts ?? c.start_ts ?? "2026-09-30T00:00:00Z";
    const { detail, fix } = detailOf(sig, r, reasons);
    items.push({
      id: `c:sample:${c.call_id}`, kind: "call", ws: "sample", wsName: "Open Water Marine", title: titleOf(reasons, score), detail,
      ...(fix ? { fix } : {}), severity: severityOf(reasons, score), reasons, score, callId: c.call_id, callAt: c.start_ts,
      created_at: at, updated_at: at, read_at: null, sample: true,
    });
  }
  items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const report: InboxItem = {
    id: `d:sample:${SAMPLE_RUN_ID}`, kind: "digest", ws: "sample", wsName: "Open Water Marine",
    title: "Weekly analysis ready · 4 improvements", detail: "Transfers to the service desk fail when nobody picks up, and those callers aren't offered a callback.",
    severity: "high", reasons: [], runId: SAMPLE_RUN_ID, created_at: "2026-09-30T23:10:00.000Z", updated_at: "2026-09-30T23:10:00.000Z", read_at: null, sample: true,
  };
  return [report, ...items.slice(0, 12)];
}
