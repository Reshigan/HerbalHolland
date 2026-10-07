// Merch artwork, drawn once at actual size (millimetres) and used three ways: the files the partner embroiders and
// prints from (scripts/merch-export.tsx), the storefront mockups (MerchArt) and the brand book. Every design is one
// colour (Sunset on black garments, black on the Sunset hoodie), so the Mark keeps its only two colourways.
// Stitched designs use the heavy cut of the Mark and sturdier type: satin columns of 1 mm or more, lettering 7 mm+.
import { MarkGlyph } from "@/components/brand/logo";
import type { ArtKey } from "@/lib/merch";

export const INKS = { sunset: "#f5913c", black: "#0c0a09" } as const;
export type InkName = keyof typeof INKS;
export type { ArtKey };

// In the app --font-display is the next/font Outfit; standalone renders (merch-export's pages) declare 'Outfit Variable' themselves.
const FONT = "var(--font-display, 'Outfit Variable'), Outfit, sans-serif";
const TAGLINE = "DUTCH HERITAGE · AFRICAN SOIL";
// Outfit 500 sets the tagline 15.4 em wide; with ~0.3 em tracking between its 29 characters that's 23.8 em.
const tagSize = (width: number) => width / 23.8;

/** The Mark at `size` mm with its top-left corner at (x, y). */
function M({ x, y, size, heavy }: { x: number; y: number; size: number; heavy?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <MarkGlyph heavy={heavy} />
    </g>
  );
}

/** One line of display type fitted to an exact width (tracking absorbs the difference), so layouts don't drift with font metrics. */
function Line({ text, x, y, width, size, weight, anchor = "middle" }: { text: string; x: number; y: number; width: number; size: number; weight: number; anchor?: "start" | "middle" }) {
  return (
    <text x={x} y={y} textLength={width} lengthAdjust="spacing" textAnchor={anchor} style={{ fontFamily: FONT }} fontSize={size} fontWeight={weight} fill="currentColor" stroke="none">
      {text}
    </text>
  );
}

/**
 * Stacked wordmark (HERBAL light over HOLLAND extra-bold). `y` is HERBAL's cap top; nothing sits below HOLLAND's
 * baseline. Embroidery sets HERBAL at 500 so its strokes are thick enough to stitch.
 */
function Words({ x, y, width, size, anchor = "middle", light = 300 }: { x: number; y: number; width: number; size: number; anchor?: "start" | "middle"; light?: number }) {
  const cap = size * 0.7;
  return (
    <>
      <Line text="HERBAL" x={x} y={y + cap} width={width * 0.93} size={size} weight={light} anchor={anchor} />
      <Line text="HOLLAND" x={x} y={y + cap + size * 0.98} width={width} size={size} weight={800} anchor={anchor} />
    </>
  );
}

type Art = { w: number; h: number; ink: InkName; body: React.ReactNode; note: string };

/** Artwork by key, at actual size. `note` describes the design; where it goes is per garment (lib/merch). */
export const ART: Record<ArtKey, Art> = {
  // The stitch cut of the Mark: tee chest, cap, bucket hat and beanie. One design, one digitised file.
  "mark-stitch": { w: 50, h: 50, ink: "sunset", note: "Stitch cut of the Mark, 50 mm", body: <M x={0} y={0} size={50} heavy /> },
  // Beanie cuff: the same cut at 40 mm, the most a folded rib-knit cuff takes (digitised for knit).
  "mark-stitch-cuff": { w: 40, h: 40, ink: "sunset", note: "Stitch cut of the Mark, 40 mm, digitised for rib knit", body: <M x={0} y={0} size={40} heavy /> },

  // Hoodie chest (black thread on Sunset): the horizontal lock-up, cut for stitching.
  "lockup-stitch": {
    w: 102,
    h: 30,
    ink: "black",
    note: "Horizontal lock-up, 102 mm wide",
    body: (
      <>
        <M x={0} y={0} size={30} heavy />
        <Words x={38} y={4.9} width={64} size={12} anchor="start" light={500} />
      </>
    ),
  },

  // Crewneck chest: the line we sign off with, set like the wordmark and cut for stitching.
  "heritage-stitch": {
    w: 180,
    h: 71,
    ink: "sunset",
    note: "Mark over “Dutch heritage. African soil.”, 180 mm wide",
    body: (
      <>
        <M x={77} y={0} size={26} heavy />
        <Line text="DUTCH HERITAGE." x={90} y={45.1} width={180} size={13} weight={500} />
        <Line text="AFRICAN SOIL." x={90} y={69.9} width={180} size={24} weight={800} />
      </>
    ),
  },

  // Tee back: the store window (the poster lock-up inside the window-poster frame, tagline beneath).
  "window-back": {
    w: 250,
    h: 340,
    ink: "sunset",
    note: "Store-window poster, 250 mm wide",
    body: (() => {
      const t = 11, H = 312.5, mark = 124, size = 27, words = 150;
      const group = mark + 16 + size * 0.7 + size * 0.98;
      const top = (H - group) / 2 + 2;
      return (
        <>
          <rect x={t / 2} y={t / 2} width={250 - t} height={H - t} rx={24 - t / 2} fill="none" stroke="currentColor" strokeWidth={t} />
          <M x={125 - mark / 2} y={top} size={mark} />
          <Words x={125} y={top + mark + 16} width={words} size={size} />
          <Line text={TAGLINE} x={125} y={337} width={236} size={tagSize(236)} weight={500} />
        </>
      );
    })(),
  },

  // Hoodie back (black on Sunset): the Mark, the wordmark and a setting sun on the horizon.
  "sunset-back": {
    w: 290,
    h: 352,
    ink: "black",
    note: "Setting sun and lock-up, 290 mm wide",
    body: (() => {
      const cx = 145, r = 108, horizon = 320;
      // A setting sun in retro bands: each band thinner and each gap wider towards the horizon.
      const n = 7, bandW = Array.from({ length: n }, (_, i) => n + 2 - i), gapW = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 0.8 + i * 0.55));
      const k = r / [...bandW, ...gapW].reduce((a, b) => a + b, 0);
      const bands: [number, number][] = [];
      let y = horizon - r;
      for (let i = 0; i < n; i++) {
        y += gapW[i] * k;
        bands.push([y, bandW[i] * k]);
        y += bandW[i] * k;
      }
      return (
        <>
          <M x={cx - 46} y={0} size={92} />
          <Words x={cx} y={116} width={220} size={40} />
          <defs>
            <clipPath id="hh-sun">
              <circle cx={cx} cy={horizon} r={r} />
            </clipPath>
          </defs>
          <g clipPath="url(#hh-sun)" fill="currentColor" stroke="none">
            {bands.map(([by, bh]) => (
              <rect key={by} x={cx - r} y={by} width={r * 2} height={bh} />
            ))}
          </g>
          <rect x={0} y={horizon + 4} width={290} height={3.2} rx={1.6} fill="currentColor" stroke="none" />
          <Line text={TAGLINE} x={cx} y={349} width={270} size={tagSize(270)} weight={500} />
        </>
      );
    })(),
  },

  // Tote: the horizontal lock-up with the tagline beneath.
  "tote-front": {
    w: 262,
    h: 124,
    ink: "sunset",
    note: "Horizontal lock-up and tagline, 262 mm wide",
    body: (
      <>
        <M x={0} y={0} size={88} />
        <Words x={104} y={20} width={158} size={30} anchor="start" />
        <Line text={TAGLINE} x={131} y={121} width={262} size={tagSize(262)} weight={500} />
      </>
    ),
  },

};

/** A design as a standalone SVG element: `ink` overrides the print colour (e.g. black for a proof on white). */
export function Artwork({ art, ink, className, x, y, width, height }: { art: ArtKey; ink?: string; className?: string; x?: number; y?: number; width?: number; height?: number }) {
  const a = ART[art];
  return (
    <svg viewBox={`0 0 ${a.w} ${a.h}`} x={x} y={y} width={width} height={height} className={className} color={ink ?? INKS[a.ink]} role="img" aria-label={`${art} artwork`} overflow="visible">
      {a.body}
    </svg>
  );
}
