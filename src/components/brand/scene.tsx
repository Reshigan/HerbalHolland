import { cn } from "@/lib/cn";

/**
 * A decorative photo laid behind a surface. Files live in public/ as `<name>.webp` and `<name>-sm.webp`
 * (see public/scenes, public/club, public/pos). The parent needs `relative isolate overflow-hidden`;
 * `scrim` is the gradient that keeps text over the photo at AA contrast.
 */
export function Scene({
  src,
  scrim = "bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/30",
  eager = false,
  position = "object-center",
  widths = [960, 1920],
  sizes = "100vw",
  className,
}: {
  src: string;
  scrim?: string;
  eager?: boolean;
  position?: string;
  /** Pixel widths of `-sm` and full files. */
  widths?: [number, number];
  sizes?: string;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10", className)}>
      <img
        src={`${src}.webp`}
        srcSet={`${src}-sm.webp ${widths[0]}w, ${src}.webp ${widths[1]}w`}
        sizes={sizes}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("h-full w-full object-cover", position)}
      />
      <div className={cn("absolute inset-0", scrim)} />
    </div>
  );
}
