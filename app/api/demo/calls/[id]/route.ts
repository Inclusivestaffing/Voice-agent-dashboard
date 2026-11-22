import { NextResponse, after } from "next/server";
import { isResult } from "@/lib/humanlike/schema";
import { analyzeLiveCall } from "@/lib/humanlike/run";
import { getSource } from "@/lib/source";
import { toDrawerData } from "@/lib/calls/drawer";

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Room for a first-time human-likeness analysis that runs after the response is sent.
export const maxDuration = 60;

/** Call details for the Call History slide-over: sample data, or the connected Retell account. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CALL_ID.test(id)) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  const src = await getSource();
  const found = await src.call(id);
  if (!found) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  const { row: c, raw } = found;

  // The caller's other calls (last 90 days for a live account).
  const number = c.direction === "outbound" ? c.to_number : c.from_number;
  const to = new Date().toISOString(), from = new Date(Date.now() - 90 * 86400_000).toISOString();
  const pool = number ? await src.calls(src.live ? from : "2000-01-01T00:00:00Z", src.live ? to : "2100-01-01T00:00:00Z").catch(() => []) : [];
  const contactCalls = pool
    .filter((x) => number && (x.from_number === number || x.to_number === number))
    .sort((a, b) => (b.start_ts ?? "").localeCompare(a.start_ts ?? ""))
    .slice(0, 20)
    .map((x) => ({ call_id: x.call_id, start_ts: x.start_ts, direction: x.direction, duration_ms: x.duration_ms }));
  if (!contactCalls.some((x) => x.call_id === c.call_id)) contactCalls.unshift({ call_id: c.call_id, start_ts: c.start_ts, direction: c.direction, duration_ms: c.duration_ms });

  // Human-likeness: stored result, or queue this call now if it hasn't been analyzed yet.
  const hl = await src.humanlikeOne(c.call_id);
  if (!hl && src.live && src.conn) { const ws = src.conn; after(() => analyzeLiveCall(ws, c.call_id).then(() => undefined)); }
  const humanlike = isResult(hl)
    ? { result: hl, status: "ready" as const }
    : hl ? { result: null, status: "skipped" as const, note: hl.reason }
    : { result: null, status: (src.live ? "pending" : "off") as "pending" | "off", note: src.live ? "Analyzing this call now. It usually takes under a minute." : null };

  const data = toDrawerData({
    row: { ...c, to_number: c.to_number ?? null, transfer_destination: c.transfer_destination ?? null, custom_analysis: c.custom_analysis ?? null },
    raw,
    analysis: c.analysis
      ? { analysis: c.analysis, outcome: c.outcome, overall_score: c.overall_score, source: c.overall_score == null ? "rules" : "llm" }
      : c.outcome ? { analysis: null, outcome: c.outcome, overall_score: null, source: "rules" } : null,
    contactCalls,
    voicePreview: !src.live,
    humanlike,
  });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
