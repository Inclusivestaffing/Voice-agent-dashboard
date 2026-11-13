"use client";

import { useEffect } from "react";
import Link from "next/link";
import { InclusiveLogo } from "@/components/InclusiveLogo";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md bg-white rounded-xl shadow-card border border-zinc-200/70 p-8 flex flex-col items-center">
        <InclusiveLogo href="/demo" className="h-10 w-auto mb-6" />
        
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-semibold text-lg mb-4">
          !
        </div>
        
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-zinc-500 mb-6 max-w-sm">
          An unexpected error occurred while loading this view. You can retry or head back to the dashboard.
        </p>

        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={() => reset()}
            className="w-full px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition shadow-xs cursor-pointer"
          >
            Try Again
          </button>
          <Link
            href="/demo"
            className="w-full px-5 py-2.5 rounded-lg bg-zinc-100 text-zinc-700 text-sm font-semibold hover:bg-zinc-200 transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

