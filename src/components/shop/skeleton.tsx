// Loading placeholders shaped like the page they stand in for (the sheen is .hh-skeleton in globals.css, "Motion").
import { cn } from "@/lib/cn";
import { Container } from "./ui";

export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("hh-skeleton", className)} />;
}

/** A product grid's worth of tiles, in the grid's own columns. */
export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40">
          <Bone className="aspect-square rounded-none" />
          <div className="space-y-2 p-4">
            <Bone className="h-2.5 w-1/3" />
            <Bone className="h-4 w-3/4" />
            <Bone className="h-3 w-1/2" />
            <div className="flex items-center justify-between pt-3">
              <Bone className="h-5 w-16" />
              <Bone className="h-11 w-11 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A member page: heading, a line of intro, then a list in one panel. */
export function ListPageSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label={label}>
      <Bone className="h-9 w-56" />
      <Bone className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-6 divide-y divide-ink-850 rounded-2xl border border-ink-800">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-4 w-2/3" />
              <Bone className="h-3 w-1/3" />
            </div>
            <Bone className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Container>
  );
}
