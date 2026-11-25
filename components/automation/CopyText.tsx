"use client";

import { useState } from "react";
import { toast } from "@/components/feedback/Toaster";

/** A read-only value (a URL, a prompt change) with a Copy button. */
export default function CopyText({ text, block = false }: { text: string; block?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); toast("Copied"); window.setTimeout(() => setCopied(false), 1500); }
    catch { toast("Couldn't copy", "error"); }
  }
  return (
    <span className={block ? "mt-2 block" : "mt-2 flex items-center gap-2"}>
      {block
        ? <span className="block whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-zinc-800">{text}</span>
        : <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11.5px] text-zinc-800" title={text}>{text}</code>}
      <button type="button" onClick={copy}
        className={block ? "mt-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50" : "shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
