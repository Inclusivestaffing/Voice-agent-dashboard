"use client";

// One chart component for the whole app, following the dataviz method:
// thin marks with 4px rounded data-ends, 2px surface gaps, recessive grid, hover
// tooltips on every mark, a legend whenever there are ≥2 series, text in ink tokens,
// categorical hues in fixed slot order. Colors come from CSS tokens so dark mode is a
// selected palette, not an automatic flip.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { createPortal } from "react-dom";
import { toast } from "@/components/feedback/Toaster";

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

export type ChartKind = "donut" | "column" | "bar" | "line" | "stacked";

export interface ChartSeries {
  name: string;
  data: (number | null)[];
  /** CSS var name like "--s1" or a status token; defaults to fixed slot order. */
  color?: string;
  /** Previous-period comparison: drawn as a dashed, muted line over the main marks. */
  compare?: boolean;
}

export interface ChartProps {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  unit?: string;               // "%", "s", "ms", "$", " calls"
  height?: number;
  labels?: "all" | "none" | "auto";
  /** For donuts: per-slice colors (CSS var names), aligned with categories. */
  sliceColors?: string[];
  ariaLabel: string;
  /** Donut legend placement: beside the ring (wide cards) or below it (narrow cards). */
  legendPosition?: "right" | "bottom";
  onSelect?: (category: string, seriesName: string) => void;
  /** Hover toolbar: expand, download PNG, download CSV (off inside the expanded view). */
  toolbar?: boolean;
  /** Force immediate rendering without waiting for IntersectionObserver (essential for reports & PDF print). */
  forceVisible?: boolean;
}

const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const TOKEN_NAMES = ["--surface", "--text", "--text-dim", "--text-muted", "--grid", "--axis", "--single", "--neutral-1", "--neutral-2",
  "--status-good", "--status-warning", "--status-serious", "--status-critical", "--border", "--border-strong", ...SLOTS];

function readTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKEN_NAMES.map((n) => [n, cs.getPropertyValue(n).trim()]));
}

// Read the CSS tokens once per page load and share them across all charts.
let tokenCache: Record<string, string> | null = null;
function useTokens() {
  const [tokens, setTokens] = useState<Record<string, string>>(() => tokenCache ?? {});
  useEffect(() => { if (!tokenCache) tokenCache = readTokens(); setTokens(tokenCache); }, []);
  return tokens;
}

/**
 * Mount a chart only when it's near the viewport. An analytics page has ~25 charts; building
 * them all on load blocks the main thread right when you're trying to click around.
 */
function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    let idle: number | undefined;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      // Draw in an idle slot: each chart builds in its own task, so clicks and typing can be
      // handled between charts instead of waiting for the whole page to draw.
      const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 16));
      idle = ric(() => setVisible(true), { timeout: 250 });
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => {
      io.disconnect();
      if (idle !== undefined) (window.cancelIdleCallback ?? window.clearTimeout)(idle);
    };
  }, [visible]);
  return { ref, visible };
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** ECharts renders tooltip strings as HTML; every data-derived label must be escaped. */
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}

interface TipParam { marker: string; seriesName: string; value: number | null; axisValueLabel?: string; name: string }

export function formatValue(v: number | null | undefined, unit?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (unit === "%") return `${v.toFixed(v < 10 ? 1 : 0)}%`;
  if (unit === "$") return `$${v.toFixed(2)}`;
  if (unit === "ms") return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
  if (unit === "s") return v >= 90 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${v.toFixed(v < 10 ? 1 : 0)}s`;
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r.toLocaleString()}${unit ?? ""}`;
}

export default function Chart(props: ChartProps) {
  const { kind, categories, series, unit, height = 260, labels = "auto", sliceColors, ariaLabel, legendPosition = "right", onSelect, toolbar = true, forceVisible = false } = props;
  const ec = useRef<ReactEChartsCore>(null);
  const [expanded, setExpanded] = useState(false);
  const [isPrint, setIsPrint] = useState(false);
  const t = useTokens();
  const { ref, visible: nearViewport } = useNearViewport<HTMLDivElement>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBefore = () => setIsPrint(true);
    window.addEventListener("beforeprint", onBefore);
    if (window.matchMedia?.("print").matches) setIsPrint(true);
    return () => window.removeEventListener("beforeprint", onBefore);
  }, []);

  const visible = forceVisible || isPrint || nearViewport;
  const option = useMemo(() => {
    if (!t["--text"]) return null;
    // Short, quiet motion: marks grow in 300 ms on first draw; updates (filters) morph in 200 ms.
    const motion = prefersReducedMotion()
      ? { animation: false }
      : { animationDuration: 300, animationEasing: "cubicOut", animationDurationUpdate: 200, animationEasingUpdate: "cubicOut" };
    const color = (name: string | undefined, i: number) => t[name ?? ""] || t[SLOTS[i % SLOTS.length]];
    const textStyle = { color: t["--text-dim"], fontFamily: "Geist, 'Geist Fallback', system-ui, sans-serif", fontSize: 12 };
    const tooltip = {
      backgroundColor: t["--surface"], borderColor: t["--border"], borderWidth: 1,
      textStyle: { color: t["--text"], fontSize: 12, fontFamily: textStyle.fontFamily }, padding: [8, 10],
      extraCssText: "box-shadow:0 0 0 1px rgba(24,24,27,.04),0 8px 24px -6px rgba(24,24,27,.18);border-radius:10px;border:0;",
    };
    const multi = series.length >= 2;
    const legend = multi ? { type: "plain", top: 0, left: 0, right: toolbar ? 88 : 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 10, textStyle } : undefined;
    // Reserve room for a wrapped legend: ~3 short names fit per row in a narrow card.
    const legendRows = multi ? Math.ceil(series.length / 2) : 0;

    if (kind === "donut") {
      const total = series[0]?.data.reduce<number>((a, b) => a + (b ?? 0), 0) || 1;
      return {
        ...motion,
        tooltip: { ...tooltip, trigger: "item", valueFormatter: undefined,
          formatter: (p: { name: string; value: number; marker: string }) => `${p.marker} ${esc(p.name)}<br/><b>${esc(p.value)}</b> · ${Math.round((p.value / total) * 100)}%` },
        legend: { ...(legendPosition === "bottom" ? { orient: "horizontal", bottom: 0, left: 0, right: 0, type: "plain", itemGap: 8 } : { orient: "vertical", right: 0, top: "middle" }), icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle,
          formatter: (name: string) => {
            const i = categories.indexOf(name);
            const v = series[0].data[i] ?? 0;
            return legendPosition === "bottom" ? `${name} ${v}` : `${name}  ${v} · ${Math.round((v / total) * 100)}%`;
          } },
        series: [{
          type: "pie", radius: legendPosition === "bottom" ? ["40%", "56%"] : ["58%", "78%"], center: legendPosition === "bottom" ? ["50%", "34%"] : ["28%", "50%"], avoidLabelOverlap: true,
          label: { show: true, position: "center", formatter: () => `${total}`, fontSize: 22, fontWeight: 600, color: t["--text"], fontFamily: "Geist, system-ui, sans-serif" },
          labelLine: { show: false },
          itemStyle: { borderColor: t["--surface"], borderWidth: 2, borderRadius: 3 },
          emphasis: { scale: true, scaleSize: 3, label: { show: true } },
          data: categories.map((c, i) => ({ name: c, value: series[0].data[i] ?? 0, itemStyle: { color: color(sliceColors?.[i], i) } })),
        }],
      };
    }

    const horizontal = kind === "bar";
    const catAxis = {
      type: "category", data: categories,
      axisLine: { lineStyle: { color: t["--border"] } }, axisTick: { show: false },
      axisLabel: { ...textStyle, color: t["--text-muted"], hideOverlap: true, width: horizontal ? 120 : undefined, overflow: "truncate" },
    };
    const valAxis = {
      type: "value", splitLine: { lineStyle: { color: t["--grid"], type: [3, 3] } }, axisLine: { show: false },
      axisLabel: { ...textStyle, color: t["--text-muted"], hideOverlap: true, formatter: (v: number) => formatValue(v, unit) },
      splitNumber: horizontal ? 3 : 5,
    };
    const showLabels = labels === "all" || (labels === "auto" && !multi && categories.length <= 12 && kind !== "line");
    const mainCount = series.filter((x) => !x.compare).length;
    const s = series.map((sr, i) => {
      const c = mainCount === 1 && !sr.color && !sr.compare ? t["--single"] : color(sr.color, i);
      if (sr.compare) {
        return {
          name: sr.name, type: "line", data: sr.data, showSymbol: false, symbolSize: 8, connectNulls: true, z: 5,
          lineStyle: { width: 2, type: "dashed", color: t["--neutral-1"] }, itemStyle: { color: t["--neutral-1"] },
        };
      }
      if (kind === "line") {
        const points = sr.data.filter((v) => v !== null && v !== undefined).length;
        const sparse = points < sr.data.length || points <= 24;
        return {
          name: sr.name, type: "line", data: sr.data, smooth: 0.2, smoothMonotone: "x", connectNulls: true, showSymbol: sparse,
          symbol: "circle", symbolSize: sparse ? 6 : 8, lineStyle: { width: 2, color: c }, itemStyle: { color: c, borderColor: t["--surface"], borderWidth: 2 },
          // A faint wash under a single line gives it weight without adding a second colour.
          areaStyle: mainCount === 1 ? { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${c}26` }, { offset: 1, color: `${c}00` }] } } : undefined,
          emphasis: { focus: "series" },
        };
      }
      return {
        name: sr.name, type: "bar", data: sr.data, stack: kind === "stacked" ? "total" : undefined,
        barMaxWidth: horizontal ? 18 : 28, barGap: "12%",
        itemStyle: {
          color: c, borderColor: t["--surface"], borderWidth: kind === "stacked" || multi ? 1 : 0,
          borderRadius: kind === "stacked" ? 0 : horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0],
        },
        label: showLabels ? {
          show: true, position: horizontal ? "right" : "top", color: t["--text"], fontSize: 12, fontWeight: 500,
          formatter: (p: { value: number }) => (p.value ? formatValue(p.value, unit) : ""),
        } : { show: false },
        emphasis: { focus: multi ? "series" : "none" },
      };
    });
    return {
      ...motion,
      legend,
      tooltip: {
        ...tooltip, trigger: "axis",
        axisPointer: { type: kind === "line" ? "line" : "shadow", lineStyle: { color: t["--border-strong"], type: [3, 3] }, shadowStyle: { color: "rgba(24,24,27,.04)" } },
        formatter: (ps: TipParam[] | TipParam) => {
          const arr = Array.isArray(ps) ? ps : [ps];
          const head = esc(arr[0]?.axisValueLabel ?? arr[0]?.name ?? "");
          const rows = arr.filter((p) => p.value !== null && p.value !== undefined)
            .map((p) => `${p.marker} ${esc(p.seriesName)} <b style="float:right;margin-left:16px">${esc(formatValue(p.value, unit))}</b>`).join("<br/>");
          return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${rows || "No calls"}`;
        },
      },
      grid: { left: 8, right: horizontal ? 48 : 12, top: multi ? 12 + legendRows * 20 : 16, bottom: 4, containLabel: true },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? { ...catAxis, inverse: true } : valAxis,
      series: s,
    };
  }, [t, kind, categories, series, unit, labels, sliceColors, legendPosition, toolbar]);

  // Reserve the chart's exact height before it draws, so nothing below it jumps.
  if (!option || !visible) {
    return <div ref={ref} role="img" aria-label={ariaLabel} aria-busy="true" style={{ height }} className="skeleton rounded-lg opacity-60" />;
  }
  return (
    <div ref={ref} className="chart-enter group/chart relative">
      {toolbar && (
        <div className="print:hidden no-print">
          <ChartToolbar
            onExpand={() => setExpanded(true)}
            onPng={() => downloadPng(ec.current, ariaLabel)}
            onCsv={() => downloadCsv(kind, categories, series, ariaLabel)}
          />
        </div>
      )}
      {expanded && (
        <ExpandedChart title={ariaLabel} onClose={() => setExpanded(false)}>
          <Chart {...props} toolbar={false} height={Math.max(320, Math.min(560, Math.round(window.innerHeight * 0.6)))} />
        </ExpandedChart>
      )}
      <div role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        ref={ec}
        echarts={echarts}
        option={option}
        style={{ height, width: "100%" }}
        notMerge
        lazyUpdate
        opts={{ renderer: "svg" }}
        onEvents={onSelect ? { click: (p: { name: string; seriesName: string }) => onSelect(p.name, p.seriesName) } : undefined}
      />
      </div>
    </div>
  );
}

// ───────────── Chart toolbar: expand, PNG, CSV ─────────────

const fileName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chart";

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterise the chart's SVG at 2x on a white background. */
function downloadPng(chart: ReactEChartsCore | null, title: string) {
  const inst = chart?.getEchartsInstance();
  if (!inst) return;
  const svgUrl = inst.getDataURL({ type: "svg", backgroundColor: "#ffffff" });
  const w = inst.getWidth(), h = inst.getHeight(), scale = 2;
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement("canvas"), { width: w * scale, height: h * scale });
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) { saveBlob(b, `${fileName(title)}.png`); toast("Chart downloaded"); } }, "image/png");
  };
  img.onerror = () => toast("Couldn't export this chart", "error");
  img.src = svgUrl;
}

/** The chart's numbers as CSV (guarded against spreadsheet formula injection). */
function downloadCsv(kind: ChartKind, categories: string[], series: ChartSeries[], title: string) {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = kind === "donut" ? ["Value"] : series.map((x) => x.name);
  const rows = [["Category", ...cols], ...categories.map((c, i) => [c, ...series.slice(0, cols.length).map((x) => x.data[i])])];
  saveBlob(new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }), `${fileName(title)}.csv`);
  toast("Data downloaded");
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
    </button>
  );
}

function ChartToolbar({ onExpand, onPng, onCsv }: { onExpand: () => void; onPng: () => void; onCsv: () => void }) {
  return (
    <div className="absolute -top-1 right-0 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200/70 bg-white/95 p-0.5 opacity-0 shadow-card backdrop-blur transition-opacity duration-150 group-hover/chart:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      <ToolButton label="Expand chart" onClick={onExpand}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></ToolButton>
      <ToolButton label="Download as PNG" onClick={onPng}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></ToolButton>
      <ToolButton label="Download data (CSV)" onClick={onCsv}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></ToolButton>
    </div>
  );
}

function ExpandedChart({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-center justify-center p-4 sm:p-8" role="presentation">
      <div className="palette-fade absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="palette-in relative w-full max-w-6xl rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-pop">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
          <button onClick={onClose} autoFocus aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
