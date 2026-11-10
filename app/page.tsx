import { redirect } from "next/navigation";
import { DEMO_QS } from "@/lib/demo/range";

export const dynamic = "force-dynamic";

export default function Home() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/workspaces");
  }
  redirect(`/demo?${DEMO_QS}`);
}
