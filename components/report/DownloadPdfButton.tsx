"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const skip = (el: Element) =>
  !(el instanceof HTMLElement) || el.classList.contains("no-print") || el.classList.contains("print-page-break") || el.offsetHeight === 0;

/**
 * Builds the report PDF in the browser, the same way on phones and desktops: the report is laid out
 * at a fixed page width, every section (with its charts) is captured as an image, and the sections
 * are placed on A4 pages without splitting any of them. Per-call lists and transcripts are left out;
 * they stay in the web view.
 */
async function buildPdf(root: HTMLElement) {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import("jspdf"), import("html-to-image")]);

  // Sections: the report's top-level blocks; the "more analytics" wrapper is split into its parts.
  const blocks: HTMLElement[] = [];
  for (const el of Array.from(root.children)) {
    if (skip(el)) continue;
    if (el.classList.contains("space-y-7")) { for (const c of Array.from(el.children)) if (!skip(c)) blocks.push(c as HTMLElement); }
    else blocks.push(el as HTMLElement);
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = 210, pageH = 297, margin = 12, gap = 4;
  const contentW = pageW - margin * 2, maxH = pageH - margin * 2 - 6;
  let y = margin;
  for (const el of blocks) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) continue;
    // Keep a section's own background (e.g. the black summary bars); white behind transparent ones.
    const bg = getComputedStyle(el).backgroundColor;
    const img = await toJpeg(el, {
      quality: 0.94, pixelRatio: 2, backgroundColor: !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)" ? "#ffffff" : bg,
      filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-print")),
    });
    let wmm = contentW, hmm = (h * contentW) / w;
    if (hmm > maxH) { wmm *= maxH / hmm; hmm = maxH; } // a very tall section shrinks to fit one page
    if (y + hmm > pageH - margin - 6 && y > margin) { pdf.addPage(); y = margin; }
    pdf.addImage(img, "JPEG", margin + (contentW - wmm) / 2, y, wmm, hmm, undefined, "FAST");
    y += hmm + gap;
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 6, { align: "right" });
  }
  return pdf;
}

export default function DownloadPdfButton({ className, label = "Download PDF" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    const root = document.querySelector<HTMLElement>(".report-root");
    if (!root || busy) return;
    setBusy(true);
    setError(null);
    const html = document.documentElement;
    html.classList.add("pdf-mode");
    try {
      // Let the charts redraw at the page width and finish animating.
      window.dispatchEvent(new Event("resize"));
      await wait(1100);
      const pdf = await buildPdf(root);
      const title = root.querySelector("[data-report-title]")?.getAttribute("data-report-title") || "Voice agent report";
      pdf.save(`${title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "report"}.pdf`);
    } catch (e) {
      console.error(e);
      setError("Couldn't create the PDF. Try again, or use your browser's Print → Save as PDF.");
    } finally {
      html.classList.remove("pdf-mode");
      window.dispatchEvent(new Event("resize"));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        title="Download the report as a PDF with every chart. Call transcripts stay in the web view."
        className={className ?? "inline-flex h-9 items-center gap-2 px-3.5 text-[13px] font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-70"}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>{busy ? "Preparing PDF…" : label}</span>
      </button>
      {error && <p role="alert" className="text-[12px] text-bad">{error}</p>}
      {busy && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[95] grid place-items-center bg-white/85 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-pop text-sm text-zinc-700">
            <span className="h-4 w-4 rounded-full border-2 border-zinc-900 border-r-transparent animate-spin" aria-hidden />
            Preparing your PDF…
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
