// Generative product artwork in the brand language (the windmill-flower petals),
// coloured by product family. Deterministic per product, no photography needed.
// Merch shows its actual design instead (MerchArt).
import { PETAL } from "@/components/brand/logo";
import { MerchArt, artA11y } from "@/components/merch/mockup";
import { merchFor } from "@/lib/merch";
import { cn } from "@/lib/cn";

const FAMILY: Record<string, { bg: [string, string]; fg: string; ring: string }> = {
  SATIVA: { bg: ["#3a1d0b", "#150b05"], fg: "#f9ae6d", ring: "#f5913c" },
  INDICA: { bg: ["#2b1848", "#120a1f"], fg: "#c9b6ff", ring: "#8e6cd6" },
  HYBRID: { bg: ["#0f302a", "#07130f"], fg: "#86e0c6", ring: "#1baf7a" },
  CBD: { bg: ["#223019", "#0e150b"], fg: "#c3e2a8", ring: "#7fb069" },
  // Wellness families re-use the palette above: roast browns with CBD green, cream with leaf, ink with cream.
  CBD_FOOD: { bg: ["#3a1d0b", "#150b05"], fg: "#c3e2a8", ring: "#7fb069" },
  CBD_TOPICAL: { bg: ["#efe6da", "#dccbb5"], fg: "#223019", ring: "#7fb069" },
  SUPPLEMENT: { bg: ["#211c19", "#0c0a09"], fg: "#efe6da", ring: "#b08452" },
  HEMP: { bg: ["#efe6da", "#dccbb5"], fg: "#7a5a3a", ring: "#b08452" },
  ACCESSORY: { bg: ["#211c19", "#0c0a09"], fg: "#f5913c", ring: "#f5913c" },
  APPAREL: { bg: ["#f79f52", "#e27623"], fg: "#0c0a09", ring: "#0c0a09" },
  GROW: { bg: ["#1d3517", "#0b1508"], fg: "#a6db72", ring: "#6fae3f" },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function familyOf(p: { strain?: string | null; regClass: string }) {
  if (p.regClass === "THC" && p.strain && FAMILY[p.strain]) return p.strain;
  if (p.regClass === "CBD") return "CBD";
  return p.regClass in FAMILY ? p.regClass : "ACCESSORY";
}

export function ProductArt({ slug, strain, regClass, className, label }: { slug: string; strain?: string | null; regClass: string; className?: string; label?: string }) {
  if (merchFor(slug)) return <MerchArt slug={slug} className={className} label={label} />;
  const f = FAMILY[familyOf({ strain, regClass })];
  const h = hash(slug);
  const rot = h % 90;
  const cx = 55 + ((h >> 3) % 30);
  const cy = 38 + ((h >> 7) % 26);
  const scale = 1.9 + ((h >> 11) % 9) / 10;
  const petals = 4 + ((h >> 15) % 3);
  const id = `g${h.toString(36)}`;
  return (
    <svg viewBox="0 0 120 120" className={cn("block", className)} {...artA11y(label ?? slug)} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={id} cx="35%" cy="25%" r="90%">
          <stop offset="0%" stopColor={f.bg[0]} />
          <stop offset="100%" stopColor={f.bg[1]} />
        </radialGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${id})`} />
      <circle cx={cx} cy={cy} r={34 * (scale / 2.2)} fill="none" stroke={f.ring} strokeOpacity={0.28} strokeWidth={1.2} />
      <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${scale})`} fill="none" stroke={f.fg} strokeWidth={1.5 / scale + 0.9} strokeLinejoin="round" strokeOpacity={0.92}>
        {Array.from({ length: petals }, (_, i) => (
          <path key={i} d={PETAL} transform={`rotate(${(360 / petals) * i})`} />
        ))}
        <circle r={3.2} />
      </g>
      <circle cx={cx} cy={cy} r={1.6} fill={f.fg} />
    </svg>
  );
}
