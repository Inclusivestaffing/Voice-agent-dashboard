// Fixed entity → color-token mapping (color follows the entity, never its rank).
export const OUTCOME_COLOR: Record<string, string> = {
  booked: "--s1",
  transfer_ok: "--s3",
  lead_captured: "--s7",
  info: "--s4",
  transfer_fail: "--status-critical",
  abusive: "--s5",
  silent: "--neutral-1",
  spam: "--neutral-2",
  voicemail: "--neutral-2",
  no_data: "--neutral-2",
  unanalyzed: "--neutral-2",
};

export const SENTIMENT_COLOR: Record<string, string> = {
  Positive: "--status-good",
  Neutral: "--neutral-1",
  Negative: "--status-critical",
  Unknown: "--neutral-2",
};

export const OUTCOME_ORDER = ["booked", "transfer_ok", "lead_captured", "info", "transfer_fail", "abusive", "silent", "spam", "voicemail", "no_data", "unanalyzed"];
