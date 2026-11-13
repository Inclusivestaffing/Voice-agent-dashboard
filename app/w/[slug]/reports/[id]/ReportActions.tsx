"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rotateShareLink, deleteReport } from "../actions";

/** Admin-only controls: revoke the public link (rotates the token) or delete the report. */
export default function ReportActions({ slug, reportId }: { slug: string; reportId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <button disabled={pending} onClick={() => { if (confirm("Revoke the current share link? Anyone with the old link will lose access.")) start(async () => { await rotateShareLink(slug, reportId); setMsg("Old link revoked"); router.refresh(); }); }}
        className="border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-dim hover:text-ink rounded-lg">Revoke link</button>
      <button disabled={pending} onClick={() => { if (confirm("Delete this report permanently?")) start(() => deleteReport(slug, reportId)); }}
        className="border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-dim hover:text-bad rounded-lg">Delete</button>
      {msg && <span className="text-xs text-good" role="status">{msg}</span>}
    </div>
  );
}
