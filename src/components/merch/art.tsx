// Merch print artwork, drawn once at print size (millimetres) and used three ways: the print-ready files
// (scripts/merch-export.tsx), the storefront mockups (MerchArt) and the brand book. Every design is one ink —
// Sunset on black garments, black on Sunset garments — so the Mark keeps its only two colourways.
import { MarkGlyph } from "@/components/brand/logo";
import type { ArtKey } from "@/lib/merch";

export const INKS = { sunset: "#f5913c", black: "#0c0a09" } as const;
export type InkName = keyof typeof INKS;
export type { ArtKey };

const FONT = "'Outfit Variable', Outfit, sans-serif";
const TAGLINE = "DUTCH HERITAGE · AFRICAN SOIL";
// Outfit 500 sets the tagline 15.4 em wide; with ~0.3 em tracking between its 29 characters that's 23.8 em.
const tagSize = (width: number) => width / 23.8;

/** The Mark at `size` mm with its top-left corner at (x, y). */
function M({ x, y, size, stitch }: { x: number; y: number; size: number; stitch?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <MarkGlyph stitch={stitch} />
    </g>
  );
}

/** One line of display type fitted to an exact width (tracking absorbs the difference), so layouts don't drift with font metrics. */
function Line({ text, x, y, width, size, weight, anchor = "middle" }: { text: string; x: number; y: number; width: number; size: number; weight: number; anchor?: "start" | "middle" }) {
  return (
    <text x={x} y={y} textLength={width} lengthAdjust="spacing" textAnchor={anchor} fontFamily={FONT} fontSize={size} fontWeight={weight} fill="currentColor" stroke="none">
      {text}
    </text>
  );
}

/** Stacked wordmark (HERBAL light over HOLLAND extra-bold). `y` is HERBAL's cap top; returns nothing below HOLLAND's baseline. */
function Words({ x, y, width, size, anchor = "middle" }: { x: number; y: number; width: number; size: number; anchor?: "start" | "middle" }) {
  const cap = size * 0.7;
  return (
    <>
      <Line text="HERBAL" x={x} y={y + cap} width={width * 0.93} size={size} weight={300} anchor={anchor} />
      <Line text="HOLLAND" x={x} y={y + cap + size * 0.98} width={width} size={size} weight={800} anchor={anchor} />
    </>
  );
}

type Art = { w: number; h: number; ink: InkName; body: React.ReactNode; note: string };

/** Artwork by key, at print size. */
export const ART: Record<ArtKey, Art> = {
  // Tee front, left chest.
  "chest-mark": { w: 80, h: 80, ink: "sunset", note: "Left chest, 80 mm wide, 90 mm below the shoulder seam", body: <M x={0} y={0} size={80} /> },

  // Tee back: the store window — the poster lock-up inside the window-poster frame, tagline beneath.
  "window-back": {
    w: 250,
    h: 340,
    ink: "sunset",
    note: "Centre back, 250 mm wide, 75 mm below the collar",
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
    note: "Centre back, 290 mm wide, 70 mm below the hood seam",
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

  // Crewneck front: the line we sign off with, set like the wordmark (light over extra-bold).
  "heritage-front": {
    w: 240,
    h: 126,
    ink: "sunset",
    note: "Centre front, 240 mm wide, 85 mm below the collar",
    body: (
      <>
        <M x={98} y={0} size={44} />
        <Line text="DUTCH HERITAGE." x={120} y={78} width={240} size={19} weight={300} />
        <Line text="AFRICAN SOIL." x={120} y={124} width={240} size={32} weight={800} />
      </>
    ),
  },

  // Tote: the horizontal lock-up with the tagline beneath.
  "tote-front": {
    w: 262,
    h: 124,
    ink: "sunset",
    note: "Centre front, 262 mm wide, 70 mm below the top edge",
    body: (
      <>
        <M x={0} y={0} size={88} />
        <Words x={104} y={20} width={158} size={30} anchor="start" />
        <Line text={TAGLINE} x={131} y={121} width={262} size={tagSize(262)} weight={500} />
      </>
    ),
  },

  // Hoodie front (black on Sunset): small horizontal lock-up on the left chest.
  "lockup-chest": {
    w: 96,
    h: 32,
    ink: "black",
    note: "Left chest, 96 mm wide, 90 mm below the shoulder seam",
    body: (
      <>
        <M x={0} y={0} size={32} />
        <Words x={38} y={6.2} width={58} size={11} anchor="start" />
      </>
    ),
  },

  // Caps and bucket hats: the embroidery cut of the Mark.
  "stitch-mark": { w: 55, h: 55, ink: "sunset", note: "Embroidery, 55 mm tall on caps (45 mm on bucket hats); thread matched to Sunset 500", body: <M x={0} y={0} size={55} stitch /> },
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
