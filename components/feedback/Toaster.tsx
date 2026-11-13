"use client";

import { useEffect, useState } from "react";

type Tone = "default" | "success" | "error";
interface Toast { id: number; message: string; tone: Tone }

const EVENT = "va:toast";
let seq = 0;

/** Show a short confirmation ("Link copied", "Chart downloaded"). Safe to call from any client code. */
export function toast(message: string, tone: Tone = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, message, tone } }));
}

/** Mount once per layout. Toasts stack bottom-centre, announce politely, and leave after 2.6 s. */
export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((xs) => [...xs.slice(-2), t]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 2600);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-pop">
          {t.tone === "error"
            ? <svg className="h-4 w-4 text-rose-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            : <svg className="h-4 w-4 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
          {t.message}
        </div>
      ))}
    </div>
  );
}
