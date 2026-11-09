"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/db/supabase";
import { encrypt } from "@/lib/crypto";
import { validateRetellKey } from "@/lib/retell/client";
import { syncCalls } from "@/lib/retell/sync";
import { processCall, processPending } from "@/lib/pipeline/processCall";
import { submitAnalysisBatch } from "@/lib/pipeline/batch";
import { appOrigin } from "@/lib/origin";
import { assertPublicHttpsUrl, isValidTimezone, HEX_COLOR, UUID, CALL_ID } from "@/lib/security";
import { METRICS, DIMENSIONS } from "@/lib/metrics/aggregate";
import { ALERT_METRICS } from "@/lib/alerts";
import { SAFE_KEY } from "@/lib/filters";

import { RANK, ROLES, ROLE_LABEL, type Role } from "@/lib/roles";

/** Every action re-checks membership server-side; never trust the client for workspace or role. */
async function assertRole(workspaceId: string, min: Role) {
  if (!UUID.test(workspaceId)) throw new Error("Unknown workspace.");
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data } = await db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!data || RANK[data.role as Role] < RANK[min]) throw new Error("You don't have permission to do that in this workspace.");
  return { user, role: data.role as Role };
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
}

const str = (form: FormData, k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
const RETELL_KEY = /^[A-Za-z0-9_\-]{16,200}$/;

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export async function createWorkspace(_: ActionState, form: FormData): Promise<ActionState> {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const name = str(form, "name", 80);
  const apiKey = str(form, "retell_key", 200);
  const timezone = str(form, "timezone", 64) || "America/Chicago";
  const days = [7, 30, 90, 365].includes(Number(form.get("backfill_days"))) ? Number(form.get("backfill_days")) : 30;
  if (!name) return { error: "Give the workspace a name (usually the client's business name)." };
  if (!isValidTimezone(timezone)) return { error: "Unknown timezone." };
  if (apiKey && !RETELL_KEY.test(apiKey)) return { error: "That doesn't look like a Retell API key." };

  if (apiKey) {
    const check = await validateRetellKey(apiKey);
    if (!check.ok) return { error: "Retell rejected that API key. Check it in Retell → Settings → API Keys." };
  }

  const admin = supabaseAdmin();
  let slug = slugify(name);
  for (let i = 2; i < 100; i++) {
    const { data: clash } = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${slugify(name).slice(0, 36)}-${i}`;
  }

  const { data: ws, error } = await admin.from("workspaces")
    .insert({ name, slug, timezone, created_by: user.id, agent_display_name: str(form, "agent_name", 40) || null })
    .select("id, slug").single();
  if (error || !ws) return { error: "Could not create the workspace." };
  await admin.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });

  if (apiKey) {
    await admin.from("retell_connections").insert({ workspace_id: ws.id, api_key_encrypted: encrypt(apiKey), api_key_last4: apiKey.slice(-4) });
    after(async () => {
      await syncCalls(ws.id, { fromMs: Date.now() - days * 86400_000, kind: "backfill" });
      await processPending(ws.id, { limit: 40 });
    });
  }
  redirect(`/w/${ws.slug}/overview?welcome=1`);
}

export async function connectRetell(_: ActionState, form: FormData): Promise<ActionState> {
  const workspaceId = str(form, "workspace_id", 40);
  await assertRole(workspaceId, "admin");
  const apiKey = str(form, "retell_key", 200);
  if (!RETELL_KEY.test(apiKey)) return { error: "That doesn't look like a Retell API key." };
  const check = await validateRetellKey(apiKey);
  if (!check.ok) return { error: "Retell rejected that API key. Check it in Retell → Settings → API Keys." };
  await supabaseAdmin().from("retell_connections").upsert({
    workspace_id: workspaceId, api_key_encrypted: encrypt(apiKey), api_key_last4: apiKey.slice(-4), last_sync_error: null,
  });
  after(async () => {
    await syncCalls(workspaceId, { fromMs: Date.now() - 30 * 86400_000, kind: "backfill" });
    await processPending(workspaceId, { limit: 40 });
  });
  revalidatePath("/w", "layout");
  return { ok: true, message: `Connected. Found ${check.agents} agent(s). Importing the last 30 days of calls in the background.` };
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Check the file's real signature, not just the browser-supplied MIME type. */
async function sniffImage(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function updateSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const workspaceId = str(form, "workspace_id", 40);
  await assertRole(workspaceId, "admin");
  const admin = supabaseAdmin();
  const name = str(form, "name", 80);
  const timezone = str(form, "timezone", 64);
  const brand = str(form, "brand_primary", 7) || "#facc15";
  const success = str(form, "success_definition", 1000);
  if (!name) return { error: "Name is required." };
  if (!isValidTimezone(timezone)) return { error: "Unknown timezone." };
  if (!HEX_COLOR.test(brand)) return { error: "Accent color must be a hex color like #facc15." };
  if (success.length < 10) return { error: "Describe what a successful call means (at least a sentence)." };

  const bh: Record<string, [number, number]> = {};
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    if (form.get(`bh_${d}_open`) !== "on") continue;
    const s = str(form, `bh_${d}_start`, 5), e = str(form, `bh_${d}_end`, 5);
    if (!HHMM.test(s) || !HHMM.test(e)) return { error: `Invalid business hours for ${d}.` };
    const [sh, sm] = s.split(":").map(Number), [eh, em] = e.split(":").map(Number);
    if (eh + em / 60 <= sh + sm / 60) return { error: `Closing time must be after opening time (${d}).` };
    bh[d] = [sh + sm / 60, eh + em / 60];
  }

  let logo_url: string | undefined;
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2_000_000) return { error: "Logo must be under 2 MB." };
    const type = await sniffImage(logo);
    if (!type || !LOGO_TYPES[type]) return { error: "Logo must be a PNG, JPEG or WebP image." };
    const path = `${workspaceId}/${crypto.randomUUID()}.${LOGO_TYPES[type]}`;
    const { error } = await admin.storage.from("logos").upload(path, logo, { contentType: type, upsert: false });
    if (error) return { error: "Logo upload failed." };
    logo_url = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await admin.from("workspaces").update({
    name, timezone, brand_primary: brand, success_definition: success,
    agent_display_name: str(form, "agent_display_name", 40) || null,
    business_hours: bh,
    ...(logo_url ? { logo_url } : {}),
  }).eq("id", workspaceId);
  if (error) return { error: "Couldn't save settings." };
  revalidatePath("/w", "layout");
  return { ok: true, message: "Settings saved." };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function inviteMember(_: ActionState, form: FormData): Promise<ActionState> {
  const workspaceId = str(form, "workspace_id", 40);
  const { user: inviter, role: inviterRole } = await assertRole(workspaceId, "admin");
  const email = str(form, "email", 254).toLowerCase();
  const role = str(form, "role", 10) as Role;
  if (!EMAIL.test(email)) return { error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { error: "Unknown role." };
  // Admins can't create owners (no privilege escalation through invites).
  if (role === "owner" && inviterRole !== "owner") return { error: "Only owners can invite another owner." };
  const admin = supabaseAdmin();
  const { error } = await admin.from("workspace_invites").upsert({ workspace_id: workspaceId, email, role, invited_by: inviter.id, accepted_at: null }, { onConflict: "workspace_id,email" });
  if (error) return { error: "Couldn't create the invite." };
  // Sends a Supabase invite email; existing users just get access next time they sign in.
  await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${await appOrigin()}/auth/callback?next=/workspaces` }).catch(() => null);
  revalidatePath("/w", "layout");
  return { ok: true, message: `Invited ${email} as ${ROLE_LABEL[role]}. They get access once they sign in with a verified email.` };
}

export async function removeMember(workspaceId: string, userId: string) {
  await assertRole(workspaceId, "owner");
  if (!UUID.test(userId)) throw new Error("Unknown member.");
  await supabaseAdmin().from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId).neq("role", "owner");
  revalidatePath("/w", "layout");
}

export async function syncNow(workspaceId: string, days: number) {
  await assertRole(workspaceId, "admin");
  const d = Math.min(365, Math.max(1, Math.floor(Number(days)) || 2));
  after(async () => {
    await syncCalls(workspaceId, { fromMs: Date.now() - d * 86400_000, kind: d > 3 ? "backfill" : "incremental" });
    await processPending(workspaceId, { limit: 40 });
  });
  return { ok: true, message: `Syncing the last ${d} days from Retell. Refresh in a minute.` };
}

export async function analyzePending(workspaceId: string, mode: "now" | "batch") {
  await assertRole(workspaceId, "admin");
  if (mode === "batch") {
    const r = await submitAnalysisBatch(workspaceId, 1000);
    return { ok: true, message: r.batch_id ? `Queued ${r.queued} calls for bulk AI analysis (50% cheaper, usually done within an hour). ${r.ruled} simple calls classified instantly.` : `${r.ruled} calls classified; nothing needed the AI.` };
  }
  after(() => processPending(workspaceId, { limit: 60, concurrency: 5 }));
  return { ok: true, message: "Analyzing up to 60 calls in the background." };
}

export async function reanalyzeCall(workspaceId: string, callId: string) {
  await assertRole(workspaceId, "admin");
  if (!CALL_ID.test(callId)) throw new Error("Unknown call.");
  // Ensure the call belongs to this workspace before spending API credits on it.
  const { data } = await supabaseAdmin().from("calls").select("call_id").eq("workspace_id", workspaceId).eq("call_id", callId).maybeSingle();
  if (!data) throw new Error("Unknown call.");
  const r = await processCall(workspaceId, callId);
  revalidatePath(`/w`, "layout");
  return r;
}

export async function saveView(workspaceId: string, name: string, query: string) {
  const { user } = await assertRole(workspaceId, "client");
  const cleanName = String(name ?? "").trim().slice(0, 80);
  const cleanQuery = String(query ?? "").slice(0, 2000).replace(/^\?/, "");
  if (!cleanName) throw new Error("Give the view a name.");
  const db = await supabaseServer();
  await db.from("saved_views").insert({ workspace_id: workspaceId, name: cleanName, query: new URLSearchParams(cleanQuery).toString(), created_by: user.id });
  revalidatePath("/w", "layout");
}

export async function deleteView(workspaceId: string, id: string) {
  await assertRole(workspaceId, "client");
  if (!UUID.test(id)) return;
  const db = await supabaseServer();
  await db.from("saved_views").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/w", "layout");
}

export async function saveAlert(_: ActionState, form: FormData): Promise<ActionState> {
  const workspaceId = str(form, "workspace_id", 40);
  await assertRole(workspaceId, "admin");
  const metric = str(form, "metric", 40);
  const comparator = str(form, "comparator", 2);
  const threshold = Number(form.get("threshold"));
  const window = Number(form.get("window_minutes") || 60);
  const webhook = str(form, "webhook_url", 500);
  if (!ALERT_METRICS.some((m) => m.id === metric)) return { error: "Unknown metric." };
  if (comparator !== "lt" && comparator !== "gt") return { error: "Choose above or below." };
  if (!Number.isFinite(threshold)) return { error: "Enter a number for the threshold." };
  if (![60, 240, 1440].includes(window)) return { error: "Unknown window." };
  if (webhook) {
    try { await assertPublicHttpsUrl(webhook); } catch (e) { return { error: e instanceof Error ? e.message : "Invalid webhook URL." }; }
  }
  const { error } = await supabaseAdmin().from("alert_rules").insert({
    workspace_id: workspaceId, name: str(form, "name", 80) || "Alert", metric, comparator, threshold, window_minutes: window,
    webhook_url: webhook || null, email: null,
  });
  if (error) return { error: "Couldn't save the alert." };
  revalidatePath("/w", "layout");
  return { ok: true, message: "Alert saved." };
}

export async function deleteAlert(workspaceId: string, id: string) {
  await assertRole(workspaceId, "admin");
  if (!UUID.test(id)) return;
  await supabaseAdmin().from("alert_rules").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/w", "layout");
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}

const CHART_KINDS = ["column", "bar", "line", "stacked", "donut", "number"];
const BUCKETS = ["hour", "day", "week", "month", "none"];

export async function addDashboardChart(workspaceId: string, title: string, config: Record<string, unknown>) {
  await assertRole(workspaceId, "admin");
  // Whitelist every field: the config is stored and later rendered for every member.
  const metric = METRICS.find((m) => m.id === config?.metric);
  if (!metric) throw new Error("Unknown metric.");
  const measure = metric.measures.includes(config.measure as never) ? config.measure : metric.measures[0];
  const kind = CHART_KINDS.includes(String(config.kind)) ? String(config.kind) : "column";
  const bucket = config.bucket && BUCKETS.includes(String(config.bucket)) ? String(config.bucket) : undefined;
  const bd = String(config.breakdown ?? "");
  const breakdown = !bd ? "" : DIMENSIONS.some((d) => d.id === bd) || (bd.startsWith("custom:") && SAFE_KEY.test(bd.slice(7))) ? bd : "";
  const db = supabaseAdmin();
  const { count } = await db.from("dashboard_charts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if ((count ?? 0) >= 30) throw new Error("A dashboard can hold up to 30 custom charts.");
  const { error } = await db.from("dashboard_charts").insert({
    workspace_id: workspaceId, title: String(title ?? "").trim().slice(0, 80) || metric.label,
    config: { metric: metric.id, measure, kind, bucket, breakdown }, position: count ?? 0,
  });
  if (error) throw new Error("Couldn't save the chart.");
  revalidatePath("/w", "layout");
}

export async function deleteDashboardChart(workspaceId: string, id: string) {
  await assertRole(workspaceId, "admin");
  if (!UUID.test(id)) return;
  await supabaseAdmin().from("dashboard_charts").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/w", "layout");
}
