import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db/queries";
import { supabaseAdmin } from "@/lib/db/supabase";
import { appOrigin } from "@/lib/origin";
import { ALERT_METRICS } from "@/lib/alerts";
import { Card } from "@/components/ui";
import { ConnectForm, SettingsForm, InviteForm, AlertForm, MemberRow, AlertRow, CopyField } from "./forms";
import SyncButtons from "../overview/SyncButtons";
import { canEdit, ROLE_LABEL, isRole } from "@/lib/roles";
import RoleControlsCard from "@/components/settings/RoleControlsCard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, ws, role, user } = await getWorkspace(slug);
  if (!canEdit(role)) redirect(`/w/${slug}/overview`);
  const admin = supabaseAdmin();
  const [{ data: conn }, { data: members }, { data: invites }, { data: alerts }, { data: runs }] = await Promise.all([
    admin.from("retell_connections").select("api_key_last4, last_synced_at, last_sync_error").eq("workspace_id", ws.id).maybeSingle(),
    admin.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ws.id),
    db.from("workspace_invites").select("email, role, accepted_at, created_at").eq("workspace_id", ws.id).is("accepted_at", null),
    db.from("alert_rules").select("*").eq("workspace_id", ws.id).order("created_at"),
    db.from("sync_runs").select("kind, started_at, finished_at, calls_seen, calls_upserted, error").eq("workspace_id", ws.id).order("started_at", { ascending: false }).limit(5),
  ]);
  const emails = new Map<string, string>();
  await Promise.all((members ?? []).map(async (m) => {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.set(m.user_id, data.user.email);
  }));
  const webhookUrl = `${await appOrigin()}/api/webhooks/retell/${ws.id}`;

  return (
    <>
      <div className="mb-6">
        <div className="eyebrow">{ws.name}</div>
        <h1 className="text-xl font-medium mt-1">Settings</h1>
      </div>
      <div className="grid xl:grid-cols-2 gap-5">
        <RoleControlsCard email={user?.email ?? "admin@inclusivestaffing.com"} name={ws.name} />
        <Card title="Retell connection" sub={conn ? `Connected · key ····${conn.api_key_last4}` : "Not connected"}>
          <ConnectForm workspaceId={ws.id} connected={!!conn} />
          <div className="mt-5 pt-5 border-t border-line space-y-3">
            <div>
              <div className="eyebrow mb-1.5">Webhook URL (real-time updates)</div>
              <CopyField value={webhookUrl} />
              <p className="text-xs text-dim mt-1.5">In Retell, open each agent → Webhook settings (or Settings → Webhooks for the whole account) and paste this URL. New calls are analyzed within seconds of ending. Without it, the system still syncs every 15 minutes.</p>
            </div>
            {conn && <SyncButtons workspaceId={ws.id} />}
            {(runs ?? []).length > 0 && (
              <table className="w-full text-xs mt-2">
                <thead><tr className="text-left text-dim"><th>Sync</th><th>Started</th><th className="text-right">Seen</th><th className="text-right">Saved</th><th>Status</th></tr></thead>
                <tbody>{(runs ?? []).map((r, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-1">{r.kind}</td><td>{new Date(r.started_at).toLocaleString()}</td><td className="text-right">{r.calls_seen}</td><td className="text-right">{r.calls_upserted}</td>
                    <td className={r.error ? "text-bad" : "text-good"}>{r.error ? r.error.slice(0, 40) : r.finished_at ? "ok" : "running"}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </Card>

        <Card title="Workspace, branding & AI judging" sub="Used on dashboards, reports and by the AI when it decides whether a call succeeded">
          <SettingsForm ws={ws} />
        </Card>

        <Card title="Team" sub="Owner: everything · Admin: settings, team and reports · User: all dashboards, read-only · Client: analytics, calls and reports">
          <ul className="divide-y divide-line mb-4">
            {(members ?? []).map((m) => (
              <MemberRow key={m.user_id} workspaceId={ws.id} userId={m.user_id} email={emails.get(m.user_id) ?? m.user_id} role={isRole(m.role) ? ROLE_LABEL[m.role] : m.role} isSelf={m.user_id === user.id} canRemove={role === "owner"} />
            ))}
            {(invites ?? []).map((i) => (
              <li key={i.email} className="flex justify-between py-2 text-sm"><span>{i.email} <span className="text-xs text-muted">invited</span></span><span className="text-xs text-dim">{isRole(i.role) ? ROLE_LABEL[i.role] : i.role}</span></li>
            ))}
          </ul>
          <InviteForm workspaceId={ws.id} />
        </Card>

        <Card title="Alerts" sub="Checked every 15 minutes. Webhook payload works with Slack incoming webhooks.">
          <ul className="divide-y divide-line mb-4">
            {(alerts ?? []).map((a) => <AlertRow key={a.id} workspaceId={ws.id} alert={a} label={ALERT_METRICS.find((m) => m.id === a.metric)?.label ?? a.metric} />)}
            {(alerts ?? []).length === 0 && <li className="text-sm text-dim py-2">No alerts yet. A good start: success rate below 60%, or any failed transfers in the last hour.</li>}
          </ul>
          <AlertForm workspaceId={ws.id} metrics={ALERT_METRICS.map((m) => ({ id: m.id, label: m.label, unit: m.unit }))} />
        </Card>
      </div>
    </>
  );
}
