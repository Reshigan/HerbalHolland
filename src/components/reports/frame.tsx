"use client";
// Client shell for a report: filter changes run as a transition, and the report body
// keeps its previous render (dimmed) until the new one arrives — no skeleton flash.
import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

const Ctx = createContext<{ pending: boolean; go: (href: string) => void }>({ pending: false, go: () => {} });
export const useReport = () => useContext(Ctx);

export function ReportFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (href: string) => start(() => router.push(href, { scroll: false }));
  return <Ctx.Provider value={{ pending, go }}>{children}</Ctx.Provider>;
}

export function ReportBody({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useReport();
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  );
}

/** Sends plain link clicks inside (e.g. the shared RangeTabs) through the report transition. */
export function NavCapture({ children, className }: { children: React.ReactNode; className?: string }) {
  const { go } = useReport();
  return (
    <div
      className={className}
      onClickCapture={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (!a || !href || a.target) return;
        e.preventDefault();
        go(href);
      }}
    >
      {children}
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("outline", "md")}>
      <Printer className="h-4 w-4" strokeWidth={1.9} aria-hidden />
      Print
    </button>
  );
}
