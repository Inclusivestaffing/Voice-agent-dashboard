// Shapes of Retell API objects we rely on (subset of the documented Call object),
// plus our own row types. Kept explicit so the metrics engine is testable without the SDK.

export interface RetellWord { word: string; start: number; end: number }

export interface RetellUtterance {
  role: "agent" | "user" | "transfer_target";
  content: string;
  words?: RetellWord[];
  metadata?: { response_id?: number; interrupt_id?: number; is_backchannel?: boolean };
}

export interface RetellToolEvent {
  role: string;                 // 'agent' | 'user' | 'tool_call_invocation' | 'tool_call_result' | 'node_transition' | ...
  content?: string;
  name?: string;
  tool_call_id?: string;
  arguments?: string;
  successful?: boolean;
  [k: string]: unknown;
}

export interface RetellLatency {
  p50?: number; p90?: number; p95?: number; p99?: number;
  max?: number; min?: number; num?: number; values?: number[];
}

export interface RetellCall {
  call_id: string;
  call_type?: "web_call" | "phone_call";
  agent_id?: string;
  agent_name?: string;
  agent_version?: number;
  call_status?: "registered" | "not_connected" | "ongoing" | "ended" | "error";
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: RetellUtterance[];
  transcript_with_tool_calls?: RetellToolEvent[];
  recording_url?: string;
  recording_multi_channel_url?: string;
  public_log_url?: string;
  disconnection_reason?: string;
  transfer_destination?: string | null;
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
  collected_dynamic_variables?: Record<string, string>;
  latency?: Partial<Record<"e2e" | "asr" | "llm" | "llm_websocket_network_rtt" | "tts" | "knowledge_base" | "s2s", RetellLatency>>;
  call_analysis?: {
    call_summary?: string;
    in_voicemail?: boolean;
    user_sentiment?: "Negative" | "Positive" | "Neutral" | "Unknown";
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
  call_cost?: {
    product_costs?: { product: string; unit_price: number; cost: number; is_transfer_leg_cost?: boolean }[];
    total_duration_seconds?: number;
    total_duration_unit_price?: number;
    combined_cost?: number;
  };
  llm_token_usage?: { values?: number[]; average?: number; num_requests?: number };
}

/** Row in public.calls (snake_case, as returned by Supabase). */
export interface CallRow {
  workspace_id: string;
  call_id: string;
  agent_id: string | null;
  agent_name: string | null;
  agent_version: number | null;
  call_type: string | null;
  direction: string | null;
  call_status: string | null;
  from_number: string | null;
  to_number: string | null;
  start_ts: string | null;
  end_ts: string | null;
  duration_ms: number | null;
  disconnection_reason: string | null;
  transfer_destination: string | null;
  user_sentiment: string | null;
  call_successful: boolean | null;
  in_voicemail: boolean | null;
  call_summary: string | null;
  custom_analysis: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  combined_cost_cents: number | null;
  e2e_p50_ms: number | null;
  e2e_p90_ms: number | null;
  llm_p50_ms: number | null;
  tts_p50_ms: number | null;
  asr_p50_ms: number | null;
  recording_url: string | null;
  recording_multi_channel_url: string | null;
  public_log_url: string | null;
  has_details: boolean;
  raw: RetellCall;
}

export const OUTCOMES = [
  "booked", "transfer_ok", "transfer_fail", "lead_captured", "info",
  "silent", "spam", "abusive", "voicemail", "no_data",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  booked: "Booked",
  transfer_ok: "Connected to team",
  transfer_fail: "Transfer failed",
  lead_captured: "Lead captured",
  info: "Info given",
  silent: "Silent hangup",
  spam: "Spam / robocall",
  abusive: "Abusive",
  voicemail: "Voicemail",
  no_data: "No data",
};

/** Outcomes that count as a good result for the business. */
export const GOOD_OUTCOMES: Outcome[] = ["booked", "transfer_ok", "lead_captured", "info"];
/** Outcomes excluded from the "real customer calls" denominator. */
export const NON_CUSTOMER_OUTCOMES: Outcome[] = ["silent", "spam", "voicemail", "no_data"];

export const ROOT_CAUSES = [
  "latency",
  "asr_mishear",
  "prompt_gap",
  "missing_integration",
  "knowledge_gap",
  "flow_loop",
  "interruption_handling",
  "transfer_failure",
  "caller_dropped",
  "policy_conflict",
  "spam_or_abuse",
  "audio_quality",
  "none",
] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  latency: "Slow responses",
  asr_mishear: "Speech misheard",
  prompt_gap: "Prompt / instruction gap",
  missing_integration: "Missing integration (CRM, calendar…)",
  knowledge_gap: "Missing knowledge",
  flow_loop: "Repetition / loop",
  interruption_handling: "Interruption handling",
  transfer_failure: "Transfer failed",
  caller_dropped: "Caller dropped early",
  policy_conflict: "Business-policy conflict",
  spam_or_abuse: "Spam or abuse",
  audio_quality: "Audio quality",
  none: "No issue",
};
