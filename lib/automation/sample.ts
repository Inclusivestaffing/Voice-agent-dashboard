import { demoCalls } from "../demo/openWater";
import { sampleHumanlike } from "../humanlike/sample";
import { isResult } from "../humanlike/schema";
import { computeStats, type DigestCall } from "./prompt";
import { DEFAULT_THRESHOLD, type CallRef, type DigestRun } from "./types";

export const SAMPLE_RUN_ID = "r_sample0001";

/** A finished weekly analysis for the Open Water Marine sample (last week of the sample calls). */
export function sampleRun(): DigestRun {
  const from = "2026-09-24T05:00:00.000Z", to = "2026-10-01T04:59:59.000Z";
  const hl = sampleHumanlike();
  const rows = demoCalls().filter((c) => (c.start_ts ?? "") >= from && (c.start_ts ?? "") <= to);
  const calls: DigestCall[] = rows.map((c) => ({
    sig: {
      call_id: c.call_id, start_ts: c.start_ts, duration_ms: c.duration_ms, call_status: c.call_status ?? null,
      disconnection_reason: c.disconnection_reason ?? null, user_sentiment: c.user_sentiment ?? null,
      call_successful: c.call_successful ?? null, in_voicemail: c.in_voicemail ?? null, outcome: c.outcome ?? null, call_summary: c.call_summary,
    },
    agent_name: c.agent_name, agent_version: c.agent_version, hl: hl.get(c.call_id) ?? null, transcript: null,
  }));
  const stats = computeStats(calls, DEFAULT_THRESHOLD, calls.filter((c) => (c.sig.duration_ms ?? 0) >= 10_000).length, "America/Chicago");
  const refs: Record<string, CallRef> = {};
  for (const c of calls) refs[c.sig.call_id] = { start_ts: c.sig.start_ts, score: isResult(c.hl) ? c.hl.score : null, summary: c.sig.call_summary?.slice(0, 200) ?? null };
  return {
    id: SAMPLE_RUN_ID, ws: "sample", wsName: "Open Water Marine", status: "done", trigger: "schedule", frequency: "weekly",
    period: { from, to }, started_at: "2026-09-30T23:08:12.000Z", finished_at: "2026-09-30T23:10:00.000Z",
    source: "claude", model: "claude-opus-5-5", usage: { input_tokens: 41_200, output_tokens: 6_150, cost_usd: 0.288 },
    stats, callRefs: refs, sample: true,
    narrative: {
      headline: "Allen handles routine questions well, but weekend callers with an urgent problem are left without a next step.",
      health: "watch",
      summary: "Allen answered every call this week and sent spam and robocalls away within seconds. The three transfers to the service desk all connected. The biggest gap is the weekend: a caller asking for urgent help on Saturday was told the shop was closed and nothing else. Allen also spelled out the website four times in one call instead of offering to text the link.",
      what_went_well: [
        "All three transfers to the service desk connected, and Allen told each caller who they'd be talking to.",
        "Spam, a do-not-call auto-message and a press-9 screening call were ended quickly without wasting minutes.",
        "Allen stayed calm and ended the call politely when a caller became abusive.",
      ],
      problems: [
        { title: "No next step for urgent weekend callers", detail: "When the shop is closed, Allen says so and stops. A caller with a boat problem gets no callback offer and no emergency number, so they're likely to call a competitor.", how_often: "1 call", severity: "high", example_call_ids: ["owm-43"] },
        { title: "Spells out long links instead of texting them", detail: "Allen read the website address letter by letter four times. The caller got frustrated and the call ran over three minutes.", how_often: "1 call", severity: "medium", example_call_ids: ["owm-45"] },
        { title: "Can't confirm existing appointments", detail: "Two callers asked about appointments they already had. Allen can't look them up, so it only took a message, and the callers didn't get an answer.", how_often: "2 calls", severity: "medium", example_call_ids: ["owm-41", "owm-46"] },
      ],
      improvements: [
        { title: "Offer a callback or emergency line when the shop is closed", why: "Fixes the weekend dead end seen in owm-43.", change_type: "prompt", exact_change: "Add under \"Business hours\": \"If the caller has an urgent problem while we're closed, say: 'We're closed right now, but I can have someone call you first thing when we open, or for an emergency on the water you can call [emergency number].' Then take their name and number.\"", expected_impact: "Urgent weekend callers leave with a plan instead of hanging up.", example_call_ids: ["owm-43"] },
        { title: "Text the website link instead of spelling it", why: "Spelling the address took four tries in owm-45.", change_type: "tool_or_integration", exact_change: "Add a send_sms tool in Retell and this line to the prompt: \"Never spell out a web address. Offer: 'Can I text you the link?' and send it with send_sms.\"", expected_impact: "Shorter calls and fewer frustrated callers asking for links.", example_call_ids: ["owm-45"] },
        { title: "Connect appointment lookup", why: "Callers with existing bookings couldn't get an answer (owm-41, owm-46).", change_type: "tool_or_integration", exact_change: "Connect the booking calendar's 'find appointment by phone number' to Retell as a tool, and tell Allen: \"When a caller asks about an existing appointment, look it up by their phone number and read back the date and time.\"", expected_impact: "Appointment questions get answered on the first call.", example_call_ids: ["owm-41", "owm-46"] },
        { title: "Tell callers when they'll hear back", why: "Messages are taken without a time, so callers don't know when to expect a call.", change_type: "prompt", exact_change: "After taking a message, add: \"Someone from the service team will call you back [today before 5 PM / tomorrow morning].\"", expected_impact: "Fewer repeat calls from people waiting on a callback.", example_call_ids: ["owm-41"] },
      ],
      calls_to_review: [
        { call_id: "owm-43", reason: "Urgent weekend question with no next step offered." },
        { call_id: "owm-45", reason: "Website spelled out four times." },
        { call_id: "owm-41", reason: "Existing appointment question Allen couldn't answer." },
      ],
    },
  };
}
