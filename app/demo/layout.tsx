import { DEMO_QS } from "@/lib/demo/range";
import { redirect } from "next/navigation";
import { getSource } from "@/lib/source";
import { SAMPLE_ID, gateActive, getActiveWorkspace, listWorkspaces, storeProblem } from "@/lib/live/conn";
import { isSignedIn, passwordConfigured } from "@/lib/auth/gate";
import { AppProvider } from "@/components/context/AppContext";
import AppShell, { SyncStatus } from "@/components/navigation/AppShell";

export const dynamic = "force-dynamic";

/** The app on sample data, or on a Retell account connected in Settings (live calls). */
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  // With the Retell connection saved on the server, real call data sits behind the team password.
  if (gateActive() && passwordConfigured() && !(await isSignedIn())) redirect("/unlock");
  const src = await getSource();
  const [active, created] = await Promise.all([getActiveWorkspace(), listWorkspaces()]);
  const sample = { name: "Open Water Marine", slug: SAMPLE_ID, logo_url: null };
  const all = [sample, ...created.map((w) => ({ name: w.name, slug: w.id, logo_url: null }))];
  const ws = active ? { name: active.name, slug: active.id, logo_url: null } : sample;
  return (
    <AppProvider initialRole="admin" workspaceId="demo" live={src.live}>
      <AppShell
        basePath="/demo"
        logoHref={src.live ? "/demo" : `/demo?${DEMO_QS}`}
        current={ws}
        workspaces={all}
        createProblem={storeProblem()}
        demo
        canLogOut={gateActive() && passwordConfigured()}
        status={src.live
          ? <SyncStatus syncedAt={null} note="Live" />
          : <SyncStatus syncedAt={null} idle label="Sample data" note="Open Water Marine" />}
        account={{ name: "Inclusive Staffing", email: "admin@inclusivestaffing.com" }}
      >
        {children}
      </AppShell>
    </AppProvider>
  );
}
