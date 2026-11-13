import { DEMO_QS } from "@/lib/demo/range";
import { redirect } from "next/navigation";
import { getSource } from "@/lib/source";
import { gateActive } from "@/lib/live/conn";
import { isSignedIn, passwordConfigured } from "@/lib/auth/gate";
import { AppProvider } from "@/components/context/AppContext";
import AppShell, { SyncStatus } from "@/components/navigation/AppShell";

export const dynamic = "force-dynamic";

/** The app on sample data, or on a Retell account connected in Settings (live calls). */
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  // With the Retell connection saved on the server, real call data sits behind the team password.
  if (gateActive() && passwordConfigured() && !(await isSignedIn())) redirect("/unlock");
  const src = await getSource();
  const ws = { name: src.name, slug: "demo", logo_url: null };
  return (
    <AppProvider initialRole="admin" workspaceId="demo" live={src.live}>
      <AppShell
        basePath="/demo"
        logoHref={src.live ? "/demo" : `/demo?${DEMO_QS}`}
        current={ws}
        workspaces={[ws]}
        demo
        canLogOut={gateActive() && passwordConfigured()}
        status={src.live
          ? <SyncStatus syncedAt={null} note="Live" />
          : <SyncStatus syncedAt={null} idle label="Sample data" note="Connect in Settings" />}
        account={{ name: "Inclusive Staffing", email: "admin@inclusivestaffing.com" }}
      >
        {children}
      </AppShell>
    </AppProvider>
  );
}
