import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// One family for the whole app (Geist, with tabular figures for data). JetBrains Mono is kept
// only for the client report, which follows the Open Water Marine template.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Voice Agent Analytics", template: "%s · Voice Agent Analytics" },
  description: "Retell call analytics, AI call diagnosis and client reports.",
};

export const viewport: Viewport = { themeColor: "#f4f4f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
