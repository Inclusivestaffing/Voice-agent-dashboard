// Demo dataset: the 44 calls from the Open Water Marine September 2026 report.
// Used only by the dev-only /demo pages to preview the report template and charts
// without a database or Retell key.

import type { AnalyticsCall } from "../metrics/aggregate";
import type { Filters } from "../filters";
import type { CallDiagnosis } from "../ai/schemas";
import type { Outcome, RootCause, RetellUtterance } from "../types";
import { snapshotFromCalls, type ReportSnapshot } from "../reports/snapshot";

type Row = [number, string, string, string, string, string, number | null, string];
// [id, "MM/DD HH:MM" (Central), caller, phone, reason, outcome, duration s, sentiment]
const ROWS: Row[] = [
  [4, "08/27 18:36", "James Murray", "(701) 527-6181", "Emergency: stuck in water. Transfer started but caller dropped mid-flow", "transfer_fail", 90, "Neutral"],
  [5, "08/27 19:12", "Unknown caller", "(701) 561-0170", "Silent hangup", "silent", 4, "Neutral"],
  [7, "08/27 21:16", "Sean", "(701) 527-6181", "Emergency: stuck on sandbar", "transfer_ok", 24, "Negative"],
  [8, "08/27 21:17", "Sean", "(701) 527-6181", "Winterize and wrap quote", "lead_captured", 81, "Neutral"],
  [9, "08/27 21:40", "Sean", "(701) 214-0425", "Repair before Labor Day, weekend conflict", "lead_captured", 150, "Neutral"],
  [10, "08/27 22:22", "Shane", "(701) 527-6181", "Inflatable tube. Visiting store instead", "info", 194, "Positive"],
  [11, "08/28 00:28", "Unknown caller", "(701) 214-0425", "Emergency: jet ski dead on lake", "transfer_ok", 29, "Neutral"],
  [12, "08/28 00:29", "Alan Brown", "(701) 214-0425", "Selling winterized boat", "transfer_ok", 54, "Neutral"],
  [14, "09/01 02:44", "Unknown caller", "(701) 527-6181", "No data (missing summary)", "no_data", null, "Unknown"],
  [16, "09/01 18:35", "Todd Walker", "(701) 226-1140", "Hydrofoil for Mercury outboard", "lead_captured", 72, "Neutral"],
  [17, "09/03 10:01", "Kayla", "(701) 425-2422", "Emergency: boat sinking", "transfer_ok", 40, "Negative"],
  [18, "09/03 19:28", "Eric", "(701) 426-6096", "Winterization quote for 22ft pontoon", "lead_captured", 88, "Positive"],
  [19, "09/04 02:55", "Craig Hanson", "(701) 391-6596", "Jet ski, requested human directly", "transfer_ok", 122, "Neutral"],
  [20, "09/08 03:06", "Kodawinski", "(701) 321-1245", "1981 Rebel boat purchase", "lead_captured", 133, "Neutral"],
  [21, "09/08 18:44", "Delon Wise", "(701) 391-3681", "Pontoon pickup booked 9AM same day", "booked", 144, "Positive"],
  [22, "09/08 18:47", "Dave Podolski", "(701) 321-1245", "20hp outboard motor", "lead_captured", 81, "Neutral"],
  [23, "09/08 18:59", "Larry", "(701) 426-0878", "Power steering repair booked 9AM next day", "booked", 81, "Positive"],
  [24, "09/08 19:08", "Unknown caller", "(701) 426-0878", "Silent hangup", "silent", 4, "Neutral"],
  [25, "09/08 19:18", "Eric", "(701) 426-6096", "Winterization and wrap", "lead_captured", 52, "Positive"],
  [26, "09/14 11:59", "Unknown caller", "(701) 561-0170", "No data (missing summary)", "no_data", null, "Unknown"],
  [27, "09/14 12:01", "Unknown caller", "(701) 561-0170", "Silent hangup", "silent", 7, "Neutral"],
  [28, "09/14 12:02", "Unknown caller", "(701) 561-0170", "Silent hangup", "silent", 6, "Neutral"],
  [29, "09/14 17:37", "Norman Schafer", "(701) 527-6658", "Business hours question. Will call back", "info", 45, "Neutral"],
  [30, "09/14 18:51", "Tom Laird", "(701) 400-8781", "Battery pull for 2009 Sylvan Sun Chaser", "transfer_ok", 68, "Positive"],
  [31, "09/14 19:11", "Corey Hunt", "(701) 426-3939", "Service appointment for pontoon", "transfer_ok", 75, "Neutral"],
  [32, "09/15 01:23", "Grant Peterson", "(701) 833-3811", "Agent had no CRM lookup to answer status question", "transfer_fail", 85, "Neutral"],
  [34, "09/17 19:23", "Chad Corajan", "(701) 220-9756", "Past customer: pickup, winterize, storage", "transfer_ok", 68, "Positive"],
  [35, "09/19 00:45", "Mike Mislan", "(701) 202-4898", "Pontoon removal list", "transfer_ok", 61, "Positive"],
  [36, "09/21 19:19", "Albert Castillo", "(701) 426-4223", "Wrong-number mix-up", "info", 62, "Neutral"],
  [37, "09/21 19:32", "James Gordon", "(701) 590-6535", "Direct request for representative", "transfer_ok", 28, "Neutral"],
  [38, "09/22 06:18", "Unknown caller", "(213) 248-1489", "Silent hangup", "silent", 10, "Neutral"],
  [39, "09/22 06:18", "Unknown caller", "(213) 248-1489", "Silent hangup", "silent", 5, "Neutral"],
  [40, "09/24 19:20", "Aaron Shaw", "(701) 934-3618", "Service scheduling", "transfer_ok", 48, "Neutral"],
  [41, "09/25 19:03", "Brenna Schreiber", "(701) 260-5657", "Wrap cost question, has existing appt", "lead_captured", 68, "Neutral"],
  [42, "09/26 18:16", "Cherry Shower", "(701) 204-5087", "Location confirmation for Memorial Hwy", "transfer_ok", 64, "Neutral"],
  [43, "09/26 20:20", "Jimmy Bobby", "(701) 204-5087", "Weekend closed, no urgent contact", "info", 72, "Neutral"],
  [44, "09/26 20:32", "Unknown caller", "(701) 204-5087", "Abusive caller, repeated profanity", "abusive", 155, "Negative"],
  [45, "09/27 05:20", "Sandy", "(701) 319-1917", "Pontoon rental. Website spelled out", "info", 197, "Positive"],
  [46, "09/28 18:47", "Carrie Markworth", "(701) 400-4005", "Confirming existing appointment date", "lead_captured", 69, "Neutral"],
  [47, "09/28 22:02", "Unknown caller", "(806) 908-7961", "DNC auto-message", "spam", 13, "Negative"],
  [48, "09/29 02:08", "Unknown caller", "(806) 991-9983", "Silent hangup", "silent", 2, "Neutral"],
  [49, "09/29 19:24", "Blaine Turner", "(989) 681-4300", "Whisper Marine, asked for Sean", "transfer_ok", 51, "Neutral"],
  [50, "09/29 21:40", "Liz", "(913) 423-2877", "Press-9 call screening", "spam", 10, "Neutral"],
  [51, "09/30 02:10", "Rachel", "(701) 602-9239", "Outbound equipment financing solicitation", "spam", 29, "Neutral"],
];

const ROOT: Record<number, RootCause> = { 4: "caller_dropped", 32: "missing_integration", 9: "policy_conflict", 45: "flow_loop", 22: "asr_mishear", 19: "prompt_gap", 20: "asr_mishear", 43: "knowledge_gap" };
const FAILS: Record<number, string> = {
  4: "The caller dropped while the emergency transfer was still connecting.",
  32: "The agent couldn't check whether the boat had been picked up because it has no access to customer records.",
  9: "The caller could only drop off on weekends and the agent had no fallback beyond a callback.",
  45: "The agent spelled the website out four times; texting the link would have ended this quickly.",
  22: "The agent misheard the phone number twice before getting it right.",
  19: "The agent kept pushing a drop-off booking after a long-time customer asked for a person who knows him.",
  20: "The agent struggled with the caller's name and boat model before getting to the point.",
  43: "The caller needed someone urgently on a weekend and the agent had no on-call contact to offer.",
};
const FIXES: Partial<Record<RootCause, string>> = {
  caller_dropped: "Keep emergency transfers to one short sentence and transfer immediately, before asking for a name.",
  missing_integration: "Connect the CRM so the agent can look up existing customers, pickups and job status.",
  policy_conflict: "Give the agent a weekend fallback, such as an after-hours key drop-box, for customers who can't come on weekdays.",
  flow_loop: "Text the booking link instead of spelling the website out loud.",
  asr_mishear: "Read phone numbers back in groups (area code, three digits, four digits) and boost name recognition with keywords.",
  prompt_gap: "If a returning customer asks for a person, transfer right away instead of offering a booking.",
  knowledge_gap: "Add an on-call or after-hours contact policy to the agent's knowledge so urgent weekend callers have an option.",
  spam_or_abuse: "End robocalls and abusive calls quickly; consider blocking repeat spam numbers.",
};
const SEVERITY: Record<number, CallDiagnosis["severity"]> = { 4: "critical", 32: "high", 9: "high", 19: "medium", 45: "medium", 22: "low", 20: "low", 43: "medium" };

function iso(mmdd: string) {
  const [d, t] = mmdd.split(" ");
  const [mm, dd] = d.split("/");
  return new Date(`2026-${mm}-${dd}T${t}:00-05:00`).toISOString();
}

function intentCategory(reason: string, outcome: string) {
  if (outcome === "spam" || outcome === "abusive") return "spam";
  if (/emergenc/i.test(reason)) return "emergency";
  if (/booked|repair|service|power steering|pickup|removal|winteriz/i.test(reason)) return "repair or service";
  if (/quote|cost|pric/i.test(reason)) return "pricing";
  if (/rental/i.test(reason)) return "rental";
  if (/purchase|motor|hydrofoil|tube|selling/i.test(reason)) return "sales";
  if (/appointment|appt/i.test(reason)) return "existing appointment";
  if (/silent|no data/i.test(reason)) return "other";
  return "general question";
}

function score(id: number, outcome: string): number | null {
  if (["silent", "spam", "no_data"].includes(outcome)) return null;
  if (SEVERITY[id] === "critical") return 38;
  if (SEVERITY[id] === "high") return 52;
  return 62 + ((id * 17) % 36);
}

function diagnosis(row: Row): CallDiagnosis {
  const [id, , caller, phone, reason, outcome] = row;
  const good = ["booked", "transfer_ok", "lead_captured", "info"].includes(outcome);
  const rc: RootCause = ROOT[id] ?? (outcome === "silent" ? "caller_dropped" : outcome === "spam" || outcome === "abusive" ? "spam_or_abuse" : "none");
  const sc = score(id, outcome);
  const s5 = sc == null ? 3 : Math.max(1, Math.min(5, Math.round(sc / 20)));
  const worked = good ? [{ point: outcome === "booked" ? "Confirmed the date, time and details and sent a confirmation." : outcome === "transfer_ok" ? "Recognised the request quickly and connected the caller to the team." : outcome === "lead_captured" ? "Collected the caller's need and a callback number for the team." : "Answered the caller's question clearly.", turn: 4, at_s: 18 }] : [];
  const failed = FAILS[id] ? [{ point: FAILS[id], turn: 5, at_s: 30 }] : outcome === "silent" ? [{ point: "The caller hung up before saying anything.", turn: -1, at_s: -1 }] : [];
  return {
    outcome: outcome as Outcome,
    caller_intent: reason,
    intent_category: intentCategory(reason, outcome),
    success: good && !FAILS[id],
    success_reason: good ? (FAILS[id] ? "The caller was helped, but with friction." : "The caller got what they needed.") : outcome === "silent" ? "The caller never engaged." : outcome === "spam" ? "Not a customer call." : "The caller's need wasn't met on this call.",
    plain_english_summary: `${caller === "Unknown caller" ? "A caller" : caller} called about: ${reason.toLowerCase()}.${FAILS[id] ? ` ${FAILS[id]}` : good ? " The call ended with a good result." : ""}`,
    what_worked: worked,
    what_failed: failed,
    root_causes: [rc],
    primary_root_cause: rc,
    severity: SEVERITY[id] ?? (rc === "none" || outcome === "spam" ? "none" : "low"),
    recommended_fix: FIXES[rc] ?? "None needed.",
    prompt_change_suggestion: rc === "prompt_gap" ? "If a returning customer asks to speak with a person, say \"Of course, connecting you now\" and transfer immediately." : rc === "asr_mishear" ? "When confirming phone numbers, read them back in groups: area code, then three digits, then four." : "",
    scorecard: { intent_understanding: Math.min(5, s5 + 1), information_accuracy: s5, flow_efficiency: Math.max(1, s5 - (rc === "flow_loop" ? 2 : 0)), tone_and_empathy: Math.min(5, s5 + 1), task_completion: good ? s5 : Math.max(1, s5 - 1), instruction_compliance: s5 },
    captured: { caller_name: caller === "Unknown caller" ? "" : caller, callback_number: outcome === "silent" || outcome === "spam" ? "" : phone, appointment: outcome === "booked" ? reason : "", other_details: "" },
    followup_required: outcome === "lead_captured" || outcome === "transfer_fail",
    followup_note: outcome === "lead_captured" ? `Call ${caller === "Unknown caller" ? "the caller" : caller} back about: ${reason.toLowerCase()}.` : outcome === "transfer_fail" ? "Call back right away; the transfer didn't connect." : "",
  };
}

export const DEMO_TZ = "America/Chicago";
export const DEMO_BH: Record<string, [number, number]> = { mon: [8.5, 17.5], tue: [8.5, 17.5], wed: [8.5, 17.5], thu: [8.5, 17.5], fri: [8.5, 17.5] };
export { DEMO_RANGE } from "./range";

export type DemoCall = AnalyticsCall & { analysis: Record<string, unknown> | null; call_summary: string | null };

export function demoCalls(): DemoCall[] {
  return ROWS.map((row) => {
    const [id, time, , phone, reason, outcome, dur, sent] = row;
    const start = iso(time);
    const disc = dur == null ? "error_unknown" : outcome === "transfer_ok" ? "call_transfer" : outcome === "transfer_fail" ? "transfer_cancelled" : outcome === "lead_captured" || outcome === "booked" ? "agent_hangup" : "user_hangup";
    const d = outcome === "no_data" ? null : diagnosis(row);
    return {
      call_id: `owm-${id}`, start_ts: start, end_ts: dur ? new Date(Date.parse(start) + dur * 1000).toISOString() : start,
      duration_ms: dur == null ? null : dur * 1000, agent_id: "allen", agent_name: "Allen", agent_version: id < 30 ? 4 : 5,
      call_type: "phone_call", direction: "inbound", call_status: dur == null ? "error" : "ended", disconnection_reason: disc,
      user_sentiment: sent, call_successful: dur == null ? null : ["booked", "transfer_ok", "lead_captured", "info"].includes(outcome), in_voicemail: false,
      combined_cost_cents: dur == null ? null : Math.round(dur * 0.13 * 10) / 10, e2e_p50_ms: dur == null ? null : 820 + ((id * 37) % 500), e2e_p90_ms: dur == null ? null : 1300 + ((id * 53) % 900),
      from_number: phone, to_number: "(701) 425-5855", batch_call_id: null, transfer_destination: outcome === "transfer_ok" ? "+17014255855" : null,
      custom_analysis: dur == null ? null : { call_reason: intentCategory(reason, outcome), issue_resolved: ["booked", "transfer_ok", "info"].includes(outcome) },
      metadata: { source: "main line" }, dynamic_variables: { business: "Open Water Marine" },
      outcome: (d ? outcome : "no_data") as Outcome, primary_root_cause: d?.primary_root_cause ?? "none", root_causes: d?.root_causes ?? ["none"],
      overall_score: d ? score(id, outcome) : null, severity: d?.severity ?? "none",
      m: dur == null ? null : { interruptions: id % 4 === 0 ? 2 : id % 3 === 0 ? 1 : 0, agent_interruptions: id % 5 === 0 ? 1 : 0, dead_air_pct: 0.08 + (id % 5) / 50, overtalk_pct: (id % 4) / 100, time_to_first_word_s: 0.9 + (id % 3) / 5, avg_response_gap_s: 0.9 + (id % 6) / 10, longest_silence_s: 2 + (id % 4), talk_ratio: 0.55 + (id % 3) / 20, repetition_count: id === 45 || id === 22 ? 2 : 0, tool_calls: outcome === "booked" ? 2 : 0, tool_failures: 0, longest_agent_monologue_s: 8 + (id % 9) },
      analysis: d as unknown as Record<string, unknown> | null,
      call_summary: d?.plain_english_summary ?? null,
    };
  });
}

// ── Transcripts with word timings ──
type Line = ["agent" | "user", string, number, number];
const CALL9: Line[] = [
  ["agent", "Thanks for calling Open Water Marine, this is Allen. How can I help you today?", 0.8, 4.6],
  ["user", "I am looking to get my boat fixed.", 5.4, 7.2],
  ["agent", "Oh no, let's get that sorted for you. First, may I ask who I'm speaking with?", 8.1, 11.9],
  ["user", "Sean", 12.6, 13.0],
  ["agent", "Thanks, Sean. Could you tell me briefly what's going on with your boat?", 13.8, 17.0],
  ["user", "It just doesn't run right, and I just need it fixed before Labor Day.", 17.6, 21.4],
  ["agent", "Let's get your boat dropped off with the team. What's the best number to reach you on?", 23.9, 28.0],
  ["user", "Two one four zero four five.", 28.6, 31.0],
  ["agent", "Just to make sure I have it right, is your number 2 1 4 0 4 5?", 31.9, 35.6],
  ["user", "Two five at the end. Not just five.", 34.9, 37.2],
  ["agent", "So your number is 2 1 4 0 4 5 2 5, is that right?", 38.0, 41.8],
  ["user", "No. Zero four two five.", 42.5, 44.0],
  ["agent", "So your number is 2 1 4 0 4 2 5, is that correct?", 44.8, 48.4],
  ["user", "Correct.", 49.0, 49.5],
  ["agent", "We do drop-offs every day at 9 AM. What day works best for you?", 50.3, 53.6],
  ["user", "Saturday.", 54.2, 54.8],
  ["agent", "It looks like 9 AM is booked this Saturday, but I have Friday the 28th or Monday the 31st open. Would either of those work?", 57.9, 64.6],
  ["user", "No. I can only drop my boat off on Saturday or Sunday.", 65.3, 68.4],
  ["agent", "We're actually closed on Saturdays and Sundays, so drop-offs are only Monday through Friday at 9 AM. Could you swing by on a weekday morning?", 69.2, 76.8],
  ["user", "No. I work out of town. Can I just drop it off over the weekend?", 75.9, 80.1],
  ["agent", "I can have the team reach out to see if there's any way to work something out. Would you like someone to call you?", 80.9, 86.6],
  ["user", "Yes.", 87.2, 87.5],
  ["user", "Thank you. Bye.", 88.4, 89.3],
];

function synthLines(row: Row): Line[] {
  const [, , caller, , reason, outcome, dur] = row;
  if (dur == null) return [];
  const greet: Line = ["agent", "Thanks for calling Open Water Marine, this is Allen. How can I help you today?", 0.9, 4.7];
  if (outcome === "silent") return [greet];
  const name = caller === "Unknown caller" ? "" : caller.split(" ")[0];
  const closing: Record<string, string> = {
    transfer_ok: "Let me get you over to the team right now. One moment.",
    transfer_fail: "I'll transfer you to the team so you can talk to someone directly.",
    booked: "Perfect, you're all set. You'll get a confirmation text in just a minute.",
    lead_captured: "Thanks, I've got everything I need. Our team will reach out to you shortly.",
    info: "Happy to help with that. Is there anything else I can do for you today?",
    spam: "Thanks for calling.",
    abusive: "I'm here to keep things respectful. If you have questions about boats or repairs, I'm happy to help.",
  };
  const lines: Line[] = [greet, ["user", `Hi${name ? `, this is ${name}` : ""}. ${reason}.`, 5.6, 10.5]];
  if (outcome !== "spam") lines.push(["agent", "I'd be happy to help. Could I get the best number to reach you on?", 11.4, 14.8], ["user", "Sure, it's the number I'm calling from.", 15.5, 17.6]);
  lines.push(["agent", closing[outcome] ?? "Thanks for calling.", Math.min(dur - 4, 18.5), Math.min(dur - 0.5, 23)]);
  return lines.filter((l) => l[2] < l[3]);
}

export function demoTranscript(callId: string): RetellUtterance[] {
  const id = Number(callId.replace("owm-", ""));
  const row = ROWS.find((r) => r[0] === id);
  if (!row) return [];
  const lines = id === 9 ? CALL9 : synthLines(row);
  return lines.map(([role, content, start, end]) => {
    const ws = content.split(" ");
    const step = (end - start) / ws.length;
    return { role, content, words: ws.map((w, i) => ({ word: w, start: start + i * step, end: start + (i + 1) * step })) };
  });
}

export function demoTranscriptText(callId: string): string {
  return demoTranscript(callId).map((u) => `${u.role === "agent" ? "Agent" : "User"}: ${u.content}`).join("\n");
}

export const DEMO_WORKSPACE = { name: "Open Water Marine", logo_url: "/inclusive-logo.png", brand_primary: "#facc15", agent_name: "Allen", timezone: DEMO_TZ };

/** In-memory version of the database filters, for the demo. */
export function filterDemo(calls: DemoCall[], f: Filters): DemoCall[] {
  return calls.filter((c) => {
    if (!c.start_ts || c.start_ts < f.from || c.start_ts > f.to) return false;
    if (f.agent.length && !f.agent.includes(c.agent_id ?? "")) return false;
    if (f.version.length && !f.version.includes(`${c.agent_id}:${c.agent_version}`)) return false;
    if (f.callType.length && !f.callType.includes(c.call_type ?? "")) return false;
    if (f.direction.length && !f.direction.includes(c.direction ?? "")) return false;
    if (f.status.length && !f.status.includes(c.call_status ?? "")) return false;
    if (f.outcome.length && !f.outcome.includes(c.outcome ?? "")) return false;
    if (f.sentiment.length && !f.sentiment.includes(c.user_sentiment ?? "")) return false;
    if (f.rootCause.length && !f.rootCause.includes(c.primary_root_cause ?? "")) return false;
    if (f.disconnection.length && !f.disconnection.includes(c.disconnection_reason ?? "")) return false;
    if (f.success && String(c.call_successful) !== f.success) return false;
    const dur = (c.duration_ms ?? 0) / 1000;
    if (f.minDur !== undefined && dur < f.minDur) return false;
    if (f.maxDur !== undefined && dur > f.maxDur) return false;
    const cost = (c.combined_cost_cents ?? 0) / 100;
    if (f.minCost !== undefined && cost < f.minCost) return false;
    if (f.maxCost !== undefined && cost > f.maxCost) return false;
    if (f.minLatency !== undefined && (c.e2e_p50_ms ?? 0) < f.minLatency) return false;
    if (f.maxLatency !== undefined && (c.e2e_p50_ms ?? Infinity) > f.maxLatency) return false;
    if (f.minScore !== undefined && (c.overall_score ?? -1) < f.minScore) return false;
    if (f.maxScore !== undefined && (c.overall_score ?? 101) > f.maxScore) return false;
    const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
    if (f.fromNumber && !digits(c.from_number).includes(digits(f.fromNumber))) return false;
    if (f.toNumber && !digits(c.to_number).includes(digits(f.toNumber))) return false;
    if (f.callId && c.call_id !== f.callId) return false;
    if (f.transferTo && !(c.transfer_destination ?? "").includes(f.transferTo)) return false;
    if (f.batchCallId && c.batch_call_id !== f.batchCallId) return false;
    if (f.q && !(demoTranscriptText(c.call_id) || c.call_summary || "").toLowerCase().includes(f.q.toLowerCase())) return false;
    for (const [k, v] of Object.entries(f.custom)) if (String(c.custom_analysis?.[k] ?? "") !== v) return false;
    for (const [k, v] of Object.entries(f.metadata)) if (String(c.metadata?.[k] ?? "") !== v) return false;
    for (const [k, v] of Object.entries(f.dynVars)) if (String(c.dynamic_variables?.[k] ?? "") !== v) return false;
    return true;
  });
}

export function demoFilterOptions() {
  return {
    agents: [{ id: "allen", name: "Allen" }],
    versions: [{ id: "allen:4", name: "Allen v4" }, { id: "allen:5", name: "Allen v5" }],
    disconnections: ["agent_hangup", "call_transfer", "error_unknown", "transfer_cancelled", "user_hangup"],
    customFields: [
      { key: "call_reason", values: ["emergency", "existing appointment", "general question", "pricing", "rental", "repair or service", "sales", "spam"] },
      { key: "issue_resolved", values: ["false", "true"] },
    ],
    metadataFields: [{ key: "source", values: ["main line"] }],
    dynamicFields: [{ key: "business", values: ["Open Water Marine"] }],
  };
}

/** Build a report snapshot from the demo data for any period inside the sample window. */
export function demoSnapshot(f: Filters): ReportSnapshot {
  const all = demoCalls();
  const calls = filterDemo(all, f);
  const transcripts = new Map(calls.map((c) => [c.call_id, demoTranscriptText(c.call_id)]));
  return snapshotFromCalls({ calls, prev: [], transcripts, workspace: DEMO_WORKSPACE, businessHours: DEMO_BH, period: { from: f.from, to: f.to } });
}
