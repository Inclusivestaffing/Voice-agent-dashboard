"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { gateActive, getActiveWorkspace } from "@/lib/live/conn";
import { isSignedIn } from "@/lib/auth/gate";
import { getAutomationSettings, saveAutomationSettings } from "@/lib/automation/settings";
import { lastScheduledAt, listRuns, runDigest } from "@/lib/automation/digest";
import { dueWorkspaces } from "@/lib/automation/dispatch";
import { INBOX_REASONS, type InboxReason } from "@/lib/inbox/types";

export type AutoState = { ok?: boolean; error?: string; message?: string } | null;

async function workspace() {
  if (gateActive() && !(await isSignedIn())) throw new Error("Sign in first.");
  const ws = await getActiveWorkspace();
  if (!ws) throw new Error("Create a workspace with a Retell key first (Settings).");
  return ws;
}

const fail = (e: unknown): AutoState => ({ error: e instanceof Error ? e.message : "Something went wrong." });

/** Which urgent things go to the inbox, and the quality threshold. */
export async function saveAlerts(_: AutoState, form: FormData): Promise<AutoState> {
  try {
    const ws = await workspace();
    const threshold = Number(form.get("threshold"));
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) return { error: "The quality threshold must be a number from 0 to 100." };
    const on = new Set(form.getAll("reason").map(String));
    const s = await getAutomationSettings(ws.id);
    s.alerts = { threshold: Math.round(threshold), reasons: Object.fromEntries(INBOX_REASONS.map((r) => [r, on.has(r)])) as Record<InboxReason, boolean> };
    await saveAutomationSettings(ws.id, s);
    revalidatePath("/demo/automation");
    return { ok: true, message: "Saved. New calls are checked with these settings." };
  } catch (e) { return fail(e); }
}

/** Turn the scheduled analysis on or off, and pick daily or weekly. */
export async function saveSchedule(_: AutoState, form: FormData): Promise<AutoState> {
  try {
    const ws = await workspace();
    const frequency = form.get("frequency") === "daily" ? "daily" : "weekly";
    const weekday = Number(form.get("weekday"));
    const s = await getAutomationSettings(ws.id);
    s.schedule = { enabled: form.get("enabled") === "on", frequency, weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : s.schedule.weekday };
    await saveAutomationSettings(ws.id, s);
    revalidatePath("/demo/automation");
    if (!s.schedule.enabled) return { ok: true, message: "Saved. Scheduled analysis is off." };
    // Switched on for the first time: the first report starts now instead of waiting for the next slot.
    const first = !(await lastScheduledAt(ws.id)) && (await dueWorkspaces([ws])).length > 0;
    if (first) after(() => runDigest(ws, { trigger: "schedule" }).then(() => undefined));
    return { ok: true, message: first ? "Saved. The first report is being made now (1–3 minutes) and will appear under Past runs." : "Saved. The analysis will run on schedule." };
  } catch (e) { return fail(e); }
}

/** Run the analysis now (in the background; it shows up in Past runs and the inbox when done). */
export async function runNow(_: AutoState, form: FormData): Promise<AutoState> {
  try {
    const ws = await workspace();
    const frequency = form.get("frequency") === "daily" ? "daily" : "weekly";
    if ((await listRuns(ws.id, 3)).some((r) => r.status === "running")) return { error: "An analysis is already running for this workspace." };
    after(() => runDigest(ws, { trigger: "manual", frequency }).then(() => undefined));
    return { ok: true, message: `Started the ${frequency === "daily" ? "last-24-hours" : "last-7-days"} analysis. It usually takes 1–3 minutes and will appear below and in your inbox.` };
  } catch (e) { return fail(e); }
}
