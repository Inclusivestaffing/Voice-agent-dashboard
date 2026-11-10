"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState, useRef, useEffect, useTransition } from "react";
import { RANGE_PRESETS, DEFAULT_RANGE } from "@/lib/filters";
import { OUTCOMES, OUTCOME_LABEL, ROOT_CAUSES, ROOT_CAUSE_LABEL } from "@/lib/types";
import { cx, humanize } from "../ui";
import { saveView, deleteView } from "@/app/actions";
import { useApp } from "@/components/context/AppContext";
import { toast } from "@/components/feedback/Toaster";

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
  const { openAskAi } = useApp();

  const [dateOpen, setDateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("Base");

  const dateRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const params = useMemo(() => new URLSearchParams(sp.toString()), [sp]);
  const range = params.get("range") || DEFAULT_RANGE;
  const currentPreset = RANGE_PRESETS.find((r) => r.id === range);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false);
      }
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
    !fields?.length ? <p className="text-xs text-slate-500 col-span-full">{empty}</p> : fields.map((fld) => (
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
          {/* 1. Date Range Button matching Retell AI styling */}
          <div className="relative" ref={dateRef}>
            <button
              type="button"
              onClick={() => {
                setDateOpen((v) => !v);
                setFilterOpen(false);
              }}
              aria-expanded={dateOpen}
              className={cx(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl border transition shadow-xs",
                dateOpen
                  ? "bg-slate-100 border-slate-400 text-slate-900 font-semibold"
                  : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              )}
            >
              {/* Calendar Icon */}
              <svg className="w-4 h-4 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Date Range</span>
              {currentPreset && range !== "custom" ? (
                <span className="text-xs text-slate-400 font-normal">· {currentPreset.short}</span>
              ) : range === "custom" && (
                <span className="text-xs text-slate-400 font-normal">· Custom</span>
              )}
              <svg className="w-3.5 h-3.5 text-slate-400 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {/* Date Range Dropdown Popover */}
            {dateOpen && (
              <div className="absolute left-0 mt-2 z-40 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-pop p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Select Date Range</span>
                  {timezone && (
                    <span className="text-[11px] text-slate-400 font-medium">{timezone}</span>
                  )}
                </div>

                {/* Presets Grid */}
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Date range presets">
                  {RANGE_PRESETS.map((r) => {
                    const isSelected = range === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          const n = new URLSearchParams(params);
                          n.set("range", r.id);
                          if (r.id !== "custom") {
                            n.delete("from");
                            n.delete("to");
                            n.delete("ft");
                            n.delete("tt");
                          }
                          push(n);
                          if (r.id !== "custom") setDateOpen(false);
                        }}
                        className={cx(
                          "px-2.5 py-1.5 text-xs font-semibold rounded-xl border text-center transition",
                          isSelected
                            ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                            : "bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                        )}
                      >
                        {r.short}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Date Pickers */}
                {range === "custom" && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="text-xs font-medium text-slate-600">Custom Start & End Dates</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-0.5">Start Date</label>
                        <input
                          type="date"
                          value={params.get("from") ?? ""}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const n = new URLSearchParams(params);
                            n.set("range", "custom");
                            n.set("from", e.target.value);
                            if (!n.get("to")) n.set("to", e.target.value);
                            push(n);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-0.5">End Date</label>
                        <input
                          type="date"
                          value={params.get("to") ?? ""}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const n = new URLSearchParams(params);
                            n.set("range", "custom");
                            n.set("to", e.target.value);
                            if (!n.get("from")) n.set("from", e.target.value);
                            push(n);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Times evaluated in {timezone || "local"}</span>
                  <button
                    type="button"
                    onClick={() => setDateOpen(false)}
                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Filter Button matching Retell AI styling */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
                setDateOpen(false);
              }}
              aria-expanded={filterOpen}
              className={cx(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl border transition shadow-xs",
                filterOpen || active.length > 0
                  ? "bg-slate-100 border-slate-400 text-slate-900 font-semibold"
                  : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              )}
            >
              {/* Funnel Icon */}
              <svg className="w-4 h-4 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
                <line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              <span>Filter</span>
              {active.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-slate-900 text-white text-[11px] font-bold">
                  {active.length}
                </span>
              )}
              <svg className="w-3.5 h-3.5 text-slate-400 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {/* Filter Dropdown Popover */}
            {filterOpen && (
              <div className="absolute left-0 mt-2 z-40 w-80 sm:w-[500px] bg-white border border-slate-200 rounded-2xl shadow-pop p-4 space-y-4 animate-in fade-in zoom-in-95 duration-100 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Filters</span>
                    {active.length > 0 && (
                      <span className="text-[11px] font-medium text-slate-500">({active.length} active)</span>
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
                      className="text-xs font-semibold px-2.5 py-1 bg-slate-900 text-white rounded-xl hover:bg-slate-800"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {/* Quick Search */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Search Transcript
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      set("q", String(new FormData(e.currentTarget).get("q") ?? ""));
                    }}
                    className="relative flex items-center"
                  >
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      name="q"
                      defaultValue={params.get("q") ?? ""}
                      placeholder="Search keywords in call transcripts…"
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </form>
                </div>

                {/* Agent Selector */}
                {options.agents.length > 0 && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
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
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
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
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
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
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex border-b border-slate-200 gap-2 mb-3">
                    {TABS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={cx(
                          "pb-1.5 text-xs font-semibold border-b-2 transition -mb-px",
                          tab === t
                            ? "border-slate-900 text-slate-900"
                            : "border-transparent text-slate-400 hover:text-slate-700"
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

        {/* 3. Share + Ask AI on the right */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try { await navigator.clipboard.writeText(window.location.href); toast("Link copied: it opens this exact view"); }
              catch { toast("Couldn't copy. Copy the address bar instead.", "error"); }
            }}
            title="Copy a link to this view (filters and date range included)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-sm font-medium shadow-xs"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            <span className="hidden sm:inline">Copy link</span>
          </button>
          <button
            type="button"
            onClick={() => openAskAi()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 text-sm font-semibold transition shadow-xs group"
          >
            <span className="text-purple-600 group-hover:scale-110 transition-transform">✨</span>
            <span>Ask AI</span>
          </button>
        </div>
      </div>

      {/* Active Filter Chips Row */}
      {active.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-xs text-slate-400 font-medium mr-1">Active filters:</span>
          {active.map((a) => (
            <button
              key={a.k}
              type="button"
              onClick={() => removeActive(a.k)}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/90 rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-800 transition"
            >
              <span>{a.label}</span>
              <span className="font-bold text-slate-400 hover:text-rose-600 text-xs" aria-hidden>×</span>
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
      <legend className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</legend>
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
        "px-2.5 py-1 text-xs font-medium rounded-xl border transition shadow-2xs",
        on
          ? "bg-slate-900 border-slate-900 text-white font-semibold shadow-xs"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}
