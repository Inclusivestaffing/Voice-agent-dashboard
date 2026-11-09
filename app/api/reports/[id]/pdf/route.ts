import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/db/supabase";
import { appOrigin } from "@/lib/origin";
import { UUID } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 120;

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  // Local dev: point CHROME_PATH at an installed Chrome/Edge. On Vercel: use @sparticuz/chromium.
  if (process.env.CHROME_PATH) {
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // RLS: only members of the report's workspace can read it.
  const { data: r } = await db.from("reports").select("id, title, share_token, pdf_path, workspace_id").eq("id", id).maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = supabaseAdmin();
  const filename = `${r.title.replace(/[^a-zA-Z0-9 -]/g, "").trim() || "report"}.pdf`;
  if (r.pdf_path && req.nextUrl.searchParams.get("fresh") !== "1") {
    const { data } = await admin.storage.from("reports").download(r.pdf_path);
    if (data) return new NextResponse(data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }

  const origin = await appOrigin();
  const allowed = [origin, "https://fonts.googleapis.com", "https://fonts.gstatic.com", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""].filter(Boolean);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (rq) => {
      const u = rq.url();
      if (u.startsWith("data:") || allowed.some((a) => u === a || u.startsWith(`${a}/`))) rq.continue(); else rq.abort();
    });
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.goto(`${origin}/r/${r.share_token}?print=1`, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForSelector("svg", { timeout: 15_000 }).catch(() => null); // charts render client-side
    await new Promise((res) => setTimeout(res, 600));
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "12mm", left: "8mm", right: "8mm" }, scale: 0.72 });
    const path = `${r.workspace_id}/${r.id}.pdf`;
    await admin.storage.from("reports").upload(path, pdf, { contentType: "application/pdf", upsert: true });
    await admin.from("reports").update({ pdf_path: path }).eq("id", r.id);
    return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } finally {
    await browser.close();
  }
}
