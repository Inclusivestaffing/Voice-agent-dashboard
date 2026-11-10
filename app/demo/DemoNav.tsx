"use client";

import NavLinks from "@/app/w/[slug]/NavLinks";

/** Demo sidebar: the same navigation as a real workspace, on the sample data. */
export default function DemoNav() {
  return <NavLinks basePath="/demo" label="Demo workspace" />;
}
