"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, passwordMatches, startSession } from "@/lib/auth/gate";

export type UnlockState = { error?: string } | null;

// Slow down password guessing: a short delay on every failure, and a lockout after repeated misses.
const misses = new Map<string, { n: number; until: number }>();

export async function unlock(_: UnlockState, form: FormData): Promise<UnlockState> {
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const m = misses.get(ip);
  if (m && m.until > Date.now()) return { error: "Too many attempts. Wait a few minutes and try again." };

  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!passwordMatches(password)) {
    const n = (m?.n ?? 0) + 1;
    misses.set(ip, { n, until: n >= 8 ? Date.now() + 5 * 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 600));
    return { error: "That password isn't right." };
  }
  misses.delete(ip);
  await startSession();
  const next = String(form.get("next") ?? "/demo");
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/demo");
}

export async function signOut() {
  await endSession();
  redirect("/unlock");
}
