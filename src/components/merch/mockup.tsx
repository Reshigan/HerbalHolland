// Flat-lay mockups of the merch (the garment in its colour with the real print at true scale),
// used as the product art for merch (we don't use stock photography). Drawn in the same 120-unit box as ProductArt.
import { Artwork, ART } from "@/components/merch/art";
import { merchFor, type Garment, type MerchItem, type Side } from "@/lib/merch";
import { cn } from "@/lib/cn";

type Shape = {
  under?: string[]; // parts behind the body (the hood from the front)
  straps?: string[]; // stroked straps (tote handles)
  body: string; // garment outline
  trims?: string[]; // ribs, cuffs, brims: drawn a shade darker
  seams?: string[]; // stitch lines
  // Print placement per side: centre x, top y and scale (units per mm) for this garment.
  place: Partial<Record<Side, { cx: number; top: number; unitsPerMm: number }>>;
};

// Garment outlines, viewer-facing. Chest widths (size L): tee 560 mm, crew 580 mm, hoodie 600 mm; tote 380 mm.
const SHAPES: Record<Garment, Record<Side, Shape>> = {
  tee: {
    back: {
      body: "M44 15 C51 18.5 69 18.5 76 15 L92 19.5 L108.5 37.5 L99.5 46.5 L91 41.5 L91 104 C76 106.5 44 106.5 29 104 L29 41.5 L20.5 46.5 L11.5 37.5 L28 19.5 Z",
      trims: ["M44 15 C51 18.5 69 18.5 76 15 L76.6 17.4 C69 21 51 21 43.4 17.4 Z"],
      seams: ["M91 41.5 L92 19.5", "M29 41.5 L28 19.5", "M29 100.5 C44 103 76 103 91 100.5"],
      place: { back: { cx: 60, top: 26, unitsPerMm: 62 / 560 }, front: { cx: 72, top: 29, unitsPerMm: 62 / 560 } },
    },
    front: {
      body: "M44 15 C49 25 71 25 76 15 L92 19.5 L108.5 37.5 L99.5 46.5 L91 41.5 L91 104 C76 106.5 44 106.5 29 104 L29 41.5 L20.5 46.5 L11.5 37.5 L28 19.5 Z",
      trims: ["M44 15 C49 25 71 25 76 15 L77.4 16.4 C72 28 48 28 42.6 16.4 Z"],
      seams: ["M91 41.5 L92 19.5", "M29 41.5 L28 19.5", "M29 100.5 C44 103 76 103 91 100.5"],
      place: { front: { cx: 72.5, top: 30, unitsPerMm: 62 / 560 } },
    },
  },
  hoodie: {
    back: {
      body: "M45 21 L75 21 L90 24 C98 28 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 106 L28 106 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 28 30 24 Z",
      trims: [
        "M29 96 L91 96 L92 106 L28 106 Z",
        "M98.5 88 L107.5 87 L106.4 78.5 L97.3 79.8 Z",
        "M21.5 88 L12.5 87 L13.6 78.5 L22.7 79.8 Z",
        "M44 22 C41 9 51 3.5 60 3.5 C69 3.5 79 9 76 22 C70 25.5 50 25.5 44 22 Z",
      ],
      seams: ["M60 3.5 L60 24.3", "M91 47 L90 24", "M29 47 L30 24"],
      place: { back: { cx: 60, top: 31, unitsPerMm: 62 / 600 } },
    },
    front: {
      body: "M45 21 L75 21 L90 24 C98 28 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 106 L28 106 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 28 30 24 Z",
      under: ["M41 25 C37 11 48 4 60 4 C72 4 83 11 79 25 Z"],
      trims: [
        "M29 96 L91 96 L92 106 L28 106 Z",
        "M98.5 88 L107.5 87 L106.4 78.5 L97.3 79.8 Z",
        "M21.5 88 L12.5 87 L13.6 78.5 L22.7 79.8 Z",
        "M42 67 L78 67 L82 90 L38 90 Z",
        "M45 21.5 C46 12 52 8.5 60 8.5 C68 8.5 74 12 75 21.5 C71 31 49 31 45 21.5 Z",
      ],
      seams: ["M56 29.5 L55.4 44", "M64 29.5 L64.6 44", "M45 21.5 C49 33.5 71 33.5 75 21.5"],
      place: { front: { cx: 72, top: 36, unitsPerMm: 62 / 600 } },
    },
  },
  crew: {
    front: {
      body: "M45 19 C50 27 70 27 75 19 L90 23 C98 27 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 106 L28 106 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 27 30 23 Z",
      trims: ["M29 96 L91 96 L92 106 L28 106 Z", "M98.5 88 L107.5 87 L106.4 78.5 L97.3 79.8 Z", "M21.5 88 L12.5 87 L13.6 78.5 L22.7 79.8 Z", "M45 19 C50 27 70 27 75 19 L76.8 20.2 C71 30.5 49 30.5 43.2 20.2 Z"],
      seams: ["M91 47 L90 23", "M29 47 L30 23"],
      place: { front: { cx: 60, top: 34, unitsPerMm: 62 / 580 } },
    },
    back: {
      body: "M45 19 C51 22 69 22 75 19 L90 23 C98 27 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 106 L28 106 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 27 30 23 Z",
      trims: ["M29 96 L91 96 L92 106 L28 106 Z"],
      place: {},
    },
  },
  jacket: {
    front: {
      body: "M45 19 C50 27 70 27 75 19 L90 23 C98 27 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 104 L28 104 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 27 30 23 Z",
      trims: [
        "M29 96 L91 96 L92 104 L28 104 Z",
        "M98.5 88 L107.5 87 L106.4 78.5 L97.3 79.8 Z",
        "M21.5 88 L12.5 87 L13.6 78.5 L22.7 79.8 Z",
        "M41 12.5 L52 17 L60 27 L68 17 L79 12.5 L78.5 21.5 C73 25 65 27 60 29 C55 27 47 25 41.5 21.5 Z",
        "M58.8 27 L61.2 27 L61.2 96 L58.8 96 Z",
      ],
      seams: ["M55 20.5 a1 1 0 1 0 0.01 0", "M65 20.5 a1 1 0 1 0 0.01 0", "M45 23 C40 33 34 40 29 47", "M75 23 C80 33 86 40 91 47", "M33 72 L45 69", "M87 72 L75 69", "M91 47 L90 23", "M29 47 L30 23"],
      place: { front: { cx: 72, top: 34, unitsPerMm: 62 / 600 } },
    },
    back: {
      body: "M45 19 C51 22 69 22 75 19 L90 23 C98 27 103 46 106 73 L107.5 87 L98.5 88 L96.5 75 C95 62 93 52 91 47 L91 96 L92 104 L28 104 L29 96 L29 47 C27 52 25 62 23.5 75 L21.5 88 L12.5 87 L14 73 C17 46 22 27 30 23 Z",
      trims: ["M29 96 L91 96 L92 104 L28 104 Z", "M43 15.5 C49 19 71 19 77 15.5 L76 21 C70 24 50 24 44 21 Z"],
      seams: ["M30 31 C42 41 78 41 90 31"],
      place: {},
    },
  },
  cap: {
    front: {
      body: "M22 72 C21 44 38 27 60 27 C82 27 99 44 98 72 Z",
      trims: ["M15 73 C30 67 90 67 105 73 C101 86 19 86 15 73 Z"],
      seams: ["M60 27 L60 70", "M60 27 C47 36 40 52 38 70", "M60 27 C73 36 80 52 82 70", "M22 70 C40 67.5 80 67.5 98 70"],
      place: { front: { cx: 60, top: 36, unitsPerMm: 0.42 } },
    },
    back: { body: "M22 72 C21 44 38 27 60 27 C82 27 99 44 98 72 Z", place: {} },
  },
  bucket: {
    front: {
      body: "M33 64 L37.5 31 C39 25.5 81 25.5 82.5 31 L87 64 Z",
      trims: ["M31 62 L89 62 L106 80 C92 88 28 88 14 80 Z"],
      seams: ["M34 66 L86 66", "M24 76 C40 81 80 81 96 76", "M19 79 C36 85 84 85 101 79", "M38.5 33 C45 30 75 30 81.5 33"],
      place: { front: { cx: 60, top: 36, unitsPerMm: 0.4 } },
    },
    back: { body: "M33 64 L37.5 31 C39 25.5 81 25.5 82.5 31 L87 64 Z", place: {} },
  },
  beanie: {
    front: {
      body: "M30 70 C29 41 43 22 60 22 C77 22 91 41 90 70 Z",
      trims: ["M27 63 L93 63 L94 89 C94 90.4 93 91 91.6 91 L28.4 91 C27 91 26 90.4 26 89 Z"],
      seams: ["M44 30 L40 63", "M52 24.5 L50 63", "M60 22.5 L60 63", "M68 24.5 L70 63", "M76 30 L80 63"],
      place: { front: { cx: 60, top: 70, unitsPerMm: 0.34 } },
    },
    back: { body: "M30 70 C29 41 43 22 60 22 C77 22 91 41 90 70 Z", place: {} },
  },
  tote: {
    front: {
      body: "M25 38 L95 38 L96 111 C96 112.5 95 113 93.5 113 L26.5 113 C25 113 24 112.5 24 111 Z",
      straps: ["M40 40 C40 13 80 13 80 40", "M46 41 C46 19 74 19 74 41"],
      seams: ["M25.5 42 L94.5 42"],
      place: { front: { cx: 60, top: 51, unitsPerMm: 72 / 380 } },
    },
    back: { body: "M25 38 L95 38 L96 111 C96 112.5 95 113 93.5 113 L26.5 113 C25 113 24 112.5 24 111 Z", place: {} },
  },
};

const TONES = {
  black: { cloth: "#1a1614", shade: "#0c0a09", trim: "#141110", seam: "#2f2824", bg: ["#f9ae6d", "#e27623"] },
  sunset: { cloth: "#f5913c", shade: "#e27623", trim: "#e27623", seam: "#c05f18", bg: ["#2f2824", "#0c0a09"] },
} as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** One garment view with its print(s). */
export function GarmentView({ item, side, id }: { item: MerchItem; side: Side; id: string }) {
  const shape = SHAPES[item.garment][side];
  const t = TONES[item.colour];
  return (
    <g>
      <defs>
        <pattern id={`${id}-satin`} width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform="rotate(62)">
          <rect width="0.4" height="0.8" fill="#fff" fillOpacity={0.2} />
          <rect x="0.4" width="0.4" height="0.8" fill="#000" fillOpacity={0.14} />
        </pattern>
        <filter id={`${id}-raise`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.28" stdDeviation="0.2" floodColor="#000" floodOpacity="0.55" />
        </filter>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={item.colour === "black" ? 0.07 : 0.16} />
          <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={item.colour === "black" ? 0.22 : 0.14} />
        </linearGradient>
      </defs>
      {shape.under?.map((d) => <path key={d} d={d} fill={t.shade} />)}
      {shape.straps?.map((d, i) => <path key={d} d={d} fill="none" stroke={i === 0 ? t.shade : t.trim} strokeWidth={2.6} strokeLinecap="round" />)}
      <path d={shape.body} fill={t.cloth} />
      {shape.trims?.map((d) => <path key={d} d={d} fill={t.trim} />)}
      {item.prints
        .filter((p) => p.side === side && shape.place[side])
        .map((p) => {
          const a = ART[p.art], pl = shape.place[side]!;
          const k = pl.unitsPerMm * (p.scale ?? 1);
          const box = { x: pl.cx - (a.w * k) / 2, y: pl.top, width: a.w * k, height: a.h * k };
          if (p.technique !== "Embroidery") return <Artwork key={p.art} art={p.art} {...box} />;
          // Embroidery: raised thread with a satin sheen across the stitches.
          const mask = `${id}-${p.art}-thread`;
          return (
            <g key={p.art} filter={`url(#${id}-raise)`}>
              <mask id={mask} maskUnits="userSpaceOnUse">
                <Artwork art={p.art} ink="#fff" {...box} />
              </mask>
              <Artwork art={p.art} {...box} />
              <rect {...box} fill={`url(#${id}-satin)`} mask={`url(#${mask})`} />
            </g>
          );
        })}
      {shape.seams?.map((d) => <path key={d} d={d} fill="none" stroke={t.seam} strokeWidth={0.45} strokeDasharray="1.2 0.9" strokeLinecap="round" />)}
      <path d={shape.body} fill={`url(#${id}-fold)`} />
    </g>
  );
}

/** Product art for a merch item (null when `slug` isn't merch). */
/** Named art is an image; art beside its own caption (an empty label) is decorative, so readers skip it. */
export const artA11y = (name: string) => (name ? { role: "img" as const, "aria-label": name } : { "aria-hidden": true as const });

export function MerchArt({ slug, className, label, side }: { slug: string; className?: string; label?: string; side?: Side }) {
  const item = merchFor(slug);
  if (!item) return null;
  const view = side ?? item.hero;
  const t = TONES[item.colour];
  const id = `m${hash(`${slug}-${view}`)}`;
  return (
    <svg viewBox="0 0 120 120" className={cn("block", className)} {...artA11y(label ?? slug)} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}-bg`} cx="35%" cy="25%" r="95%">
          <stop offset="0%" stopColor={t.bg[0]} />
          <stop offset="100%" stopColor={t.bg[1]} />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.4" floodColor="#0c0a09" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}-bg)`} />
      <g filter={`url(#${id}-shadow)`}>
        <GarmentView item={item} side={view} id={id} />
      </g>
    </svg>
  );
}
