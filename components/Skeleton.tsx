// Loading skeletons used by every route's loading.tsx. Navigation shows one immediately (inside
// the persistent sidebar layout) while the server renders, so a click never looks ignored.
// Each skeleton mirrors the real page's geometry to avoid layout shift when content arrives.

import { cx } from "./ui";

export function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cx("skeleton rounded-md", className)} style={style} />;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="skeleton-enter">
      <span className="sr-only">Loading {label}…</span>
      {children}
    </div>
  );
}

function Header({ tabs = false, toolbar = true }: { tabs?: boolean; toolbar?: boolean }) {
  return (
    <>
      <div className="mb-4 space-y-2">
        <Bone className="h-3 w-56" />
        <Bone className="h-7 w-72" />
      </div>
      {tabs && (
        <div className="flex gap-6 border-b border-slate-200/90 mb-5 pb-2.5">
          <Bone className="h-5 w-24" /><Bone className="h-5 w-20" />
        </div>
      )}
      {toolbar && (
        <div className="flex gap-2 mb-6">
          <Bone className="h-9 w-32 rounded-lg" /><Bone className="h-9 w-24 rounded-lg" />
        </div>
      )}
    </>
  );
}

function CardBone({ h = 260 }: { h?: number }) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs">
      <Bone className="h-4 w-40 mb-2" />
      <Bone className="h-3 w-56 mb-5" />
      <Bone className="w-full rounded-lg" style={{ height: h }} />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <Frame label="analytics">
      <Header tabs />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs">
            <Bone className="h-4 w-28 mb-4" /><Bone className="h-9 w-24" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs">
            <Bone className="h-4 w-40 mb-5" />
            <Bone className="w-full rounded-lg" style={{ height: 240 }} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function TableSkeleton({ label = "calls" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Header />
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="flex gap-6 px-4 py-3 border-b border-slate-200/80 bg-slate-50/70">
          {[96, 64, 80, 56, 72, 48].map((w, i) => <Bone key={i} className="h-3" style={{ width: w }} />)}
        </div>
        {Array.from({ length: 10 }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 py-3.5 border-b border-slate-100 last:border-0">
            {[96, 64, 80, 56, 72, 48].map((w, i) => <Bone key={i} className="h-3.5" style={{ width: w + ((r * 7 + i * 13) % 24) }} />)}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function DetailSkeleton() {
  return (
    <Frame label="call">
      <div className="mb-5 space-y-2"><Bone className="h-3 w-40" /><Bone className="h-7 w-80" /></div>
      <div className="grid lg:grid-cols-[1fr_380px] gap-5">
        <div className="space-y-5">
          <CardBone h={120} />
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cx("flex", i % 2 ? "justify-end" : "")}>
                <Bone className="h-12 rounded-xl" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-5"><CardBone h={160} /><CardBone h={120} /></div>
      </div>
    </Frame>
  );
}

export function InsightsSkeleton() {
  return (
    <Frame label="insights">
      <Header tabs />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs">
            <div className="flex justify-between mb-4"><Bone className="h-5 w-56" /><Bone className="h-5 w-16 rounded-full" /></div>
            <Bone className="h-3.5 w-full mb-2" /><Bone className="h-3.5 w-4/5 mb-2" /><Bone className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function FormSkeleton({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <Header toolbar={false} />
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4 max-w-3xl">
        <Bone className="h-4 w-44" />
        <div className="grid sm:grid-cols-3 gap-3">
          <Bone className="h-10 rounded-lg" /><Bone className="h-10 rounded-lg" /><Bone className="h-10 rounded-lg" />
        </div>
        <Bone className="h-9 w-36 rounded-lg" />
      </div>
    </Frame>
  );
}
