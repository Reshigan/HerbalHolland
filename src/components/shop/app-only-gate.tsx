"use client";
import { usePathname } from "next/navigation";
import { appOnlyOpen } from "@/lib/install";

/** Covers the page in a browser. CSS hides it in the installed app, so neither side sees a flash. */
export function AppOnlyGate({ children }: { children: React.ReactNode }) {
  if (appOnlyOpen(usePathname())) return null;
  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-ink-950 text-ink-100 app:hidden">{children}</div>;
}
