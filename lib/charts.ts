import { METRICS, DIMENSIONS, timeSeries, breakdownTotals, computeMetric, type AnalyticsCall, type Bucket, type Dimension, type Measure } from "./metrics/aggregate";
import type { ChartKind } from "@/components/charts/Chart";
import { OUTCOME_LABEL, ROOT_CAUSE_LABEL, type Outcome, type RootCause } from "./types";

export interface ChartConfig {
  metric: string;
  measure: Measure;
  kind: ChartKind | "number";
  bucket?: Bucket | "none";
  breakdown?: Dimension | "";
}

export interface RenderedChart {
  kind: ChartKind | "number";
  categories: string[];
  series: { name: string; data: (number | null)[] }[];
  unit?: string;
  number?: number | null;
}

/** Bucket from the URL if valid, otherwise picked from the range length (keeps charts under ~100 points). */
export function parseBucket(v: string | undefined, from: string, to: string): Bucket {
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  if (v === "hour" && days <= 14) return "hour";
  if (v === "day" || v === "week" || v === "month") return v;
  return autoBucket(from, to);
}

export function autoBucket(from: string, to: string): Bucket {
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  if (days <= 2) return "hour";
  if (days <= 92) return "day";
  if (days <= 400) return "week";
  return "month";
}

function prettyDim(dim: Dimension | "" | undefined, v: string) {
  if (dim === "outcome") return OUTCOME_LABEL[v as Outcome] ?? v;
  if (dim === "root_cause") return ROOT_CAUSE_LABEL[v as RootCause] ?? v;
  return v.replace(/_/g, " ");
}

/** Turn a saved chart config into chart-ready data. */
export function renderChart(cfg: ChartConfig, calls: AnalyticsCall[], range: { from: string; to: string }, tz: string): RenderedChart {
  const def = METRICS.find((m) => m.id === cfg.metric) ?? METRICS[0];
  const measure = def.measures.includes(cfg.measure) ? cfg.measure : def.measures[0];
  const unit = def.unit === "%" ? "%" : def.unit === "$" ? "$" : def.unit === "s" ? "s" : def.unit === "ms" ? "ms" : "";
  if (cfg.kind === "number") return { kind: "number", categories: [], series: [], unit, number: computeMetric(calls, def, measure) };
  if (cfg.kind === "donut" || ((cfg.kind === "bar" || cfg.kind === "column") && (!cfg.bucket || cfg.bucket === "none"))) {
    const dim = (cfg.breakdown || "outcome") as Dimension;
    const rows = breakdownTotals(calls, def, measure, dim).slice(0, cfg.kind === "donut" ? 8 : 15);
    return { kind: cfg.kind, categories: rows.map((r) => prettyDim(dim, r.name)), series: [{ name: def.label, data: rows.map((r) => r.value) }], unit };
  }
  const bucket = cfg.bucket && cfg.bucket !== "none" ? cfg.bucket : autoBucket(range.from, range.to);
  const ts = timeSeries(calls, def, measure, bucket, range, tz, cfg.breakdown || undefined);
  return {
    kind: cfg.kind,
    categories: ts.x.map((x) => (bucket === "hour" ? x.slice(5) : x.slice(5))),
    series: ts.series.map((s) => ({ ...s, name: cfg.breakdown ? prettyDim(cfg.breakdown, s.name) : s.name })),
    unit,
  };
}

export const METRIC_OPTIONS = METRICS.map((m) => ({ id: m.id, label: m.label, measures: m.measures }));
export const DIMENSION_OPTIONS = DIMENSIONS;
