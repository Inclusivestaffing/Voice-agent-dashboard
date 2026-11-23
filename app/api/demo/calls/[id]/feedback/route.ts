import { NextResponse } from "next/server";
import { z } from "zod";
import { isSignedIn, passwordConfigured } from "@/lib/auth/gate";
import { DOWN_REASONS } from "@/lib/humanlike/feedback";
import { feedbackAvailable, saveFeedback } from "@/lib/humanlike/feedbackStore";
import { isResult } from "@/lib/humanlike/schema";
import { SAMPLE_ID } from "@/lib/live/conn";
import { CALL_ID } from "@/lib/security";
import { getSource } from "@/lib/source";

const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("moment"), key: z.string().regex(/^-?\d{1,6}-(mistake|robotic|natural)-[a-z_]{1,40}$/), vote: z.enum(["up", "down"]).nullable(), reason: z.enum(DOWN_REASONS).nullable().optional() }),
  z.object({ type: z.literal("score"), vote: z.enum(["low", "right", "high"]).nullable() }),
  z.object({ type: z.literal("missed"), text: z.string().max(500) }),
]);

/** 👍/👎 on a human-likeness moment, how the score feels, or what the analysis missed. Signed-in users only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CALL_ID.test(id)) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (!feedbackAvailable()) return NextResponse.json({ error: "Feedback needs the site's server storage." }, { status: 501 });
  // The session cookie is SameSite=Lax, so it isn't sent on cross-site POSTs: this check also stops CSRF.
  if (!passwordConfigured() || !(await isSignedIn())) return NextResponse.json({ error: "Sign in to leave feedback." }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  const text = await req.text();
  if (text.length > 4000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let parsed: z.infer<typeof Body>;
  try { parsed = Body.parse(JSON.parse(text)); } catch { return NextResponse.json({ error: "Invalid feedback" }, { status: 400 }); }

  const src = await getSource();
  const hl = await src.humanlikeOne(id);
  if (!isResult(hl)) return NextResponse.json({ error: "This call hasn't been analyzed." }, { status: 404 });
  try {
    const saved = await saveFeedback(src.conn?.id ?? SAMPLE_ID, hl, parsed);
    if (!saved) return NextResponse.json({ error: "That moment isn't part of this call's analysis." }, { status: 404 });
    return NextResponse.json({ feedback: saved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't save feedback. Try again." }, { status: 503 });
  }
}
