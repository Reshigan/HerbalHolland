"use client";
import { usePathname } from "next/navigation";
import { appOnlyExempt } from "@/lib/install";

/** Covers the page in a browser. CSS hides it in the installed app, so neither side sees a flash. */
export function AppOnlyGate({ children }: { children: React.ReactNode }) {
  if (appOnlyExempt(usePathname())) return null;
  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-ink-950 text-ink-100 app:hidden">{children}</div>;
}
