"use client";

import { useActionState } from "react";
import { createWorkspace, type ActionState } from "../actions";
import { Button } from "@/components/ui";

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC"];

export default function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createWorkspace, null);
  return (
    <form action={action} className="grid sm:grid-cols-2 gap-4">
      <Field label="Client / business name" name="name" placeholder="Open Water Marine" required />
      <Field label="AI agent display name" name="agent_name" placeholder="Allen" />
      <Field label="Retell API key" name="retell_key" placeholder="key_…" type="password" className="sm:col-span-2"
        hint="Stored encrypted (AES-256). You can also add it later in Settings." />
      <label className="block">
        <span className="eyebrow">Timezone</span>
        <select name="timezone" defaultValue="America/Chicago" className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm rounded-lg">
          {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow">Import history</span>
        <select name="backfill_days" defaultValue="30" className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm rounded-lg">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </select>
      </label>
      {state?.error && <p className="sm:col-span-2 text-sm text-bad" role="alert">{state.error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Checking key…" : "Create workspace"}</Button>
      </div>
    </form>
  );
}

function Field({ label, hint, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="eyebrow">{label}</span>
      <input {...rest} className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm rounded-lg" />
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}
