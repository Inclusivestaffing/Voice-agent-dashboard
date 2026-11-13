"use client";

import { useActionState } from "react";
import { unlock, type UnlockState } from "./actions";
import { Button } from "@/components/ui";

export default function UnlockForm({ next, askEmail }: { next: string; askEmail: boolean }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {askEmail && (
        <label className="block">
          <span className="block text-[13px] font-medium text-zinc-700">Email</span>
          <input name="email" type="email" required autoFocus autoComplete="username" spellCheck={false}
            className="mt-1.5 w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5" />
        </label>
      )}
      <label className="block">
        <span className="block text-[13px] font-medium text-zinc-700">Password</span>
        <input name="password" type="password" required autoFocus={!askEmail} autoComplete="current-password"
          aria-invalid={!!state?.error} aria-describedby={state?.error ? "unlock-error" : undefined}
          className="mt-1.5 w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus-visible:outline-none focus:ring-4 focus:ring-zinc-900/5" />
      </label>
      {state?.error && <p id="unlock-error" role="alert" className="text-[13px] text-bad">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
