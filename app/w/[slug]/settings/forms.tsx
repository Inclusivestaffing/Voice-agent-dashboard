"use client";

import { useActionState, useState, useTransition } from "react";
import { connectRetell, updateSettings, inviteMember, saveAlert, removeMember, deleteAlert, type ActionState } from "@/app/actions";
import type { Workspace } from "@/lib/db/queries";
import { Button } from "@/components/ui";

const input = "mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC"];

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return <p className={`text-sm mt-2 ${s.error ? "text-bad" : "text-good"}`} role="status">{s.error ?? s.message}</p>;
}

export function ConnectForm({ workspaceId, connected }: { workspaceId: string; connected: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(connectRetell, null);
  return (
    <form action={action}>
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="block"><span className="eyebrow">{connected ? "Replace API key" : "Retell API key"}</span>
        <input name="retell_key" type="password" required placeholder="key_…" className={input} autoComplete="off" /></label>
      <Button type="submit" disabled={pending} className="mt-3">{pending ? "Verifying…" : connected ? "Update key" : "Connect"}</Button>
      <Msg s={state} />
    </form>
  );
}

const toHM = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export function SettingsForm({ ws }: { ws: Workspace }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSettings, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="workspace_id" value={ws.id} />
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block"><span className="eyebrow">Name</span><input name="name" defaultValue={ws.name} className={input} required /></label>
        <label className="block"><span className="eyebrow">AI agent display name</span><input name="agent_display_name" defaultValue={ws.agent_display_name ?? ""} className={input} /></label>
        <label className="block"><span className="eyebrow">Timezone</span>
          <select name="timezone" defaultValue={ws.timezone} className={input}>{[...new Set([ws.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="eyebrow">Report accent color</span><input name="brand_primary" type="color" defaultValue={ws.brand_primary} className="mt-1.5 h-10 w-full border border-line-strong" /></label>
        <label className="block sm:col-span-2"><span className="eyebrow">Logo (shown on reports)</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1.5 block text-sm" /></label>
      </div>
      <label className="block"><span className="eyebrow">What counts as a successful call?</span>
        <textarea name="success_definition" defaultValue={ws.success_definition} rows={3} className={input} />
        <span className="text-xs text-muted">The AI judges every call against this. Be specific, e.g. “An appointment is booked, or an emergency is transferred within 30 seconds.”</span></label>
      <fieldset>
        <legend className="eyebrow mb-2">Business hours (used for after-hours stats)</legend>
        <div className="space-y-1.5">
          {DAYS.map((d) => {
            const v = ws.business_hours?.[d];
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <label className="w-16 flex items-center gap-1.5"><input type="checkbox" name={`bh_${d}_open`} defaultChecked={!!v} />{d}</label>
                <input type="time" name={`bh_${d}_start`} defaultValue={v ? toHM(v[0]) : "08:30"} className="border border-line-strong bg-surface px-2 py-1 text-xs" />
                <span className="text-muted">–</span>
                <input type="time" name={`bh_${d}_end`} defaultValue={v ? toHM(v[1]) : "17:30"} className="border border-line-strong bg-surface px-2 py-1 text-xs" />
              </div>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      <Msg s={state} />
    </form>
  );
}

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMember, null);
  return (
    <form action={action} className="flex flex-wrap gap-2 items-end">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="block flex-1 min-w-[200px]"><span className="eyebrow">Invite by email</span><input name="email" type="email" required className={input} placeholder="client@business.com" /></label>
      <label className="block"><span className="eyebrow">Role</span>
        <select name="role" className={input} defaultValue="client"><option value="client">Client</option><option value="user">User</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label>
      <Button type="submit" disabled={pending}>Invite</Button>
      <div className="w-full"><Msg s={state} /></div>
    </form>
  );
}

export function MemberRow({ workspaceId, userId, email, role, isSelf, canRemove }: { workspaceId: string; userId: string; email: string; role: string; isSelf: boolean; canRemove: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between py-2 text-sm gap-3">
      <span className="truncate">{email}{isSelf && <span className="text-xs text-muted ml-1.5">YOU</span>}</span>
      <span className="flex items-center gap-3"><span className="text-xs text-dim">{role}</span>
        {canRemove && !isSelf && role !== "owner" && <button disabled={pending} onClick={() => start(() => removeMember(workspaceId, userId))} className="text-xs text-muted hover:text-bad">Remove</button>}
      </span>
    </li>
  );
}

export function AlertForm({ workspaceId, metrics }: { workspaceId: string; metrics: { id: string; label: string; unit: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAlert, null);
  const [metric, setMetric] = useState(metrics[0].id);
  const unit = metrics.find((m) => m.id === metric)?.unit;
  return (
    <form action={action} className="grid sm:grid-cols-2 gap-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="block sm:col-span-2"><span className="eyebrow">Alert name</span><input name="name" required className={input} placeholder="Success rate dropped" /></label>
      <label className="block"><span className="eyebrow">Metric</span>
        <select name="metric" className={input} value={metric} onChange={(e) => setMetric(e.target.value)}>{metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="eyebrow">When</span><select name="comparator" className={input}><option value="lt">below</option><option value="gt">above</option></select></label>
        <label className="block"><span className="eyebrow">Value ({unit})</span><input name="threshold" type="number" step="any" required className={input} /></label>
      </div>
      <label className="block"><span className="eyebrow">Window</span>
        <select name="window_minutes" className={input} defaultValue="60"><option value="60">Last hour</option><option value="240">Last 4 hours</option><option value="1440">Last 24 hours</option></select></label>
      <label className="block"><span className="eyebrow">Webhook URL (Slack, etc.)</span><input name="webhook_url" type="url" className={input} placeholder="https://hooks.slack.com/…" /></label>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>Add alert</Button><Msg s={state} /></div>
    </form>
  );
}

export function AlertRow({ workspaceId, alert, label }: { workspaceId: string; alert: { id: string; name: string; comparator: string; threshold: number; window_minutes: number; last_fired_at: string | null }; label: string }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div><b>{alert.name}</b><div className="text-xs text-dim">{label} {alert.comparator === "lt" ? "below" : "above"} {alert.threshold} · {alert.window_minutes / 60}h window{alert.last_fired_at ? ` · last fired ${new Date(alert.last_fired_at).toLocaleString()}` : ""}</div></div>
      <button disabled={pending} onClick={() => start(() => deleteAlert(workspaceId, alert.id))} className="text-xs text-muted hover:text-bad">Delete</button>
    </li>
  );
}

export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex">
      <input readOnly value={value} className="flex-1 border border-line-strong bg-surface-2 px-3 py-2 text-xs min-w-0" onFocus={(e) => e.target.select()} />
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
        className="bg-ink text-bg px-3 text-xs font-medium">{done ? "Copied" : "Copy"}</button>
    </div>
  );
}
