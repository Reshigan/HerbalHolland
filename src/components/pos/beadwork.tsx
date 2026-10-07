// The beadwork band: the brand's small African geometric tile (a chain of diamonds in cream, orange and charcoal,
// after the panel beside the door in the store concept) as a repeating SVG pattern, for the customer display and
// other till-side brand moments. Colours are the token values ink-900, ink-50 and brand-500. It's the one place they
// are written into art rather than set by CSS (the tile must look the same everywhere it prints or shows).
import { cn } from "@/lib/cn";

export const BEAD_TILE = [
  { fill: "#141110", d: "M0 0h24v24H0z" },
  { fill: "#fbf7f3", d: "M12 3l9 9-9 9-9-9z" },
  { fill: "#141110", d: "M12 6.5l5.5 5.5-5.5 5.5-5.5-5.5z" },
  { fill: "#f5913c", d: "M12 9l3 3-3 3-3-3zM0 0h5L0 5zm24 0v5l-5-5zM0 24v-5l5 5zm24 0h-5l5-5z" },
] as const;

/** One row of beads, `size` px tall, repeating across the full width. */
export function Beadwork({ size = 18, className, label = "" }: { size?: number; className?: string; label?: string }) {
  const id = `beads-${size}`;
  return (
    <svg className={cn("block w-full", className)} height={size} role={label ? "img" : "presentation"} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" viewBox="0 0 24 24">
          {BEAD_TILE.map((s, i) => (
            <path key={i} fill={s.fill} d={s.d} />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height={size} fill={`url(#${id})`} />
    </svg>
  );
}
