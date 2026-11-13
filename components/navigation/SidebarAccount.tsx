import Link from "next/link";
import { cx } from "@/components/ui";
import { signOut } from "@/app/unlock/actions";

function initials(s: string) {
  const parts = s.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Sidebar footer: the signed-in account (everyone is an Admin). Opens settings. */
export default function SidebarAccount({ email, name, basePath, className, canLogOut = false }: {
  email: string; name: string; basePath: string; className?: string; canLogOut?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
    <Link
      href={`${basePath}/settings`}
      className={cx("group flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-zinc-200/50", className)}
      title="Account and workspace settings"
    >
      <span className="h-8 w-8 rounded-full bg-white border border-zinc-200 text-zinc-700 font-semibold text-[11px] grid place-items-center shrink-0 shadow-[0_1px_1px_rgb(24_24_27/0.04)]">
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-zinc-900 truncate">{name}</span>
        <span className="block text-[12px] text-zinc-500 truncate" title={email}>Admin</span>
      </span>
    </Link>
    {canLogOut && (
      <form action={signOut}>
        <button type="submit" aria-label="Log out" title="Log out"
          className="h-8 w-8 grid place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
        </button>
      </form>
    )}
    </div>
  );
}
