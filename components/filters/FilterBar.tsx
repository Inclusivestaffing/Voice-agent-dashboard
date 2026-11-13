"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState, useRef, useEffect, useTransition } from "react";
import { DEFAULT_RANGE } from "@/lib/filters";
import DateRangePicker, { FILTER_PRESETS } from "./DateRangePicker";
import { OUTCOMES, OUTCOME_LABEL, ROOT_CAUSES, ROOT_CAUSE_LABEL } from "@/lib/types";
import { cx, humanize } from "../ui";
import { saveView, deleteView } from "@/app/actions";

export interface FieldOption { key: string; values: string[] }
export interface FilterOptions {
  agents: { id: string; name: string }[];
  versions: { id: string; name: string }[];
  disconnections: string[];
  customFields: FieldOption[];
  metadataFields?: FieldOption[];
  dynamicFields?: FieldOption[];
}

interface Props {
  workspaceId: string;
  options: FilterOptions;
  savedViews?: { id: string; name: string; query: string }[];
  compact?: boolean;
  timezone?: string;
}

const TABS = ["Base", "Post Call Extraction", "Metadata", "Dynamic Variables", "AI analysis"] as const;
type Tab = (typeof TABS)[number];

const SCALARS: [string, string][] = [
  ["success", "Call successful"], ["min_dur", "Min duration (s)"], ["max_dur", "Max duration (s)"], ["min_cost", "Min cost $"], ["max_cost", "Max cost $"],
  ["min_lat", "Min latency ms"], ["max_lat", "Max latency ms"], ["min_score", "Min AI score"], ["max_score", "Max AI score"], ["from_number", "From"], ["to_number", "To"],
  ["call_id", "Session ID"], ["transfer", "Transfer agent"], ["batch_call_id", "Batch call ID"], ["q", "Transcript"]
];

export default function FilterBar({ workspaceId, options, savedViews = [], compact, timezone }: Props) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const [filterOpen, setFilterOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("Base");

  const filterRef = useRef<HTMLDivElement>(null);

  const params = useMemo(() => new URLSearchParams(sp.toString()), [sp]);
  const range = params.get("range") || DEFAULT_RANGE;

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function push(next: URLSearchParams) {
    next.delete("page");
    start(() => router.push(`${path}?${next.toString()}`, { scroll: false }));
  }

  function set(k: string, v: string | null) {
    const n = new URLSearchParams(params);
    if (v === null || v === "") n.delete(k); else n.set(k, v);
    push(n);
  }

  function toggle(k: string, v: string) {
    const cur = (params.get(k) || "").split(",").filter(Boolean);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    set(k, next.join(","));
  }

  const selected = (k: string) => (params.get(k) || "").split(",").filter(Boolean);

  const labelFor: Record<string, (v: string) => string> = {
    agent: (v) => options.agents.find((a) => a.id === v)?.name ?? v,
    version: (v) => options.versions.find((a) => a.id === v)?.name ?? v,
    outcome: (v) => OUTCOME_LABEL[v as keyof typeof OUTCOME_LABEL] ?? v,
    root_cause: (v) => ROOT_CAUSE_LABEL[v as keyof typeof ROOT_CAUSE_LABEL] ?? v,
    call_type: (v) => (v === "web_call" ? "Web call" : "Phone call"),
  };

  const active: { k: string; label: string }[] = [];
  for (const k of ["agent", "version", "call_type", "direction", "status", "outcome", "sentiment", "disconnection", "root_cause"]) {
    for (const v of selected(k)) active.push({ k: `${k}=${v}`, label: `${humanize(k)}: ${(labelFor[k] ?? humanize)(v)}` });
  }
  for (const [k, l] of SCALARS) { const v = params.get(k); if (v) active.push({ k, label: `${l}: ${v}` }); }
  for (const [k, v] of params.entries()) {
    if (k.startsWith("cf.")) active.push({ k, label: `${humanize(k.slice(3))}: ${v}` });
    if (k.startsWith("md.")) active.push({ k, label: `Metadata ${k.slice(3)}: ${v}` });
    if (k.startsWith("dv.")) active.push({ k, label: `Variable ${k.slice(3)}: ${v}` });
  }

  function removeActive(key: string) {
    const [k, v] = key.split("=");
    if (v !== undefined) toggle(k, v); else set(k, null);
  }

  const keyedGroups = (prefix: string, fields: FieldOption[] | undefined, empty: string) =>
    !fields?.length ? <p className="text-xs text-zinc-500 col-span-full">{empty}</p> : fields.map((fld) => (
      <Group key={fld.key} title={humanize(fld.key)}>
        {fld.values.map((v) => <Chip key={v} on={params.get(`${prefix}${fld.key}`) === v} onClick={() => set(`${prefix}${fld.key}`, params.get(`${prefix}${fld.key}`) === v ? null : v)}>{v}</Chip>)}
      </Group>
    ));

  return (
    <div className="mb-5 space-y-2.5" aria-busy={pending}>
      {/* Keep the controls crisp while results load; a thin bar at the top shows progress. */}
      {pending && <div className="progress-bar" role="progressbar" aria-label="Updating results" />}
      {/* Top Header Buttons: [ Date Range ] [ Filter ] [ Ask AI ] */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 1. Date range (Retell-style calendar; applies on "Apply") */}
          <DateRangePicker
            presets={FILTER_PRESETS}
            timezone={timezone}
            showTime
            value={{
              preset: range === "custom" ? null : range,
              from: range === "custom" ? params.get("from") : null,
              to: range === "custom" ? params.get("to") : null,
              fromTime: params.get("ft") ?? undefined,
              toTime: params.get("tt") ?? undefined,
            }}
            onApply={(v) => {
              const n = new URLSearchParams(params);
              for (const k of ["from", "to", "ft", "tt"]) n.delete(k);
              if (v.preset) n.set("range", v.preset);
              else if (v.from && v.to) {
                n.set("range", "custom"); n.set("from", v.from); n.set("to", v.to);
                if (v.fromTime && v.fromTime !== "00:00") n.set("ft", v.fromTime);
                if (v.toTime && v.toTime !== "23:59") n.set("tt", v.toTime);
              }
              push(n);
            }}
          />

          {/* 2. Filter Button matching Retell AI styling */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
              }}
              aria-expanded={filterOpen}
              className={cx(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition shadow-xs",
                filterOpen || active.length > 0
                  ? "bg-zinc-100 border-zinc-400 text-zinc-900 font-semibold"
                  : "bg-white border-zinc-200/90 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300"
              )}
            >
              {/* Funnel Icon */}
              <svg className="w-4 h-4 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
                <line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              <span>Filter</span>
              {active.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-900 text-white text-[11px] font-semibold">
                  {active.length}
                </span>
              )}
              <svg className="w-3.5 h-3.5 text-zinc-400 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {/* Filter Dropdown Popover */}
            {filterOpen && (
              <div className="absolute left-0 mt-2 z-40 w-80 sm:w-[500px] bg-white border border-zinc-200 rounded-xl shadow-pop p-4 space-y-4 animate-in fade-in zoom-in-95 duration-100 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900">Filters</span>
                    {active.length > 0 && (
                      <span className="text-[11px] font-medium text-zinc-500">({active.length} active)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {active.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const n = new URLSearchParams();
                          for (const k of ["range", "from", "to", "ft", "tt", "bucket", "compare", "breakdown"]) {
                            const v = params.get(k);
                            if (v) n.set(k, v);
                          }
                          push(n);
                        }}
                        className="text-xs text-rose-600 hover:underline font-semibold"
                      >
                        Reset all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="text-xs font-semibold px-2.5 py-1 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {/* Quick Search */}
                <div>
                  <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                    Search Transcript
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      set("q", String(new FormData(e.currentTarget).get("q") ?? ""));
                    }}
                    className="relative flex items-center"
                  >
                    <svg className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      name="q"
                      defaultValue={params.get("q") ?? ""}
                      placeholder="Search keywords in call transcripts…"
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50/50 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </form>
                </div>

                {/* Agent Selector */}
                {options.agents.length > 0 && (
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                      Voice Agent
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip on={selected("agent").length === 0} onClick={() => set("agent", null)}>
                        All Agents
                      </Chip>
                      {options.agents.map((a) => (
                        <Chip key={a.id} on={selected("agent").includes(a.id)} onClick={() => toggle("agent", a.id)}>
                          {a.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outcome Quick Filter */}
                <div>
                  <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                    Call Outcome
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {OUTCOMES.map((o) => (
                      <Chip key={o} on={selected("outcome").includes(o)} onClick={() => toggle("outcome", o)}>
                        {OUTCOME_LABEL[o]}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Sentiment Filter */}
                <div>
                  <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                    Caller Sentiment
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {["Positive", "Neutral", "Negative"].map((s) => (
                      <Chip key={s} on={selected("sentiment").includes(s)} onClick={() => toggle("sentiment", s)}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Advanced Tabbed Filters */}
                <div className="pt-2 border-t border-zinc-100">
                  <div className="flex border-b border-zinc-200 gap-2 mb-3">
                    {TABS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={cx(
                          "pb-1.5 text-xs font-semibold border-b-2 transition -mb-px",
                          tab === t
                            ? "border-zinc-900 text-zinc-900"
                            : "border-transparent text-zinc-400 hover:text-zinc-700"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {tab === "Base" && (
                    <div className="space-y-3">
                      <Group title="Call Type & Direction">
                        {[["web_call", "Web call"], ["phone_call", "Phone call"]].map(([v, l]) => (
                          <Chip key={v} on={selected("call_type").includes(v)} onClick={() => toggle("call_type", v)}>
                            {l}
                          </Chip>
                        ))}
                        {["inbound", "outbound"].map((d) => (
                          <Chip key={d} on={selected("direction").includes(d)} onClick={() => toggle("direction", d)}>
                            {humanize(d)}
                          </Chip>
                        ))}
                      </Group>

                      {options.disconnections.length > 0 && (
                        <Group title="Disconnection reason">
                          {options.disconnections.map((d) => (
                            <Chip key={d} on={selected("disconnection").includes(d)} onClick={() => toggle("disconnection", d)}>
                              {humanize(d)}
                            </Chip>
                          ))}
                        </Group>
                      )}
                    </div>
                  )}

                  {tab === "Post Call Extraction" && keyedGroups("cf.", options.customFields, "No custom extraction fields found.")}
                  {tab === "Metadata" && keyedGroups("md.", options.metadataFields, "No metadata fields found.")}
                  {tab === "Dynamic Variables" && keyedGroups("dv.", options.dynamicFields, "No dynamic variables found.")}

                  {tab === "AI analysis" && (
                    <div className="space-y-3">
                      <Group title="Root causes">
                        {ROOT_CAUSES.filter((r) => r !== "none").map((r) => (
                          <Chip key={r} on={selected("root_cause").includes(r)} onClick={() => toggle("root_cause", r)}>
                            {ROOT_CAUSE_LABEL[r]}
                          </Chip>
                        ))}
                      </Group>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Active Filter Chips Row */}
      {active.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-xs text-zinc-400 font-medium mr-1">Active filters:</span>
          {active.map((a) => (
            <button
              key={a.k}
              type="button"
              onClick={() => removeActive(a.k)}
              className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/90 rounded-full px-2.5 py-0.5 text-xs font-medium text-zinc-800 transition"
            >
              <span>{a.label}</span>
              <span className="font-semibold text-zinc-400 hover:text-rose-600 text-xs" aria-hidden>×</span>
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const n = new URLSearchParams();
              for (const k of ["range", "from", "to", "ft", "tt", "bucket", "compare", "breakdown"]) {
                const v = params.get(k);
                if (v) n.set(k, v);
              }
              push(n);
            }}
            className="text-xs font-semibold text-rose-600 hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[11px] font-semibold text-zinc-500 mb-1.5">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "px-2.5 py-1 text-xs font-medium rounded-lg border transition shadow-2xs",
        on
          ? "bg-zinc-900 border-zinc-900 text-white font-semibold shadow-xs"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {children}
    </button>
  );
}
