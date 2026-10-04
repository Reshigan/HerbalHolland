import { extendTailwindMerge } from "tailwind-merge";

// Later classes win over conflicting earlier ones (`cn("max-w-7xl", "max-w-3xl")` → "max-w-3xl"), so a component's
// className can override its defaults. Our own shadow tokens (globals.css @theme) are shadows, not shadow colours.
const merge = extendTailwindMerge({ extend: { theme: { shadow: ["card", "lift", "glow"] } } });

/** Joins class names, skipping falsy values; conflicting Tailwind utilities resolve to the last one. */
export const cn = (...xs: (string | false | null | undefined)[]) => merge(xs.filter(Boolean).join(" "));
