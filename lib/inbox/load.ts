import "server-only";
import { isSignedIn, passwordConfigured } from "../auth/gate";
import { gateActive, getActiveWorkspace, listWorkspaces } from "../live/conn";
import { sampleInbox } from "./sample";
import { inboxAvailable, listInbox } from "./store";
import type { InboxEntry, InboxItem, InboxPayload } from "./types";

/** May this visitor see the inbox? (Signed in when the site keeps real data on the server.) */
export async function inboxAllowed() {
  return !gateActive() || (passwordConfigured() && (await isSignedIn()));
}

/** Where clicking an item goes. Real items go through /demo/inbox/open, which switches workspace first. */
export function hrefFor(it: InboxItem): string {
  if (it.sample) {
    if (it.kind === "digest" && it.runId) return `/demo/automation/runs/${it.runId}`;
    return `/demo/calls?call=${encodeURIComponent(it.callId ?? "")}${it.reasons.includes("low_quality") ? "&tab=quality" : ""}`;
  }
  return `/demo/inbox/open/${encodeURIComponent(it.id)}`;
}

/**
 * The account's inbox: items from every workspace (deleted workspaces are dropped), plus the sample
 * items while the sample workspace is open.
 */
export async function loadInbox(limit = 100): Promise<InboxPayload> {
  const [active, workspaces] = await Promise.all([getActiveWorkspace(), listWorkspaces()]);
  const known = new Map(workspaces.map((w) => [w.id, w.name]));
  const real = (await listInbox(limit)).filter((it) => known.has(it.ws)).map((it) => ({ ...it, wsName: known.get(it.ws) ?? it.wsName }));
  const sample = !active ? sampleInbox() : [];
  const items: InboxEntry[] = [...real, ...sample].slice(0, limit).map((it) => ({ ...it, href: hrefFor(it) }));
  return { items, unread: real.filter((it) => !it.read_at).length, live: inboxAvailable() };
}

