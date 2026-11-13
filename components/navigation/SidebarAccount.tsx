import Link from "next/link";
import { cx } from "@/components/ui";

function initials(s: string) {
  const parts = s.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Sidebar footer: the signed-in account (everyone is an Admin). Opens settings. */
export default function SidebarAccount({ email, name, basePath, className }: {
  email: string; name: string; basePath: string; className?: string;
}) {
  return (
    <Link
      href={`${basePath}/settings`}
      className={cx("group w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-zinc-200/50", className)}
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
  );
}
