"use client";

import { useState } from "react";

export default function DownloadPdfButton({
  className,
  label = "Download PDF",
}: {
  className?: string;
  label?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    setDownloading(true);
    // Allow SVG charts and print layouts to fully settle
    setTimeout(() => {
      window.print();
      setDownloading(false);
    }, 300);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      title="Download report as PDF (removes individual call transcripts for executive sharing)"
      className={
        className ??
        "inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-75"
      }
    >
      <svg
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span>{downloading ? "Opening print dialog…" : label}</span>
    </button>
  );
}

