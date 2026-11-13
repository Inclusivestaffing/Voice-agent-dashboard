"use client";

import { useState } from "react";

export default function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); }}
      className="border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-dim hover:text-ink rounded-lg">
      {done ? "Link copied ✓" : "Copy share link"}
    </button>
  );
}
