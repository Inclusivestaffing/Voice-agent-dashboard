import Link from "next/link";
import { loadInbox } from "@/lib/inbox/load";
import InboxList from "@/components/inbox/InboxList";

export const dynamic = "force-dynamic";

/** Every urgent call and Automation report, from all workspaces. */
export default async function InboxPage() {
  const initial = await loadInbox(300);
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Inbox</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">
            Calls that need attention from every workspace, plus finished Automation reports. Open one to go straight to that conversation and its suggested fix.
          </p>
        </div>
        <Link href="/demo/automation" className="h-9 inline-flex items-center rounded-lg border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">Alert settings</Link>
      </div>
      <InboxList initial={initial} />
    </>
  );
}
