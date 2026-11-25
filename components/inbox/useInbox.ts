"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxEntry, InboxPayload } from "@/lib/inbox/types";

const SAMPLE_KEY = "va_inbox_sample_read";
const readSampleIds = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(SAMPLE_KEY) ?? "[]") as string[]); } catch { return new Set(); }
};
const writeSampleIds = (ids: Set<string>) => {
  try { localStorage.setItem(SAMPLE_KEY, JSON.stringify([...ids].slice(-200))); } catch { /* private mode: fine */ }
};

/**
 * The inbox in the browser: loads /api/inbox, refreshes every minute and when the tab comes back,
 * and keeps read state (sample items are remembered in this browser only).
 */
export function useInbox(initial: InboxPayload | null = null, limit = 40) {
  const [data, setData] = useState<InboxPayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [sampleRead, setSampleRead] = useState<Set<string>>(new Set());
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/inbox?limit=${limit}`, { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) { setData(null); setError(null); return; }
      if (!res.ok) throw new Error("Couldn't load the inbox.");
      setData((await res.json()) as InboxPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the inbox.");
    } finally { busy.current = false; }
  }, [limit]);

  useEffect(() => {
    setSampleRead(readSampleIds());
    if (!initial) refresh();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh, initial]);

  const isUnread = useCallback((it: InboxEntry) => (it.sample ? !sampleRead.has(it.id) : !it.read_at), [sampleRead]);

  const post = useCallback(async (body: unknown) => {
    const res = await fetch("/api/inbox", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("Couldn't update the inbox.");
  }, []);

  /** Optimistic: the UI changes first, the server catches up. */
  const setRead = useCallback(async (items: InboxEntry[], read: boolean) => {
    const sample = items.filter((i) => i.sample), real = items.filter((i) => !i.sample);
    if (sample.length) {
      setSampleRead((prev) => {
        const next = new Set(prev);
        for (const i of sample) { if (read) next.add(i.id); else next.delete(i.id); }
        writeSampleIds(next);
        return next;
      });
    }
    if (!real.length) return;
    const ids = new Set(real.map((i) => i.id));
    const now = new Date().toISOString();
    setData((d) => d && {
      ...d,
      items: d.items.map((i) => (ids.has(i.id) ? { ...i, read_at: read ? now : null } : i)),
      unread: Math.max(0, d.unread + (read ? -1 : 1) * real.filter((i) => !!i.read_at !== read).length),
    });
    try { await post({ action: read ? "read" : "unread", ids: [...ids] }); } catch { refresh(); }
  }, [post, refresh]);

  const readAll = useCallback(async () => {
    if (!data) return;
    const sample = data.items.filter((i) => i.sample);
    if (sample.length) setRead(sample, true);
    if (!data.unread) return;
    const now = new Date().toISOString();
    setData((d) => d && { ...d, unread: 0, items: d.items.map((i) => (i.sample || i.read_at ? i : { ...i, read_at: now })) });
    try { await post({ action: "read_all" }); } catch { refresh(); }
  }, [data, post, refresh, setRead]);

  const unread = (data?.unread ?? 0) + (data?.items.filter((i) => i.sample && !sampleRead.has(i.id)).length ?? 0);
  return { data, error, unread, isUnread, setRead, readAll, refresh };
}
