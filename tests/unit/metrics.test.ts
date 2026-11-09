import { describe, expect, it } from "vitest";
import { percentile, union, totalLength, intersectLength, distribution } from "@/lib/metrics/stats";
import { computeTiming } from "@/lib/metrics/timing";
import { maxConcurrency } from "@/lib/metrics/concurrency";
import { preClassify } from "@/lib/metrics/classify";
import { summarize, bucketKey, timeSeries, METRICS, type AnalyticsCall } from "@/lib/metrics/aggregate";
import { vad } from "@/lib/metrics/audio";
import type { RetellUtterance } from "@/lib/types";
import { sampleCalls, expectedSilent, expectedSpam, expectedNoData, expectedNeedsLLM } from "../fixtures/open-water-sample";

const words = (text: string, start: number, end: number) => {
  const ws = text.split(" ");
  const step = (end - start) / ws.length;
  return ws.map((w, i) => ({ word: w, start: start + i * step, end: start + (i + 1) * step }));
};
const utt = (role: "agent" | "user", text: string, start: number, end: number): RetellUtterance =>
  ({ role, content: text, words: words(text, start, end) });

describe("stats", () => {
  it("percentile interpolates like numpy", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(percentile([], 50)).toBeNull();
  });
  it("interval maths", () => {
    expect(union([[0, 2], [1, 3], [5, 6]])).toEqual([[0, 3], [5, 6]]);
    expect(totalLength([[0, 2], [1, 3]])).toBe(3);
    expect(intersectLength([[0, 4]], [[2, 6]])).toBe(2);
  });
  it("distribution", () => {
    const d = distribution([4, null, 2, 6]);
    expect(d).toMatchObject({ avg: 4, median: 4, min: 2, max: 6, sum: 12, count: 3 });
  });
});

describe("timing metrics from word timestamps", () => {
  const transcript: RetellUtterance[] = [
    utt("agent", "Thanks for calling Open Water Marine how can I help", 1.0, 4.0),
    utt("user", "I need my boat fixed before Labor Day", 4.5, 7.0),
    // agent responds after 2.5s (slow) and caller barges in at 11.0 while agent talks till 13
    utt("agent", "Sure what is the best number to reach you on today", 9.5, 13.0),
    utt("user", "two one four zero four two five", 11.0, 13.5),
    utt("user", "okay", 14.0, 14.3),           // backchannel — must not count as interruption
    // 6s of dead air, then agent repeats itself
    utt("agent", "Sure what is the best number to reach you on today", 20.3, 23.0),
  ];
  const { metrics, events } = computeTiming({ transcript_object: transcript, duration_ms: 24000 });

  it("time to first word", () => expect(metrics.time_to_first_word_s).toBe(1));
  it("counts barge-in but not backchannel", () => {
    expect(metrics.interruptions).toBe(1);
    expect(metrics.user_turns).toBe(3);
  });
  it("response gap", () => {
    expect(metrics.max_response_gap_s).toBe(6.8); // 13.5 → 20.3
    expect(events.some((e) => e.kind === "slow_response")).toBe(true);
  });
  it("overtalk and dead air", () => {
    expect(metrics.overtalk_pct).toBeGreaterThan(0);
    expect(metrics.longest_silence_s).toBeCloseTo(6.8, 1);
    expect(events.some((e) => e.kind === "silence")).toBe(true);
  });
  it("detects repetition loops", () => expect(metrics.repetition_count).toBe(1));
  it("talk ratio is agent share", () => {
    expect(metrics.talk_ratio).toBeGreaterThan(0.4);
    expect(metrics.talk_ratio).toBeLessThan(0.7);
  });
  it("counts tool failures", () => {
    const t = computeTiming({
      transcript_object: [], transcript_with_tool_calls: [
        { role: "tool_call_invocation", name: "check_availability" },
        { role: "tool_call_result", content: "Error: calendar timeout" },
        { role: "tool_call_invocation", name: "book" },
        { role: "tool_call_result", content: "{\"ok\":true}" },
      ],
    });
    expect(t.metrics.tool_calls).toBe(2);
    expect(t.metrics.tool_failures).toBe(1);
  });
});

describe("concurrency", () => {
  it("sweeps overlapping calls; back-to-back does not overlap", () => {
    const r = maxConcurrency([
      { start_ts: "2026-09-01T10:00:00Z", end_ts: "2026-09-01T10:05:00Z" },
      { start_ts: "2026-09-01T10:02:00Z", end_ts: "2026-09-01T10:03:00Z" },
      { start_ts: "2026-09-01T10:02:30Z", end_ts: "2026-09-01T10:04:00Z" },
      { start_ts: "2026-09-01T10:05:00Z", end_ts: "2026-09-01T10:06:00Z" },
    ]);
    expect(r.max).toBe(3);
  });
});

describe("rule pre-classifier on the Open Water Marine sample", () => {
  const classify = (id: number) => preClassify(sampleCalls[id], null)?.outcome ?? "llm";
  it.each(expectedSilent)("call #%i is a silent hangup", (id) => expect(classify(id)).toBe("silent"));
  it.each(expectedSpam)("call #%i is spam", (id) => expect(classify(id)).toBe("spam"));
  it.each(expectedNoData)("call #%i has no data", (id) => expect(classify(id)).toBe("no_data"));
  it.each(expectedNeedsLLM)("call #%i is sent to the AI", (id) => expect(classify(id)).toBe("llm"));
});

describe("aggregate summary", () => {
  const base: Omit<AnalyticsCall, "call_id" | "start_ts" | "outcome"> = {
    end_ts: null, duration_ms: 60000, agent_id: "a", agent_name: "Allen", agent_version: 3,
    call_type: "phone_call", direction: "inbound", call_status: "ended", disconnection_reason: "user_hangup",
    user_sentiment: "Neutral", call_successful: true, in_voicemail: false, combined_cost_cents: 10,
    e2e_p50_ms: 900, e2e_p90_ms: 1400, from_number: "+1",
  };
  const calls: AnalyticsCall[] = [
    { ...base, call_id: "1", start_ts: "2026-09-01T23:00:00Z", outcome: "booked" },
    { ...base, call_id: "2", start_ts: "2026-09-02T00:30:00Z", outcome: "transfer_ok", disconnection_reason: "call_transfer" },
    { ...base, call_id: "3", start_ts: "2026-09-02T15:00:00Z", outcome: "transfer_fail", disconnection_reason: "transfer_cancelled", from_number: "+2" },
    { ...base, call_id: "4", start_ts: "2026-09-03T15:00:00Z", outcome: "silent", duration_ms: 4000, from_number: "+3" },
    { ...base, call_id: "5", start_ts: "2026-09-20T15:00:00Z", outcome: "spam", from_number: "+4" },
  ];
  const s = summarize(calls, { timezone: "America/Chicago", businessHours: { mon: [8.5, 17.5], tue: [8.5, 17.5], wed: [8.5, 17.5], thu: [8.5, 17.5], fri: [8.5, 17.5] } });

  it("excludes silent/spam from the customer denominator", () => {
    expect(s.customer_calls).toBe(3);
    expect(s.good_outcomes).toBe(2);
    expect(s.success_rate).toBeCloseTo(2 / 3);
  });
  it("transfers", () => {
    expect(s.transfer_attempts).toBe(2);
    expect(s.transfer_success_rate).toBe(0.5);
  });
  it("repeat callers within 7 days", () => expect(s.repeat_callers).toBe(1));
  it("buckets by workspace timezone", () => {
    expect(bucketKey("2026-09-02T00:30:00Z", "day", "America/Chicago")).toBe("2026-09-01");
    expect(s.by_hour[18] + s.by_hour[19]).toBe(2);
  });
  it("time series fills empty buckets with zero", () => {
    const ts = timeSeries(calls, METRICS[0], "count", "day", { from: "2026-09-01T12:00:00Z", to: "2026-09-04T12:00:00Z" }, "America/Chicago");
    expect(ts.x.length).toBe(4);
    expect(ts.series[0].data.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(4);
  });
});

describe("audio VAD", () => {
  it("finds speech bursts above the noise floor", () => {
    const db = [...Array(100).fill(-70), ...Array(50).fill(-20), ...Array(100).fill(-70)];
    const r = vad(db);
    expect(r.intervals.length).toBe(1);
    expect(r.intervals[0][0]).toBeCloseTo(2.0, 1);
  });
});
