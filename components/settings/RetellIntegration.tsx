"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { connectRetell, disconnectRetell, updateRetell, type ConnectState } from "@/app/demo/settings/actions";
import { Button, cx } from "@/components/ui";

export interface ConnectedInfo {
  last4: string;
  name: string;
  timezone: string;
  connectedAt: string;
  agentIds: string[];
  agents: { agent_id: string; agent_name: string; version: number | null }[];
  agentsError?: string | null;
}

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney", "UTC"];

const field = "mt-1.5 w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5";
const label = "block text-[13px] font-medium text-zinc-700";

function TimezoneSelect({ value }: { value?: string }) {
  const [tz, setTz] = useState(value ?? "UTC");
  useEffect(() => { if (!value) { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); } catch { /* keep UTC */ } } }, [value]);
  const list = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  return (
    <select name="timezone" value={tz} onChange={(e) => setTz(e.target.value)} className={field}>
      {list.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
    </select>
  );
}

function Msg({ s }: { s: ConnectState }) {
  if (!s) return null;
  return <p role={s.error ? "alert" : "status"} className={cx("text-[13px]", s.error ? "text-bad" : "text-emerald-700")}>{s.error ?? s.message}</p>;
}

/** Settings → Retell integration: connect with an API key (and optional agent IDs), then manage it. */
export default function RetellIntegration({ connected, problem, storage }: { connected: ConnectedInfo | null; problem: string | null; storage: "server" | "browser" }) {
  return (
    <div className="space-y-4">
      {connected ? <Connected info={connected} /> : <ConnectForm problem={problem} />}
      <p className="flex items-start gap-2 text-[12px] text-zinc-500">
        <svg className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        {storage === "server"
          ? "Workspaces are saved encrypted in this site's Vercel storage, so they appear on every device. Only people who sign in can see the calls."
          : "Workspaces are saved encrypted in this browser only."}
      </p>
    </div>
  );
}

export function ConnectForm({ problem }: { problem: string | null }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectRetell, null);
  return (
    <form action={action} className="space-y-4" autoComplete="off">
      {problem && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          {problem} In Vercel: Project → Settings → Environment Variables, then redeploy.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className={label}>Retell API key <span className="text-rose-600" aria-hidden>*</span></span>
          <input name="api_key" type="password" required spellCheck={false} autoComplete="off" placeholder="key_…" className={cx(field, "font-mono")} aria-describedby="key-help" />
          <span id="key-help" className="mt-1.5 block text-[12px] text-zinc-500">In Retell, open Settings → API Keys and copy a key. It&apos;s stored encrypted on the server and never shown again.</span>
        </label>
        <label className="block md:col-span-2">
          <span className={label}>Agent IDs <span className="font-normal text-zinc-400">(optional)</span></span>
          <input name="agent_ids" spellCheck={false} placeholder="agent_6a1b…, agent_93fe…" className={cx(field, "font-mono")} aria-describedby="agent-help" />
          <span id="agent-help" className="mt-1.5 block text-[12px] text-zinc-500">Leave empty to include every agent on the account. You can pick agents after connecting too.</span>
        </label>
        <label className="block">
          <span className={label}>Workspace name</span>
          <input name="name" maxLength={80} placeholder="e.g. the client&apos;s business name" className={field} />
        </label>
        <label className="block">
          <span className={label}>Time zone</span>
          <TimezoneSelect />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !!problem}>{pending ? "Checking key…" : "Create workspace"}</Button>
        <Msg s={state} />
      </div>
    </form>
  );
}

function Connected({ info }: { info: ConnectedInfo }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(updateRetell, null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, startLeaving] = useTransition();
  const all = info.agentIds.length === 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-[13px]">
        <span className="inline-flex items-center gap-2 font-medium text-emerald-900"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />Connected to Retell</span>
        <span className="text-emerald-900/80">API key <span className="font-mono">····{info.last4}</span></span>
        <span className="text-emerald-900/80">Since {new Date(info.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <Link href="/demo/calls" className="ml-auto font-medium text-emerald-900 underline underline-offset-2">Open Call History</Link>
      </div>

      <form action={action} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className={label}>Workspace name</span><input name="name" defaultValue={info.name} maxLength={80} className={field} /></label>
          <label className="block"><span className={label}>Time zone</span><TimezoneSelect value={info.timezone} /></label>
        </div>
        <fieldset>
          <legend className={label}>Agents to show</legend>
          <p className="mt-0.5 text-[12px] text-zinc-500">Calls from the ticked agents appear across Analytics, Call History and Reports. Tick none to show every agent.</p>
          {info.agentsError ? <p className="mt-2 text-[13px] text-bad">{info.agentsError}</p> : (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-200/80 divide-y divide-zinc-100">
              {info.agents.map((a) => (
                <label key={a.agent_id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px] hover:bg-zinc-50">
                  <input type="checkbox" name="agent" value={a.agent_id} defaultChecked={all || info.agentIds.includes(a.agent_id)} className="h-4 w-4 accent-zinc-900" />
                  <span className="font-medium text-zinc-900">{a.agent_name}</span>
                  <span className="font-mono text-[11.5px] text-zinc-400 truncate">{a.agent_id}</span>
                  {a.version != null && <span className="ml-auto text-[12px] text-zinc-500 tabular">v{a.version}</span>}
                </label>
              ))}
              {info.agents.length === 0 && <p className="px-3.5 py-3 text-[13px] text-zinc-500">No agents found on this Retell account.</p>}
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          <Msg s={state} />
          <div className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-[13px] text-zinc-600">Delete this workspace and its saved Retell key?</span>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button type="button" variant="danger" disabled={leaving} onClick={() => startLeaving(() => disconnectRetell())}>{leaving ? "Deleting…" : "Delete workspace"}</Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Delete workspace</Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
