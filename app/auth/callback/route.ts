import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/db/supabase";
import { safeNext } from "@/lib/security";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Relative paths only: prevents open redirects such as ?next=//evil.example
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const db = await supabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) await db.rpc("accept_invites_for_current_user");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
