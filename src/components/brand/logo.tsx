// The Herbal Holland mark, redrawn from the store-window lock-up: a four-petal
// windmill flower (Holland + herb) on a tower, inside an open ring.
// All strokes use currentColor so the mark works orange-on-black and black-on-orange.
import { cn } from "@/lib/cn";

export const PETAL = "M5 0 C 11 -9.5, 23 -9.5, 29 -1.5 C 23 4.5, 13 6.5, 5 0 Z";

export function Mark({ className, spin = false, detail = true, title = "Herbal Holland" }: { className?: string; spin?: boolean | "fast"; detail?: boolean; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} role="img" aria-label={title}>
      <MarkGlyph detail={detail} spin={spin} />
    </svg>
  );
}

/**
 * The Mark's strokes in a 100-unit box, drawn in currentColor — for placing inside other artwork (print files, merch).
 * `heavy` is the small-size cut: heavier lines, a solid hub and no inner tower line, so it prints cleanly on a cap.
 */
export function MarkGlyph({ detail = true, heavy = false, spin = false }: { detail?: boolean; heavy?: boolean; spin?: boolean | "fast" }) {
  const line = heavy ? 7.5 : 5.5;
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* Open ring: the gap at the bottom is where the tower stands. */}
      <path d="M 36.2 82.6 A 40 40 0 1 1 63.8 82.6" strokeWidth={line} />
      {/* Tower */}
      <path d="M 33 91 L 50 44.5 L 67 91" strokeWidth={line} />
      {detail && !heavy && <path d="M 42.5 91 L 50 69 L 57.5 91" strokeWidth={3.2} />}
      {/* Windmill flower */}
      <g transform="translate(50 40)" className={spin ? (spin === "fast" ? "animate-spin-fast" : "animate-spin-slow") : undefined} style={spin ? { transformOrigin: "50px 40px", transformBox: "view-box" } : undefined}>
        {[45, 135, 225, 315].map((r) => (
          <path key={r} d={PETAL} transform={`rotate(${r - 90})`} strokeWidth={heavy ? 5.2 : 3.6} />
        ))}
        {heavy ? (
          <circle r={4.6} fill="currentColor" stroke="none" />
        ) : (
          <>
            <circle r={3.4} strokeWidth={2.4} />
            <circle r={0.9} fill="currentColor" stroke="none" />
          </>
        )}
      </g>
    </g>
  );
}

export function Wordmark({ className, stacked = true }: { className?: string; stacked?: boolean }) {
  return (
    <span className={cn("font-display uppercase leading-[0.9]", stacked ? "inline-flex flex-col" : "inline-flex items-baseline gap-2", className)}>
      <span className="font-light tracking-[0.14em]">Herbal</span>
      <span className="font-extrabold tracking-[0.06em]">Holland</span>
    </span>
  );
}

/** Horizontal lock-up for headers. */
export function Logo({ className, markClassName, compact = false }: { className?: string; markClassName?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-brand-500", className)}>
      <Mark className={cn("h-9 w-9", markClassName)} detail={!compact} />
      {!compact && <Wordmark className="text-[0.95rem]" />}
    </span>
  );
}

/** The full window-poster lock-up: mark over stacked wordmark. */
export function Lockup({ className, spin }: { className?: string; spin?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col items-center text-brand-500", className)}>
      <Mark className="h-[46%] w-auto aspect-square" spin={spin} />
      <Wordmark className="mt-[4%] items-center text-center text-[1em]" />
    </span>
  );
}
