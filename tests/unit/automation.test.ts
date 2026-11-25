import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { callReasons, severityOf, titleOf, transferAttempted, detailOf, type CallSignals } from "../../lib/inbox/rules";
import { isDue, scheduleLabel } from "../../lib/automation/schedule";
import { buildDigestPrompt, chooseTranscriptCalls, computeStats, estimateCostUsd, ruleNarrative, transcriptText, validateNarrative, type DigestCall } from "../../lib/automation/prompt";
import { defaultSettings, normalizeSettings, type DigestNarrative } from "../../lib/automation/types";
import { sampleInbox } from "../../lib/inbox/sample";
import { sampleRun } from "../../lib/automation/sample";
import { ITEM_ID } from "../../lib/inbox/store";
import type { HumanlikeResult } from "../../lib/humanlike/schema";

const sig = (o: Partial<CallSignals> = {}): CallSignals => ({
  call_id: "call_1", start_ts: "2026-11-24T16:00:00Z", duration_ms: 95_000, call_status: "ended", disconnection_reason: "agent_hangup",
  user_sentiment: "Neutral", call_successful: true, in_voicemail: false, outcome: "info", call_summary: "Caller asked about a furnace.", ...o,
});
const hl = (score: number, o: Partial<HumanlikeResult> = {}): HumanlikeResult => ({
  version: 1, call_id: "call_1", analyzed_at: "2026-11-24T16:05:00Z", source: "claude", score, label: "x",
  subscores: { voice: score, timing: score, flow: score, listening: score, accuracy: score }, verdict: "Sounded scripted on the readback.",
  summary: "s", moments: [{ at_s: 12, end_s: 14, turn: 3, kind: "mistake", category: "reasked_known_info", what: "Asked for the name again.", why: "y", fix: "Don't re-ask the name." }],
  top_fixes: ["Confirm volunteered details instead of re-asking."], acoustic: { analyzed: false, sentences: 0 } as unknown as HumanlikeResult["acoustic"], duration_s: 95, ...o,
});
const on = defaultSettings().alerts;

describe("which calls go to the inbox", () => {
  it("flags quality below the threshold (90 by default) and not at or above it", () => {
    expect(callReasons(sig(), hl(89), on)).toEqual(["low_quality"]);
    expect(callReasons(sig(), hl(90), on)).toEqual([]);
    expect(callReasons(sig(), hl(60), { ...on, threshold: 50 })).toEqual([]);
  });
  it("flags failed transfers: cancelled, or a transfer tool ran but the call didn't end transferred", () => {
    expect(callReasons(sig({ disconnection_reason: "transfer_cancelled" }), null, on)).toContain("transfer_fail");
    expect(callReasons(sig({ transfer_attempted: true }), null, on)).toContain("transfer_fail");
    expect(callReasons(sig({ transfer_attempted: true, disconnection_reason: "call_transfer" }), null, on)).not.toContain("transfer_fail");
    expect(transferAttempted({ transcript_with_tool_calls: [{ role: "tool_call_invocation", name: "transfer_to_owner" }] })).toBe(true);
    expect(transferAttempted({ transcript_with_tool_calls: [{ role: "tool_call_invocation", name: "Book" }] })).toBe(false);
  });
  it("flags upset callers and unsuccessful calls, but not spam, voicemail or 5-second hangups", () => {
    expect(callReasons(sig({ user_sentiment: "Negative" }), null, on)).toEqual(["negative"]);
    expect(callReasons(sig({ user_sentiment: "Negative", outcome: "spam" }), null, on)).toEqual([]);
    expect(callReasons(sig({ call_successful: false }), null, on)).toEqual(["unsuccessful"]);
    expect(callReasons(sig({ call_successful: false, duration_ms: 5000 }), null, on)).toEqual([]);
    expect(callReasons(sig({ call_successful: false, in_voicemail: true }), null, on)).toEqual([]);
  });
  it("flags call errors", () => {
    expect(callReasons(sig({ call_status: "error", disconnection_reason: "error_llm_websocket_lost_connection" }), null, on)).toEqual(["error"]);
  });
  it("only sends the kinds that are switched on", () => {
    const off = { ...on, reasons: { ...on.reasons, negative: false, low_quality: false } };
    expect(callReasons(sig({ user_sentiment: "Negative" }), hl(40), off)).toEqual([]);
  });
  it("ranks severity and writes a short title", () => {
    expect(severityOf(["transfer_fail"], null)).toBe("critical");
    expect(severityOf(["low_quality"], 45)).toBe("critical");
    expect(severityOf(["low_quality"], 65)).toBe("high");
    expect(severityOf(["low_quality"], 82)).toBe("medium");
    expect(titleOf(["low_quality", "transfer_fail"], 62)).toBe("Transfer failed · Quality 62/100");
    expect(titleOf(["low_quality", "negative", "unsuccessful"], 70)).toBe("Upset caller · Quality 70/100 +1");
  });
  it("uses the analysis verdict and its top fix for quality alerts", () => {
    expect(detailOf(sig(), hl(70), ["low_quality"])).toEqual({ detail: "Sounded scripted on the readback.", fix: "Confirm volunteered details instead of re-asking." });
    expect(detailOf(sig(), null, ["negative"]).detail).toBe("Caller asked about a furnace.");
  });
});

describe("schedule", () => {
  const tz = "America/Chicago";
  // 00:00 UTC on Tue Nov 24 2026 is 6 PM Monday in Chicago.
  const mondayEvening = new Date("2026-11-24T00:05:00Z");
  it("runs daily about once a day", () => {
    const s = { enabled: true, frequency: "daily" as const, weekday: 1 };
    expect(isDue(s, null, mondayEvening, tz)).toBe(true);
    expect(isDue(s, "2026-11-23T00:04:00Z", mondayEvening, tz)).toBe(true);
    expect(isDue(s, "2026-11-23T12:00:00Z", mondayEvening, tz)).toBe(false);
  });
  it("runs weekly on the chosen weekday in the workspace's time zone, and catches up a missed week", () => {
    const monday = { enabled: true, frequency: "weekly" as const, weekday: 1 };
    const tuesday = { ...monday, weekday: 2 };
    expect(isDue(monday, null, mondayEvening, tz)).toBe(true);
    expect(isDue(tuesday, null, mondayEvening, tz)).toBe(false); // it's still Monday in Chicago
    expect(isDue(monday, "2026-11-20T00:00:00Z", mondayEvening, tz)).toBe(false); // ran 4 days ago
    expect(isDue(tuesday, "2026-11-12T00:00:00Z", mondayEvening, tz)).toBe(true); // 12 days: missed
    expect(isDue({ ...monday, enabled: false }, null, mondayEvening, tz)).toBe(false);
  });
  it("describes when it runs in local time", () => {
    expect(scheduleLabel({ enabled: true, frequency: "weekly", weekday: 1 }, tz, new Date("2026-11-24T10:00:00Z"))).toBe("Every Monday around 6:00 PM");
  });
  it("repairs settings saved by an older version", () => {
    const s = normalizeSettings({ alerts: { threshold: 140 } } as never);
    expect(s.alerts.threshold).toBe(100);
    expect(s.alerts.reasons.transfer_fail).toBe(true);
    expect(s.schedule).toEqual({ enabled: false, frequency: "weekly", weekday: 1 });
  });
});

describe("scheduled analysis input", () => {
  const mk = (i: number, o: Partial<CallSignals> = {}, score: number | null = 92): DigestCall => ({
    sig: sig({ call_id: `call_${i}`, start_ts: `2026-11-2${i % 5}T1${i % 9}:00:00Z`, ...o }), agent_name: "Test Agent", agent_version: 34,
    hl: score == null ? null : hl(score, { call_id: `call_${i}` }), transcript: `Agent: Hello\nCaller: ${"x".repeat(9000)}`,
  });
  const calls = [mk(1), mk(2, { user_sentiment: "Negative" }), mk(3, {}, 55), mk(4, { outcome: "spam" }, null), mk(5, { duration_ms: 4000 }, null)];

  it("counts what the inbox counts", () => {
    const s = computeStats(calls, 90, 3);
    expect(s.calls).toBe(5);
    expect(s.conversations).toBe(4);
    expect(s.belowThreshold).toBe(1);
    expect(s.negative).toBe(1);
  });
  it("sends flagged calls first, skips spam and very short calls", () => {
    expect(chooseTranscriptCalls(calls, 90, 10).map((c) => c.sig.call_id)).toEqual(["call_3", "call_2", "call_1"]);
  });
  it("stays within the size limit and never drops the flagged calls first", () => {
    const p = buildDigestPrompt({ workspace: "Test Business", frequency: "weekly", period: { from: "2026-11-18T00:00:00Z", to: "2026-11-25T00:00:00Z" }, stats: computeStats(calls, 90, 3), agents: [], calls, maxChars: 9000 });
    expect(p.length).toBeLessThanOrEqual(9000 + 20);
    expect(p).toContain('call_id="call_3"');
    expect(p.indexOf('call_id="call_3"')).toBeLessThan(p.indexOf('call_id="call_1"') === -1 ? Infinity : p.indexOf('call_id="call_1"'));
    expect(p).toContain("(transcript shortened)");
  });
  it("turns tool calls into readable lines", () => {
    const t = transcriptText({ transcript_with_tool_calls: [{ role: "agent", content: "Hi" }, { role: "tool_call_invocation", name: "Book", arguments: '{"time":"10:30"}' }, { role: "tool_call_result", content: '{"ok":true}' }] });
    expect(t).toBe('Agent: Hi\n[tool call] Book({"time":"10:30"})\n[tool result] {"ok":true}');
  });
  it("drops call ids Claude made up", () => {
    const n: DigestNarrative = {
      headline: "h", health: "watch", summary: "s", what_went_well: [],
      problems: [{ title: "p", detail: "d", how_often: "2 calls", severity: "high", example_call_ids: ["call_2", "call_999"] }],
      improvements: [], calls_to_review: [{ call_id: "nope", reason: "r" }, { call_id: "call_3", reason: "r" }],
    };
    const v = validateNarrative(n, new Set(calls.map((c) => c.sig.call_id)));
    expect(v.problems[0].example_call_ids).toEqual(["call_2"]);
    expect(v.calls_to_review.map((c) => c.call_id)).toEqual(["call_3"]);
  });
  it("still gives a useful summary without Claude", () => {
    const r = ruleNarrative(computeStats(calls, 90, 3), calls);
    expect(r.health).toBe("watch"); // one call at 55, average 80, nothing broken
    expect(r.calls_to_review[0].call_id).toBe("call_3");
    const broken = [...calls, mk(6, { disconnection_reason: "transfer_cancelled" })];
    expect(ruleNarrative(computeStats(broken, 90, 3), broken).health).toBe("needs_attention");
    expect(r.improvements[0].exact_change).toBe("Confirm volunteered details instead of re-asking.");
  });
  it("estimates cost in a sensible range", () => {
    expect(estimateCostUsd(100)).toBeGreaterThan(0.3);
    expect(estimateCostUsd(100)).toBeLessThan(1.2);
    expect(estimateCostUsd(5)).toBeLessThan(0.3);
  });
});

describe("sample workspace", () => {
  it("has inbox items with valid ids and a finished sample report", () => {
    const items = sampleInbox();
    expect(items.length).toBeGreaterThan(3);
    for (const it of items) expect(it.id).toMatch(ITEM_ID);
    const run = sampleRun();
    expect(run.status).toBe("done");
    expect(run.stats?.calls).toBeGreaterThan(5);
    for (const id of run.narrative!.calls_to_review.map((c) => c.call_id)) expect(run.callRefs?.[id]).toBeTruthy();
  });
});
