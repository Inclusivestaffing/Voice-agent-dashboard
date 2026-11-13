"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/db/supabase-browser";
import { Button } from "@/components/ui";
import { InclusiveLogo } from "@/components/InclusiveLogo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Relative, same-site paths only (prevents open redirects like ?next=//evil.example).
  const rawNext = params.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/workspaces";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === "magic") {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: "ok", text: "Check your inbox for a sign-in link." });
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await sb.rpc("accept_invites_for_current_user");
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      setMsg({ tone: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} className="w-full max-w-sm bg-white rounded-xl border border-zinc-200 p-8 shadow-card">
      <div className="mb-5">
        <InclusiveLogo href="/login" />
      </div>
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-zinc-900">Sign in</h1>
      <p className="text-sm text-dim mt-1">See how your AI voice agents are performing.</p>
      <label className="block mt-6 eyebrow" htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm rounded-lg" autoComplete="email" />
      {mode === "password" && (
        <>
          <label className="block mt-4 eyebrow" htmlFor="pw">Password</label>
          <input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm rounded-lg" autoComplete="current-password" />
        </>
      )}
      {msg && <p className={`mt-4 text-sm ${msg.tone === "ok" ? "text-good" : "text-bad"}`} role="status">{msg.text}</p>}
      <div className="mt-6 flex flex-col gap-2">
        <Button type="submit" disabled={busy}>{mode === "magic" ? "Email me a link" : "Sign in"}</Button>
      </div>
      <button type="button" className="mt-4 text-xs text-dim underline" onClick={() => setMode(mode === "magic" ? "password" : "magic")}>
        {mode === "magic" ? "Use a password instead" : "Email me a sign-in link instead"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
