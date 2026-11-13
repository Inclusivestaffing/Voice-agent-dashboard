import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InclusiveLogo } from "@/components/InclusiveLogo";
import { isSignedIn, passwordConfigured } from "@/lib/auth/gate";
import UnlockForm from "./UnlockForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** Password screen in front of the dashboard when real call data is stored on the server. */
export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/demo" } = await searchParams;
  if (!passwordConfigured() || (await isSignedIn())) redirect("/demo");
  return (
    <main className="min-h-dvh grid place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center"><InclusiveLogo className="h-9 w-auto" /></div>
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-[var(--shadow-sheet)]">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-zinc-900">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500">This dashboard shows real call recordings and transcripts. Enter the team password to continue.</p>
          <div className="mt-5"><UnlockForm next={next} /></div>
        </div>
      </div>
    </main>
  );
}
