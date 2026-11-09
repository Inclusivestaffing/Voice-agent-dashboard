"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNow, analyzePending } from "@/app/actions";
import { Button } from "@/components/ui";

export default function SyncButtons({ workspaceId, pending = 0 }: { workspaceId: string; pending?: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const run = (fn: () => Promise<{ message?: string }>) => start(async () => {
    try { const r = await fn(); setMsg(r.message ?? "Done"); setTimeout(() => router.refresh(), 4000); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  });
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" disabled={busy} onClick={() => run(() => syncNow(workspaceId, 2))}>Sync now</Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(() => syncNow(workspaceId, 90))}>Import 90 days</Button>
        {pending > 0 && (
          <>
            <Button disabled={busy} onClick={() => run(() => analyzePending(workspaceId, "now"))}>Analyze {pending} now</Button>
            {pending > 50 && <Button variant="dark" disabled={busy} onClick={() => run(() => analyzePending(workspaceId, "batch"))}>Bulk analyze (−50%)</Button>}
          </>
        )}
      </div>
      {msg && <p className="text-xs text-dim" role="status">{msg}</p>}
    </div>
  );
}
