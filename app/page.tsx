import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/workspaces");
  }
  // /demo picks its own default range: the sample window, or the last 4 weeks once Retell is connected.
  redirect("/demo");
}
