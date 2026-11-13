import { getWorkspace } from "@/lib/db/queries";
import { supabaseAdmin } from "@/lib/db/supabase";
import { AppProvider } from "@/components/context/AppContext";
import AppShell, { SyncStatus } from "@/components/navigation/AppShell";
import type { WorkspaceLite } from "@/components/navigation/WorkspaceSwitcher";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { db, user, ws, role } = await getWorkspace(slug);
  const [{ data: conn }, { data: memberships }] = await Promise.all([
    supabaseAdmin().from("retell_connections").select("last_synced_at, api_key_last4").eq("workspace_id", ws.id).maybeSingle(),
    db.from("workspace_members").select("workspaces(name, slug, logo_url)").eq("user_id", user.id),
  ]);
  const workspaces = (memberships ?? [])
    .map((m) => m.workspaces as unknown as WorkspaceLite | null)
    .filter((w): w is WorkspaceLite => !!w)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppProvider initialRole={role} workspaceId={ws.id}>
      <AppShell
        basePath={`/w/${slug}`}
        logoHref={`/w/${slug}/overview`}
        current={{ name: ws.name, slug: ws.slug, logo_url: ws.logo_url }}
        workspaces={workspaces.length ? workspaces : [{ name: ws.name, slug: ws.slug, logo_url: ws.logo_url }]}
        status={conn ? <SyncStatus last4={conn.api_key_last4} syncedAt={conn.last_synced_at} /> : null}
        account={{ name: user.email?.split("@")[0] ?? "Admin", email: user.email ?? "" }}
      >
        {children}
      </AppShell>
    </AppProvider>
  );
}
