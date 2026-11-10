"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { isActive, type NavItem } from "./nav";

/**
 * Optimistic navigation state: the tab you click highlights on the same frame (well under the
 * 100 ms "feels instant" limit), instead of waiting for the server to answer.
 */
export function useOptimisticNav() {
  const path = usePathname();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => { setTarget(null); }, [path]);
  return {
    isCurrent: (it: NavItem) => (target ? target === it.href : isActive(path, it)),
    select: (it: NavItem) => (e: React.MouseEvent) => {
      // Let modified clicks open a new tab as usual.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (path !== it.href) setTarget(it.href);
    },
  };
}

/** Small spinner shown inside a link while its page is loading. Delayed so fast loads never flicker. */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx(
        "ml-auto h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent opacity-0",
        pending && "link-pending",
        className
      )}
    />
  );
}

/** Sidebar / tab link with optimistic active state and a pending spinner. */
export function NavLink({ it, href, current, onSelect, className, activeClass, idleClass }: {
  it: NavItem; href: string; current: boolean; onSelect: (e: React.MouseEvent) => void;
  className: string; activeClass: string; idleClass: string;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      aria-current={current ? "page" : undefined}
      className={cx(className, current ? activeClass : idleClass)}
    >
      {it.icon}
      <span>{it.label}</span>
      <LinkPending />
    </Link>
  );
}
