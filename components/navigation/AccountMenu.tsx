"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { RANK, ROLE_DESC, ROLE_LABEL, VIEW_AS_COOKIE, canEdit, type Role } from "@/lib/roles";
import { signOut } from "@/app/actions";

const PREVIEW_ROLES: Role[] = ["admin", "user", "client"];

/**
 * Account control at the bottom of the left sidebar: who you are, your access level, and a
 * "View as" switch so admins can preview exactly what a User or a Client sees. The preview only
 * ever lowers access; every server action still checks the real role.
 */
export default function AccountMenu({ email, actualRole, role, basePath, demo, placement = "up" }: {
  email: string; actualRole: Role; role: Role; basePath: string; demo?: boolean; placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function viewAs(r: Role) {
    // Choosing your own level (or Admin when you're an owner) clears the preview.
    const clear = RANK[r] >= RANK[actualRole] || (r === "admin" && canEdit(actualRole));
    document.cookie = clear
      ? `${VIEW_AS_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${VIEW_AS_COOKIE}=${r}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    setOpen(false);
    start(() => router.refresh());
  }

  const previewing = role !== actualRole;
  const shownRole: Role = role === "owner" ? "admin" : role;
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cx(
          "w-full flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:bg-slate-100",
          open && "bg-slate-100", pending && "opacity-60"
        )}
      >
        <span className="h-8 w-8 shrink-0 rounded-full bg-slate-900 text-white text-sm font-medium grid place-items-center">{initial}</span>
        <span className="min-w-0 flex-1 hidden lg:block">
          <span className="block text-sm font-medium text-slate-900 truncate">{email}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABEL[role]}{previewing && " · preview"}</span>
        </span>
        <svg className="w-4 h-4 text-slate-400 shrink-0 hidden lg:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
      </button>

      {open && (
        <div
          role="menu"
          className={cx(
            "absolute z-50 w-72 bg-white border border-[#d5d5e8] rounded-2xl shadow-pop p-1.5",
            placement === "up" ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0"
          )}
        >
          <div className="px-3 py-2.5 border-b border-slate-100 mb-1">
            <div className="text-sm font-medium text-slate-900 truncate">{email}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Your access: <span className="font-medium text-slate-700">{ROLE_LABEL[actualRole]}</span>
              {demo && " (demo)"}
            </div>
          </div>

          <div className="px-3 pt-1.5 pb-1 text-xs font-medium text-slate-500">View as</div>
          {PREVIEW_ROLES.filter((r) => (r === "admin" ? canEdit(actualRole) : RANK[r] <= RANK[actualRole])).map((r) => {
            const on = shownRole === r;
            return (
              <button
                key={r}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => viewAs(r)}
                className={cx("w-full flex items-start gap-2.5 rounded-xl px-3 py-2 text-left transition", on ? "bg-slate-100" : "hover:bg-slate-50")}
              >
                <span className={cx("mt-0.5 h-4 w-4 shrink-0 rounded-full border grid place-items-center", on ? "border-slate-900 bg-slate-900" : "border-slate-300")}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{r === "admin" && actualRole === "owner" ? "Admin (owner)" : ROLE_LABEL[r]}</span>
                  <span className="block text-xs text-slate-500 leading-snug">{ROLE_DESC[r]}</span>
                </span>
              </button>
            );
          })}

          <div className="border-t border-slate-100 mt-1 pt-1">
            {!demo && canEdit(actualRole) && (
              <Link role="menuitem" href={`${basePath}/settings#team`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Manage team &amp; roles
              </Link>
            )}
            {!demo && (
              <Link role="menuitem" href="/workspaces" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
                Switch workspace
              </Link>
            )}
            {!demo ? (
              <form action={signOut}>
                <button role="menuitem" type="submit" className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  Sign out
                </button>
              </form>
            ) : (
              <p className="px-3 py-2 text-xs text-slate-500">Demo account. Sign in to a real workspace to manage your team.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
