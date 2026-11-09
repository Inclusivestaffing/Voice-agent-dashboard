"use client";

// One chart component for the whole app, following the dataviz method:
// thin marks with 4px rounded data-ends, 2px surface gaps, recessive grid, hover
// tooltips on every mark, a legend whenever there are ≥2 series, text in ink tokens,
// categorical hues in fixed slot order. Colors come from CSS tokens so dark mode is a
// selected palette, not an automatic flip.

import { useEffect, useMemo, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

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
}

const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const TOKEN_NAMES = ["--surface", "--text", "--text-dim", "--text-muted", "--grid", "--axis", "--single", "--neutral-1", "--neutral-2",
  "--status-good", "--status-warning", "--status-serious", "--status-critical", "--border", ...SLOTS];

function readTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKEN_NAMES.map((n) => [n, cs.getPropertyValue(n).trim()]));
}

function useTokens() {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  useEffect(() => { setTokens(readTokens()); }, []);
  return tokens;
}

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

export default function Chart({ kind, categories, series, unit, height = 260, labels = "auto", sliceColors, ariaLabel, legendPosition = "right", onSelect }: ChartProps) {
  const t = useTokens();
  const option = useMemo(() => {
    if (!t["--text"]) return null;
    const color = (name: string | undefined, i: number) => t[name ?? ""] || t[SLOTS[i % SLOTS.length]];
    const textStyle = { color: t["--text-dim"], fontFamily: "Inter, \"Inter Fallback\", system-ui, sans-serif", fontSize: 12 };
    const tooltip = {
      backgroundColor: t["--surface"], borderColor: t["--border"], borderWidth: 1,
      textStyle: { color: t["--text"], fontSize: 12 }, extraCssText: "box-shadow:0 6px 24px rgba(0,0,0,.12);border-radius:6px;",
    };
    const multi = series.length >= 2;
    const legend = multi ? { type: "plain", top: 0, left: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 10, textStyle } : undefined;
    // Reserve room for a wrapped legend: ~3 short names fit per row in a narrow card.
    const legendRows = multi ? Math.ceil(series.length / 2) : 0;

    if (kind === "donut") {
      const total = series[0]?.data.reduce<number>((a, b) => a + (b ?? 0), 0) || 1;
      return {
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
          label: { show: true, position: "center", formatter: () => `${total}`, fontSize: 24, fontWeight: 500, color: t["--text"], fontFamily: "Inter, system-ui, sans-serif" },
          labelLine: { show: false },
          itemStyle: { borderColor: t["--surface"], borderWidth: 2 },
          emphasis: { scale: true, scaleSize: 4, label: { show: true } },
          data: categories.map((c, i) => ({ name: c, value: series[0].data[i] ?? 0, itemStyle: { color: color(sliceColors?.[i], i) } })),
        }],
      };
    }

    const horizontal = kind === "bar";
    const catAxis = {
      type: "category", data: categories,
      axisLine: { lineStyle: { color: t["--axis"] } }, axisTick: { show: false },
      axisLabel: { ...textStyle, color: t["--text-muted"], hideOverlap: true, width: horizontal ? 120 : undefined, overflow: "truncate" },
    };
    const valAxis = {
      type: "value", splitLine: { lineStyle: { color: t["--grid"] } }, axisLine: { show: false },
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
        return {
          name: sr.name, type: "line", data: sr.data, smooth: false, connectNulls: false, showSymbol: false,
          symbolSize: 8, lineStyle: { width: 2, color: c }, itemStyle: { color: c, borderColor: t["--surface"], borderWidth: 2 },
          emphasis: { focus: "series" },
        };
      }
      return {
        name: sr.name, type: "bar", data: sr.data, stack: kind === "stacked" ? "total" : undefined,
        barMaxWidth: horizontal ? 22 : 36, barGap: "10%",
        itemStyle: {
          color: c, borderColor: t["--surface"], borderWidth: kind === "stacked" || multi ? 1 : 0,
          borderRadius: kind === "stacked" ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        label: showLabels ? {
          show: true, position: horizontal ? "right" : "top", color: t["--text"], fontSize: 12, fontWeight: 500,
          formatter: (p: { value: number }) => (p.value ? formatValue(p.value, unit) : ""),
        } : { show: false },
        emphasis: { focus: multi ? "series" : "none" },
      };
    });
    return {
      animationDuration: 400,
      legend,
      tooltip: {
        ...tooltip, trigger: "axis",
        axisPointer: { type: kind === "line" ? "line" : "shadow", lineStyle: { color: t["--axis"] }, shadowStyle: { color: "rgba(127,127,127,.08)" } },
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
  }, [t, kind, categories, series, unit, labels, sliceColors, legendPosition]);

  if (!option) return <div style={{ height }} aria-busy="true" />;
  return (
    <div role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height, width: "100%" }}
        notMerge
        opts={{ renderer: "svg" }}
        onEvents={onSelect ? { click: (p: { name: string; seriesName: string }) => onSelect(p.name, p.seriesName) } : undefined}
      />
    </div>
  );
}
