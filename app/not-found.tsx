import Link from "next/link";
import { InclusiveLogo } from "@/components/InclusiveLogo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md bg-white rounded-xl shadow-card border border-zinc-200/70 p-8 flex flex-col items-center">
        <InclusiveLogo href="/demo" className="h-10 w-auto mb-6" />
        
        <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-semibold text-lg mb-4">
          404
        </div>
        
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Page Not Found</h1>
        <p className="text-sm text-zinc-500 mb-6 max-w-sm">
          The page you are looking for doesn&apos;t exist, was removed, or is temporarily unavailable.
        </p>

        <Link
          href="/demo"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition shadow-xs w-full"
        >
          Return to Dashboard →
        </Link>
      </div>
    </div>
  );
}

