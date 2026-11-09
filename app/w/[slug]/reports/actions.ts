"use server";

import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db/queries";
import { supabaseAdmin } from "@/lib/db/supabase";
import { parseFilters } from "@/lib/filters";
import { buildSnapshot, writeNarrative } from "@/lib/reports/build";
import { ruleNarrative } from "@/lib/reports/snapshot";
import type { ReportNarrative } from "@/lib/ai/schemas";
import { canEdit, ROLE_LABEL, isRole } from "@/lib/roles";

export type ReportState = { error?: string } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AGENT_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The only place reports are created (Reports section). Admins and owners only. */
export async function generateReport(_: ReportState, form: FormData): Promise<ReportState> {
  const slug = String(form.get("slug") ?? "");
  const { db, ws, user, actualRole } = await getWorkspace(slug);
  if (!canEdit(actualRole)) return { error: "Only admins can generate reports." };

  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!DATE.test(from) || !DATE.test(to) || from > to) return { error: "Pick a valid start and end date." };
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 > 400) return { error: "Reports can cover at most 13 months." };
  const agent = String(form.get("agent") ?? "");
  if (agent && !AGENT_ID.test(agent)) return { error: "Unknown agent." };

  const sp = new URLSearchParams();
  sp.set("range", "custom"); sp.set("from", from); sp.set("to", to);
  if (agent) sp.set("agent", agent);
  const f = parseFilters(sp, ws.timezone);

  let reportId: string;
  try {
    const snapshot = await buildSnapshot(db, ws, f);
    if (snapshot.summary.total === 0) return { error: "No calls in that period, so there's nothing to report." };

    let narrative: ReportNarrative & { _unverified_numbers?: string[]; _source?: string };
    if (form.get("narrative") === "on") {
      try {
        const r = await writeNarrative(snapshot);
        narrative = { ...r.narrative, _unverified_numbers: r.unverified, _source: "claude-opus-5-5" };
      } catch (e) {
        console.error("AI narrative failed, using rule-based summary", e);
        narrative = { ...ruleNarrative(snapshot), _source: "rules (AI unavailable)" };
      }
    } else {
      narrative = { ...ruleNarrative(snapshot), _source: "rules" };
    }

    const title = (String(form.get("title") ?? "").trim() || `${ws.name} · ${from} to ${to}`).slice(0, 120);
    // reports has no insert policy for browsers; role was checked above, so write with the service role.
    const { data, error } = await supabaseAdmin().from("reports").insert({
      workspace_id: ws.id, title, period_start: f.from, period_end: f.to, filters: Object.fromEntries(sp),
      snapshot, narrative, created_by: user.id,
    }).select("id").single();
    if (error) throw error;
    reportId = data.id;
  } catch (e) {
    console.error("generateReport failed", e);
    return { error: "Couldn't generate the report. Please try again." };
  }
  redirect(`/w/${slug}/reports/${reportId}`);
}

/** Revoke the public share link by rotating its token. */
export async function rotateShareLink(slug: string, reportId: string) {
  const { ws, actualRole } = await getWorkspace(slug);
  if (!canEdit(actualRole)) throw new Error("Only admins can change share links.");
  const { randomBytes } = await import("node:crypto");
  await supabaseAdmin().from("reports").update({ share_token: randomBytes(18).toString("hex"), pdf_path: null })
    .eq("id", reportId).eq("workspace_id", ws.id);
}

/** Delete a report. */
export async function deleteReport(slug: string, reportId: string) {
  const { ws, actualRole } = await getWorkspace(slug);
  if (!canEdit(actualRole)) throw new Error("Only admins can delete reports.");
  await supabaseAdmin().from("reports").delete().eq("id", reportId).eq("workspace_id", ws.id);
  redirect(`/w/${slug}/reports`);
}
