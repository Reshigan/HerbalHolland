// Print helpers for back-office documents (statements, Z-reports): hides the app chrome, sets the paper, and gives a
// document a sheet to sit on. Server-safe (no hooks).
import { cn } from "@/lib/cn";

/** A4 by default; `receipt` for 80 mm till paper. Hides sidebars, app headers and anything marked .no-print. */
export function DocumentPrintStyles({ paper = "A4" }: { paper?: "A4" | "receipt" }) {
  const page = paper === "receipt" ? "@page{size:80mm auto;margin:4mm}" : "@page{size:A4;margin:14mm}";
  // The back-office shell is a sidebar + main grid: with the sidebar hidden, the wrapper must stop being a grid or
  // the document prints in the sidebar's 17rem column.
  return (
    <style>{`@media print{${page}html,body{background:#fff!important}body>div{display:block!important;background:#fff!important;min-height:0!important}aside,nav,header,.no-print{display:none!important}main{padding:0!important;margin:0!important;min-height:0!important}main>div{max-width:none!important;padding:0!important;margin:0!important}.doc-sheet{box-shadow:none!important;border:0!important;border-radius:0!important;padding:0!important;max-width:none!important}}`}</style>
  );
}

/** The white sheet a document is printed on: A4 proportions on screen, edge to edge on paper. */
export function Sheet({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <article className={cn("doc-sheet mx-auto max-w-[210mm] rounded-2xl bg-white p-8 text-ink-850 shadow-card ring-1 ring-ink-150 sm:p-12", className)} {...props}>
      {children}
    </article>
  );
}

/** Small uppercase label above a block of a document. */
export function DocLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-display text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-500", className)}>{children}</h2>;
}
