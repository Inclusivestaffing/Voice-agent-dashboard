import { redirect } from "next/navigation";

export default function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/demo");
  }
  redirect("/workspaces");
}
