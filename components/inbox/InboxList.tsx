"use client";

import { useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { INBOX_REASONS, REASON_LABEL, type InboxPayload, type InboxReason } from "@/lib/inbox/types";
import InboxRow from "./InboxRow";
import { useInbox } from "./useInbox";

type Kind = "all" | "unread" | InboxReason | "reports";

/** The full inbox: filter by unread, alert type and workspace; mark read one by one or all at once. */
export default function InboxList({ initial }: { initial: InboxPayload }) {
  const { data, unread, isUnread, setRead, readAll } = useInbox(initial, 300);
  const [kind, setKind] = useState<Kind>("all");
  const [ws, setWs] = useState("");
  const all = useMemo(() => data?.items ?? [], [data]);
  const workspaces = useMemo(() => [...new Map(all.map((i) => [i.ws, i.wsName])).entries()], [all]);
  const count = (k: Kind) => all.filter((i) => match(k, i)).length;
  const match = (k: Kind, i: (typeof all)[number]) =>
    k === "all" ? true : k === "unread" ? isUnread(i) : k === "reports" ? i.kind !== "call" : i.reasons.includes(k);
  const items = all.filter((i) => match(kind, i) && (!ws || i.ws === ws));
  const chips: Kind[] = ["all", "unread", ...INBOX_REASONS, "reports"];
  const label = (k: Kind) => (k === "all" ? "All" : k === "unread" ? "Unread" : k === "reports" ? "Reports & notices" : REASON_LABEL[k]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {chips.map((k) => {
            const n = count(k);
            if (k !== "all" && k !== "unread" && !n) return null;
            return (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={cx("h-8 rounded-lg border px-2.5 text-[12.5px] font-medium", kind === k ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300")}>
                {label(k)} <span className={cx("tabular", kind === k ? "text-zinc-300" : "text-zinc-400")}>{k === "unread" ? unread : n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {workspaces.length > 1 && (
            <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-500">
              <span className="sr-only sm:not-sr-only">Workspace</span>
              <select value={ws} onChange={(e) => setWs(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[12.5px] text-zinc-800">
                <option value="">All workspaces</option>
                {workspaces.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={readAll} disabled={!unread}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
            Mark all read
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white">
        {items.length ? (
          <ul className="divide-y divide-zinc-100">
            {items.map((it) => <InboxRow key={it.id} it={it} unread={isUnread(it)} onOpen={(x) => { if (x.sample) setRead([x], true); }} onToggleRead={(x) => setRead([x], isUnread(x))} />)}
          </ul>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] font-medium text-zinc-900">{kind === "unread" ? "You're all caught up" : "Nothing here"}</p>
            <p className="mt-1 text-[13px] text-zinc-500">{data?.live === false ? "The inbox needs the site's Vercel storage (Upstash Redis)." : "Urgent calls and finished Automation reports from every workspace show up here."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
