import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/db/supabase";
import DownloadPdfButton from "@/components/report/DownloadPdfButton";
import ReportView from "@/components/report/ReportView";
import type { ReportSnapshot } from "@/lib/reports/snapshot";
import type { ReportNarrative } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";

async function load(token: string) {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null;
  const { data } = await supabaseAdmin().from("reports").select("title, snapshot, narrative").eq("share_token", token).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await load((await params).token);
  return { title: r?.title ?? "Report", robots: { index: false, follow: false } };
}

/** Public, read-only report reachable by its unguessable share token. Also the PDF render target. */
export default async function PublicReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ print?: string }> }) {
  const { token } = await params;
  const { print } = await searchParams;
  const r = await load(token);
  if (!r) notFound();
  return (
    <div className="bg-surface min-h-screen">
      {!print && (
        <div className="no-print print:hidden max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 pb-2 flex justify-end">
          <DownloadPdfButton />
        </div>
      )}
      <ReportView snap={r.snapshot as ReportSnapshot} narrative={r.narrative as ReportNarrative | null} print={print === "1"} />
    </div>
  );
}
