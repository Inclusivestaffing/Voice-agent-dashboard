/** Inbox items: urgent things about calls, finished Automation reports and system notices. Client-safe. */

export const INBOX_REASONS = ["low_quality", "transfer_fail", "negative", "error", "unsuccessful"] as const;
export type InboxReason = (typeof INBOX_REASONS)[number];

export const REASON_LABEL: Record<InboxReason, string> = {
  low_quality: "Low quality",
  transfer_fail: "Transfer failed",
  negative: "Upset caller",
  error: "Call error",
  unsuccessful: "Didn't reach its goal",
};

/** What each alert means, for the Automation settings. */
export const REASON_HELP: Record<InboxReason, string> = {
  low_quality: "The call's quality score (out of 100) is below your threshold.",
  transfer_fail: "The caller wanted a person but the transfer didn't connect.",
  negative: "Retell marked the caller's sentiment as negative.",
  error: "The call ended because of a technical error.",
  unsuccessful: "Retell's post-call analysis says the call didn't achieve its goal.",
};

export type InboxSeverity = "critical" | "high" | "medium" | "info";

export interface InboxItem {
  /** "c:<workspace>:<call>" for a call, "d:<workspace>:<run>" for an Automation report, "s:<workspace>:<time>" for a notice. */
  id: string;
  kind: "call" | "digest" | "system";
  ws: string;
  wsName: string;
  title: string;
  detail: string;
  /** The most useful fix for this call, when the analysis suggested one. */
  fix?: string;
  severity: InboxSeverity;
  reasons: InboxReason[];
  score?: number | null;
  callId?: string;
  runId?: string;
  /** When the call started (call items). */
  callAt?: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  sample?: boolean;
}

/** What the browser gets: the item plus where clicking it goes. */
export type InboxEntry = InboxItem & { href: string };

export interface InboxPayload {
  items: InboxEntry[];
  unread: number;
  /** False when the site has no server storage, so only sample items can show. */
  live: boolean;
}

export const SEVERITY_ORDER: Record<InboxSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
