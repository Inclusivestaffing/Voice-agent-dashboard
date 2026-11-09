import Link from "next/link";
import { requireUser } from "@/lib/db/queries";
import { signOut } from "../actions";
import CreateWorkspaceForm from "./CreateWorkspaceForm";
import { InclusiveLogo } from "@/components/InclusiveLogo";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const { db, user } = await requireUser();
  await db.rpc("accept_invites_for_current_user");
  const { data: memberships } = await db.from("workspace_members").select("role, workspaces(id, name, slug, logo_url, created_at)").eq("user_id", user.id);
  const list = (memberships ?? []).map((m) => ({ role: m.role, ws: (Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces) as { id: string; name: string; slug: string; logo_url: string | null } }))
    .filter((x) => x.ws);

  const counts = new Map<string, number>();
  await Promise.all(list.map(async ({ ws }) => {
    const { count } = await db.from("calls").select("call_id", { count: "exact", head: true }).eq("workspace_id", ws.id);
    counts.set(ws.id, count ?? 0);
  }));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
        <div>
          <div className="mb-4">
            <InclusiveLogo href="/workspaces" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workspaces</h1>
          <p className="text-slate-500 mt-1 text-sm">One workspace per client. Each has its own Retell account, branding, team and reports.</p>
        </div>
        <form action={signOut}>
          <button className="text-xs text-dim hover:text-ink">Sign out · {user.email}</button>
        </form>
      </header>

      {list.length > 0 && (
        <section className="grid sm:grid-cols-2 gap-4 mb-12">
          {list.map(({ ws, role }) => (
            <Link key={ws.id} href={`/w/${ws.slug}/overview`} className="group bg-surface border border-line p-5 hover:border-ink transition flex items-center gap-4">
              {ws.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={ws.logo_url} alt="" className="h-10 w-auto max-w-[80px] object-contain" />
                : <div className="h-10 w-10 grid place-items-center bg-ink text-white font-semibold">{ws.name.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{ws.name}</div>
                <div className="text-xs text-dim mt-0.5">{(counts.get(ws.id) ?? 0).toLocaleString()} calls · {role}</div>
              </div>
              <span className="text-muted group-hover:text-ink">→</span>
            </Link>
          ))}
        </section>
      )}

      <section className="bg-surface border border-line p-6">
        <h2 className="section-title mb-1">Create a workspace</h2>
        <p className="text-sm text-dim mb-5">Paste the client&apos;s Retell API key (Retell dashboard → Settings → API Keys). We&apos;ll import their calls and start analyzing them right away.</p>
        <CreateWorkspaceForm />
      </section>
    </main>
  );
}
