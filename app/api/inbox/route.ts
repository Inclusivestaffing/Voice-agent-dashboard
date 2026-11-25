import { NextResponse, after } from "next/server";
import { z } from "zod";
import { inboxAllowed, loadInbox } from "@/lib/inbox/load";
import { ITEM_ID, inboxAvailable, listInbox, setRead } from "@/lib/inbox/store";
import { listWorkspaces } from "@/lib/live/conn";
import { runDueNow } from "@/lib/automation/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300; // a due scheduled analysis may run in the background of this request
const noStore = { "Cache-Control": "private, no-store" };

/** The inbox for the top bar: newest items from every workspace. Signed-in users only. */
export async function GET(req: Request) {
  if (!(await inboxAllowed())) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 40));
  // Start a due scheduled analysis (the daily job does too; this makes schedules run on time).
  if (inboxAvailable()) { const workspaces = await listWorkspaces(); after(() => runDueNow(workspaces).then(() => undefined).catch(() => undefined)); }
  return NextResponse.json(await loadInbox(limit), { headers: noStore });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ids: z.array(z.string().regex(ITEM_ID)).max(200) }),
  z.object({ action: z.literal("unread"), ids: z.array(z.string().regex(ITEM_ID)).max(200) }),
  z.object({ action: z.literal("read_all") }),
]);

/** Mark items read / unread. The session cookie is SameSite=Lax, so cross-site POSTs arrive signed out. */
export async function POST(req: Request) {
  if (!(await inboxAllowed())) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  if (!inboxAvailable()) return NextResponse.json({ error: "The inbox needs the site's server storage." }, { status: 501, headers: noStore });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: z.infer<typeof Body>;
  try { body = Body.parse(JSON.parse(text)); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const ids = body.action === "read_all" ? (await listInbox(500)).filter((it) => !it.read_at).map((it) => it.id) : body.ids;
  const changed = await setRead(ids, body.action !== "unread");
  return NextResponse.json({ ok: true, changed }, { headers: noStore });
}
