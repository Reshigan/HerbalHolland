// Store signage, drawn at actual size in millimetres: the fascia (two sizes), the projecting blade sign, the window
// poster, the door vinyl, the window stickers, the in-store signs, a header for every shelving bay and the wall art. Lettering is outlined (scripts/text-outline.py), so the files cut as they are; the Mark is
// drawn as strokes (Outline Stroke before routing). Writes SVG, PDF (actual size), a PNG preview and a preview on the
// panel's colour per design to public/brand/signage, plus a night mock-up of a shopfront (storefront.svg/.png).
//   npx tsx --env-file=.env scripts/signage-art.tsx [STORE_CODE]   (a store code: its door vinyl with its name and hours)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";
import { CATEGORIES } from "../prisma/seed-data";
import { hoursLine, parseHours, type Hours } from "../src/server/shop/hours";

const OUT = "public/brand/signage";
const SUNSET = "#f5913c", INK = "#0c0a09";

// ── Outlined lettering ─────────────────────────────────────────────────────────────────────────────────────────────
type Glyphs = { d: string; width: number };
const memo = new Map<string, Glyphs>();
const outline = (text: string, weight: number, size: number, tracking: number): Glyphs => {
  const key = JSON.stringify({ text, weight, size, tracking });
  if (!memo.has(key)) memo.set(key, JSON.parse(execFileSync("python3", ["scripts/text-outline.py"], { input: key + "\n" }).toString()));
  return memo.get(key)!;
};
/** `text` set `width` wide by tracking (letters keep their size), baseline at y; anchored at its left, middle or right. */
function T({ text, weight, size, width, x, y, anchor = "middle" }: { text: string; weight: number; size: number; width: number; x: number; y: number; anchor?: "start" | "middle" | "end" }) {
  const bare = outline(text, weight, size, 0);
  const g = text.length > 1 ? outline(text, weight, size, (width - bare.width) / (text.length - 1) / size) : bare;
  const left = anchor === "start" ? x : anchor === "end" ? x - g.width : x - g.width / 2;
  return <path d={g.d} transform={`translate(${left.toFixed(2)} ${y.toFixed(2)})`} fill="currentColor" />;
}
/** Natural width of `text` at a tracking (em), for laying things out before setting them. */
const widthOf = (text: string, weight: number, size: number, tracking: number) => outline(text, weight, size, tracking).width;

const M = ({ x, y, size, heavy }: { x: number; y: number; size: number; heavy?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
    <MarkGlyph heavy={heavy} />
  </g>
);

/** The stacked wordmark (HERBAL over HOLLAND) `width` wide, HERBAL's cap top at y. Signs use HERBAL at 400 so its strokes light. */
const Words = ({ x, y, width, size, anchor = "middle" }: { x: number; y: number; width: number; size: number; anchor?: "start" | "middle" }) => (
  <>
    <T text="HERBAL" weight={400} size={size} width={width * 0.93} x={anchor === "start" ? x : x} y={y + size * 0.7} anchor={anchor} />
    <T text="HOLLAND" weight={800} size={size} width={width} x={x} y={y + size * 0.7 + size * 0.98} anchor={anchor} />
  </>
);
const wordsWidth = (size: number) => widthOf("HOLLAND", 800, size, 0.06);

/**
 * Text on an arc, centred on the top or the bottom of a circle and upright either way (the bottom reads left to right).
 * Both bands sit between radius r and r + cap height.
 */
function Arc({ cx, cy, r, text, size, weight = 600, tracking = 0.18, bottom = false }: { cx: number; cy: number; r: number; text: string; size: number; weight?: number; tracking?: number; bottom?: boolean }) {
  const chars = [...text].map((c) => ({ c, ...outline(c, weight, size, 0) }));
  const L = chars.reduce((a, g) => a + g.width, 0) + tracking * size * (chars.length - 1);
  const R = bottom ? r + size * 0.7 : r;
  let s = 0;
  return (
    <>
      {chars.map((g, i) => {
        const mid = s + g.width / 2;
        s += g.width + tracking * size;
        const deg = ((bottom ? L / 2 - mid : mid - L / 2) / R) * (180 / Math.PI);
        return <path key={i} d={g.d} fill="currentColor" transform={`translate(${cx} ${cy}) rotate(${deg.toFixed(3)}) translate(${(-g.width / 2).toFixed(2)} ${bottom ? R : -R})`} />;
      })}
    </>
  );
}

// ── The designs ────────────────────────────────────────────────────────────────────────────────────────────────────
type Design = { key: string; name: string; w: number; h: number; ink: string; ground: string | null; how: string; body: React.ReactNode };

/** Fascia: the shopfront's orange window frame on a black panel, with the horizontal lock-up centred inside it. */
function fascia(key: string, name: string, w: number, h: number, how: string): Design {
  const t = h * 0.045, inset = h * 0.07, block = h * 0.56, size = block / 1.68, mark = block * 1.04, gap = block * 0.26;
  const ww = wordsWidth(size), lock = mark + gap + ww, x0 = (w - lock) / 2;
  return {
    key, name, w, h, ink: SUNSET, ground: INK, how,
    body: (
      <>
        <rect x={inset} y={inset} width={w - 2 * inset} height={h - 2 * inset} rx={h * 0.13} fill="none" stroke="currentColor" strokeWidth={t} />
        <M x={x0} y={(h - mark) / 2} size={mark} heavy />
        <Words x={x0 + mark + gap} y={(h - block) / 2} width={ww} size={size} anchor="start" />
      </>
    ),
  };
}

const TAGLINE = "DUTCH HERITAGE · AFRICAN SOIL";
const SAMPLE_HOURS: Hours = { mon: ["09:00", "20:00"], tue: ["09:00", "20:00"], wed: ["09:00", "20:00"], thu: ["09:00", "20:00"], fri: ["09:00", "20:00"], sat: ["09:00", "20:00"], sun: ["10:00", "16:00"] };

function doorVinyl(store: { code: string | null; name: string; hours: Hours }): Design {
  const w = 420, cx = w / 2;
  const lines = (hoursLine(store.hours) || "Hours on our store page").split(", ");
  const top = 168, step = 26, after = top + 34 + lines.length * step;
  const town = store.name.replace(/^Herbal Holland\s*/i, "").toUpperCase();
  return {
    key: store.code ? `door-vinyl-${store.code}` : "door-vinyl",
    name: `Door vinyl${store.code ? `, ${store.name}` : ""} (sample hours)`.replace(" (sample hours)", store.code ? "" : " (sample hours)"),
    w, h: after + 150, ink: SUNSET, ground: null,
    how: "Cut Sunset vinyl, applied to the outside of the door glass at eye level (centre 1,500 mm from the floor). One colour, no background.",
    body: (
      <>
        <M x={cx - 40} y={0} size={80} />
        <Words x={cx} y={96} width={190} size={30} />
        {town && <T text={town} weight={500} size={17} width={Math.min(300, town.length * 17)} x={cx} y={top} />}
        <rect x={cx - 150} y={top + 14} width={300} height={1.6} fill="currentColor" />
        {lines.map((l, i) => (
          <T key={l} text={l} weight={400} size={15} width={widthOf(l, 400, 15, 0.02)} x={cx} y={top + 46 + i * step} />
        ))}
        <rect x={cx - 150} y={after} width={300} height={1.6} fill="currentColor" />
        <T text="MEMBERS ONLY · ADULTS 18+" weight={700} size={16} width={300} x={cx} y={after + 38} />
        <T text="Join in store or at shop.herbalholland.com" weight={400} size={13} width={widthOf("Join in store or at shop.herbalholland.com", 400, 13, 0.01)} x={cx} y={after + 70} />
        <T text={TAGLINE} weight={500} size={10} width={240} x={cx} y={after + 120} />
      </>
    ),
  };
}

const DESIGNS: Design[] = [
  fascia("fascia-4800", "Fascia, 4,800 × 900 mm (street front)", 4800, 900, "Black aluminium composite panel (3 mm ACM). The frame is 40 mm Sunset LED neon flex; the Mark and lettering are built-up channel letters, 50 mm deep, Sunset acrylic faces, face-lit (warm white LEDs behind Sunset acrylic). Lit dusk to 22:00 on a timer."),
  fascia("fascia-2400", "Fascia, 2,400 × 600 mm (mall bulkhead, narrow fronts)", 2400, 600, "Black ACM panel. Frame, Mark and lettering in 10 mm flat-cut Sunset acrylic, pinned 20 mm off the panel and halo-lit (white LEDs behind). Check the centre's signage criteria first."),
  {
    key: "blade-600", name: "Projecting blade sign, Ø600 mm (double-sided)", w: 600, h: 600, ink: SUNSET, ground: INK,
    how: "Round double-sided lightbox, 120 mm deep, black powder-coated, on a wall bracket at least 2,400 mm above the pavement. Faces: black-printed opal acrylic with the artwork left clear so it glows Sunset (or Sunset vinyl on opal). Same artwork both sides.",
    body: (
      <>
        <circle cx={300} cy={300} r={284} fill="none" stroke="currentColor" strokeWidth={9} />
        <Arc cx={300} cy={300} r={226} size={40} weight={700} text="HERBAL HOLLAND" />
        <Arc cx={300} cy={300} r={226} size={24} weight={500} tracking={0.16} text={TAGLINE} bottom />
        {[-1, 1].map((side) => (
          <circle key={side} cx={300 + side * (226 + 14)} cy={300} r={5} fill="currentColor" />
        ))}
        <M x={300 - 150} y={300 - 160} size={300} heavy />
      </>
    ),
  },
  {
    key: "window-poster", name: "Window poster, 1,000 × 1,250 mm", w: 1000, h: 1250, ink: SUNSET, ground: INK,
    how: "Printed on the back of clear window film (or on a black foamboard panel hung 50 mm behind the glass). The window-poster frame: our oldest brand code, the store window itself.",
    body: (() => {
      const t = 44, mark = 470, size = 108, words = 600, group = mark + 60 + size * 1.68, top = (1250 - 130 - group) / 2 + 20;
      return (
        <>
          <rect x={t / 2} y={t / 2} width={1000 - t} height={1250 - t} rx={96} fill="none" stroke="currentColor" strokeWidth={t} />
          <M x={500 - mark / 2} y={top} size={mark} />
          <Words x={500} y={top + mark + 60} width={words} size={size} />
          <T text={TAGLINE} weight={500} size={30} width={760} x={500} y={1250 - 110} />
        </>
      );
    })(),
  },
];

// ── Window stickers, in-store signs, bay headers and wall art ─────────────────────────────────────────────────────

const CUT = "Cut vinyl, one colour, no background: weeded and applied with transfer tape.";
const center = (text: string, weight: number, size: number, y: number, x: number, tracking = 0.04) => <T text={text} weight={weight} size={size} width={widthOf(text, weight, size, tracking)} x={x} y={y} />;

const WINDOW: Design[] = [
  {
    key: "window-manifestation", name: "Glass manifestation band, 1,000 × 80 mm (tiles every 250 mm)", w: 1000, h: 80, ink: SUNSET, ground: null,
    how: `${CUT} Sunset (or etch-effect frost) on every glass door and full-height pane, two bands centred 1,000 mm and 1,500 mm from the floor, so nobody walks into the glass (SANS 10400-N). The pattern repeats every 250 mm: run it the full width of the glass.`,
    body: (
      <>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <M x={i * 250 + 14} y={10} size={60} heavy />
            <T text="HERBAL HOLLAND" weight={700} size={15} width={widthOf("HERBAL HOLLAND", 700, 15, 0.06)} x={i * 250 + 84} y={46} anchor="start" />
          </g>
        ))}
      </>
    ),
  },
  {
    key: "window-mark", name: "Window Mark, Ø600 mm", w: 600, h: 600, ink: SUNSET, ground: null,
    how: `${CUT} Sunset, on the main window, centre 1,700 mm from the floor. Reverse-cut and applied from inside for a clean face that can't be scratched off.`,
    body: <M x={0} y={0} size={600} />,
  },
  {
    key: "window-members", name: "Members-only notice, 420 × 150 mm", w: 420, h: 150, ink: SUNSET, ground: null,
    how: `${CUT} Sunset, on the door glass beside the hours, centre 1,500 mm. Required wording: we sell to members only, adults 18+.`,
    body: (
      <>
        <T text="MEMBERS ONLY" weight={800} size={46} width={400} x={210} y={58} />
        <rect x={10} y={78} width={400} height={2.4} fill="currentColor" />
        <T text="ADULTS 18+ · JOIN FREE IN STORE OR ONLINE" weight={600} size={15} width={400} x={210} y={110} />
        {center("shop.herbalholland.com", 400, 15, 138, 210, 0.02)}
      </>
    ),
  },
  ...["HILLCREST", "HILTON"].map(
    (town): Design => ({
      key: `window-town-${town.toLowerCase()}`, name: `Store name, ${town[0] + town.slice(1).toLowerCase()}, 900 × 200 mm`, w: 900, h: 200, ink: SUNSET, ground: null,
      how: `${CUT} Sunset, along the top of the main window (top of the letters 100 mm below the frame), or on the fanlight above the door.`,
      body: (
        <>
          <M x={20} y={20} size={160} heavy />
          <T text="HERBAL HOLLAND" weight={600} size={30} width={420} x={210} y={62} anchor="start" />
          <T text={town} weight={800} size={92} width={widthOf(town, 800, 92, 0.06)} x={206} y={168} anchor="start" />
        </>
      ),
    }),
  ),
];

const INSIDE: Design[] = [
  {
    key: "feature-mark", name: "Feature-wall Mark, Ø1,200 mm (illuminated)", w: 1200, h: 1200, ink: SUNSET, ground: null,
    how: "The Mark on the black feature wall behind the counter, centre 1,900 mm from the floor: built-up channel letters 60 mm deep, Sunset acrylic faces, face-lit with warm white LEDs (or 30 mm Sunset neon flex on a black backing routed to this shape). This file is the face, cut as drawn.",
    body: <M x={0} y={0} size={1200} />,
  },
  ...([
    ["counter-pay", "Counter sign: Pay here", "PAY HERE", "CARD · CASH · PAYSHAP"],
    ["counter-collect", "Counter sign: Click & collect", "CLICK & COLLECT", "SHOW YOUR ORDER CODE"],
  ] as const).map(
    ([key, name, big, small]): Design => ({
      key, name: `${name}, 900 × 260 mm (hanging, double-sided)`, w: 900, h: 260, ink: SUNSET, ground: INK,
      how: "6 mm black acrylic, letters in Sunset vinyl (or UV-printed) on both faces, hung on two steel cables over the cash wrap, bottom edge 2,300 mm from the floor.",
      body: (
        <>
          <rect x={14} y={14} width={872} height={232} rx={34} fill="none" stroke="currentColor" strokeWidth={8} />
          <M x={52} y={50} size={160} heavy />
          {(() => {
            const size = Math.min(78, (78 * 610) / widthOf(big, 800, 78, 0.04));
            return <T text={big} weight={800} size={size} width={widthOf(big, 800, size, 0.04)} x={250} y={140} anchor="start" />;
          })()}
          <T text={small} weight={600} size={24} width={widthOf(small, 600, 24, 0.16)} x={252} y={196} anchor="start" />
        </>
      ),
    }),
  ),
  {
    key: "dispensary", name: "Dispensary sign, 600 × 200 mm", w: 600, h: 200, ink: SUNSET, ground: INK,
    how: "3 mm black ACM, Sunset vinyl, screwed to the wall beside the dispensary counter at 1,800 mm. Plain wording only: no product names, no claims.",
    body: (
      <>
        <M x={30} y={34} size={132} heavy />
        <T text="DISPENSARY" weight={800} size={58} width={400} x={180} y={104} anchor="start" />
        <T text="REGISTERED PATIENTS · ASK OUR DISPENSER" weight={600} size={15} width={392} x={182} y={146} anchor="start" />
      </>
    ),
  },
  {
    key: "fitting-room", name: "Fitting room, 300 × 420 mm", w: 300, h: 420, ink: SUNSET, ground: INK,
    how: "3 mm black ACM, Sunset vinyl, on the curtain rail bracket or the wall beside it at 1,600 mm.",
    body: (
      <>
        <rect x={10} y={10} width={280} height={400} rx={30} fill="none" stroke="currentColor" strokeWidth={6} />
        <M x={75} y={60} size={150} />
        <T text="FITTING" weight={800} size={46} width={220} x={150} y={300} />
        <T text="ROOM" weight={300} size={46} width={160} x={150} y={352} />
      </>
    ),
  },
];

// Licensed categories (THC) stay behind the dispensary counter, not on open shelves: no bay headers for them.
const LICENSED = new Set(["flower", "pre-rolls", "edibles", "vapes", "concentrates"]);
const BAYS: Design[] = CATEGORIES.filter((c) => !LICENSED.has(c.slug)).map((c) => {
  const name = c.name.toUpperCase();
  return {
    key: `bay-${c.slug}`, name: `Bay header: ${c.name}, 1,000 × 150 mm`, w: 1000, h: 150, ink: SUNSET, ground: INK,
    how: "3 mm black ACM header on top of each 1,000 mm shelving bay (Hilton layout), letters in Sunset vinyl or UV print. Clips to the bay uprights.",
    body: (
      <>
        <M x={24} y={22} size={106} heavy />
        <T text={name} weight={800} size={58} width={Math.min(800, widthOf(name, 800, 58, 0.08))} x={156} y={98} anchor="start" />
        <rect x={156} y={116} width={820} height={3} fill="currentColor" />
      </>
    ),
  };
});

// ── Wall art: "Holland, meet the Hills": a striped Sunset sun going down over the KZN hills, a windmill on the ridge ──
const SKY = ["#0c0a09", "#1a110d", "#2b1810", "#43200f", "#6a2e12", "#9c4517", "#d16a26"];
const HILLS = ["#5a2a14", "#3a1c10", "#22120c", "#0c0a09"];
function hills(w: number, h: number, seed = 0) {
  const horizon = h * 0.6, r = h * 0.27, cx = w * 0.64;
  const band = horizon / SKY.length;
  const ridge = (layer: number) => {
    const base = horizon + layer * h * 0.085 - h * 0.02, amp = h * (0.05 + layer * 0.012), n = 160;
    const ys = Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return base - amp * (Math.sin(t * (3.1 + layer * 0.7) + seed + layer * 1.9) * 0.6 + Math.sin(t * (7.3 + layer) + layer * 0.8) * 0.25 + Math.sin(t * 13.7 + layer * 2.3) * 0.08);
    });
    return { d: `M0 ${h} ` + ys.map((y, i) => `L${((i / n) * w).toFixed(1)} ${y.toFixed(1)}`).join(" ") + ` L${w} ${h} Z`, ys };
  };
  // Sun in horizontal slices that thin towards the horizon (the striped sun of the shirt and the window).
  const slices: [number, number][] = [];
  let y = horizon - r;
  slices.push([y, horizon - r * 0.42]);
  y = horizon - r * 0.42;
  for (let i = 0; y < horizon; i++) {
    const gap = r * (0.03 + i * 0.012), bar = r * Math.max(0.05, 0.09 - i * 0.008);
    y += gap;
    if (y >= horizon) break;
    slices.push([y, Math.min(horizon, y + bar)]);
    y += bar;
  }
  const xAt = (yy: number) => Math.sqrt(Math.max(0, r * r - (horizon - yy) ** 2));
  const slice = ([y1, y2]: [number, number]) => `M${cx - xAt(y1)} ${y1} L${cx + xAt(y1)} ${y1} A${r} ${r} 0 0 1 ${cx + xAt(y2)} ${y2} L${cx - xAt(y2)} ${y2} A${r} ${r} 0 0 1 ${cx - xAt(y1)} ${y1} Z`;
  const layers = HILLS.map((_, i) => ridge(i));
  // A smock mill on the third ridge, left of the sun: tapered tower, cap and four sails with their lattice.
  const mx = w * 0.27, i3 = Math.round((mx / w) * 160), my = layers[2].ys[i3] + h * 0.012, th = h * 0.21, hubY = my - th;
  const L = th * 0.9, sw = L * 0.2, ink = HILLS[3];
  const sail = (deg: number) => (
    <g key={deg} transform={`translate(${mx} ${hubY}) rotate(${deg})`}>
      <rect x={-th * 0.012} y={-L} width={th * 0.024} height={L} fill={ink} />
      <path
        fillRule="evenodd"
        fill={ink}
        d={`M${th * 0.012} ${-L} h${sw} v${L * 0.78} h${-sw} Z ` + Array.from({ length: 7 }, (_, k) => `M${th * 0.012 + sw * 0.18} ${-L + L * 0.03 + k * L * 0.105} h${sw * 0.64} v${L * 0.07} h${-sw * 0.64} Z`).join(" ")}
      />
    </g>
  );
  return (
    <>
      {SKY.map((c, i) => <rect key={c} x={0} y={i * band} width={w} height={band + 0.5} fill={c} />)}
      <rect x={0} y={horizon} width={w} height={h - horizon} fill={SKY[SKY.length - 1]} />
      {slices.map((s, i) => <path key={i} d={slice(s)} fill={SUNSET} />)}
      {layers.slice(0, 2).map((l, i) => <path key={i} d={l.d} fill={HILLS[i]} />)}
      <path d={layers[2].d} fill={HILLS[2]} />
      <path d={`M${mx - th * 0.22} ${my} L${mx - th * 0.1} ${hubY + th * 0.06} L${mx + th * 0.1} ${hubY + th * 0.06} L${mx + th * 0.22} ${my} Z`} fill={ink} />
      <path d={`M${mx - th * 0.13} ${hubY + th * 0.08} Q${mx} ${hubY - th * 0.12} ${mx + th * 0.13} ${hubY + th * 0.08} Z`} fill={ink} />
      {[25, 115, 205, 295].map(sail)}
      <circle cx={mx} cy={hubY} r={th * 0.03} fill={SKY[5]} />
      <path d={layers[3].d} fill={HILLS[3]} />
    </>
  );
}

const ART: Design[] = [
  {
    key: "mural-hills", name: "Mural: Holland, meet the Hills, 2,400 × 1,600 mm", w: 2400, h: 1600, ink: SUNSET, ground: null,
    how: "Feature wall opposite the counter (the Christians Village and Hilton concept). Print on matte vinyl wallpaper, or paint by colour: the sky is seven flat bands, the sun is Sunset #F5913C, the hills four flat browns to black (hex values in the file; mix to match, low-sheen acrylic). Scale up or down evenly to fit the wall.",
    body: hills(2400, 1600),
  },
  {
    key: "print-hills", name: "Framed print: Holland, meet the Hills, A1 594 × 841 mm", w: 594, h: 841, ink: SUNSET, ground: null,
    how: "Giclée or UV print on 300 g matte art paper, black aluminium frame with a 50 mm cream mount. A1 portrait.",
    body: (
      <>
        <rect width={594} height={841} fill="#fbf7f3" />
        <svg x={34} y={34} width={526} height={640} viewBox="0 0 526 640">{hills(526, 640, 1.3)}</svg>
        <g color={INK}>
          <T text="HOLLAND, MEET THE HILLS" weight={700} size={30} width={526} x={297} y={738} />
          <T text={TAGLINE} weight={500} size={15} width={330} x={297} y={786} />
        </g>
      </>
    ),
  },
  {
    key: "print-mark", name: "Framed print: the Mark, A1 594 × 841 mm", w: 594, h: 841, ink: SUNSET, ground: null,
    how: "Print on 300 g matte art paper, black frame, no mount (full bleed to the frame). A1 portrait.",
    body: (
      <>
        <rect width={594} height={841} fill={INK} />
        <rect x={34} y={34} width={526} height={773} rx={60} fill="none" stroke={SUNSET} strokeWidth={14} />
        <g color={SUNSET}>
          <M x={297 - 180} y={140} size={360} />
          <Words x={297} y={548} width={330} size={64} />
          <T text={TAGLINE} weight={500} size={17} width={380} x={297} y={738} />
        </g>
      </>
    ),
  },
  {
    key: "print-words", name: "Framed print: Dutch heritage, African soil, A1 594 × 841 mm", w: 594, h: 841, ink: INK, ground: null,
    how: "Print on 300 g matte art paper, black frame. A1 portrait. Hang as a pair with the Mark print.",
    body: (
      <>
        <rect width={594} height={841} fill={SUNSET} />
        <g color={INK}>
          <M x={60} y={60} size={110} heavy />
          <T text="DUTCH" weight={800} size={118} width={474} x={60} y={380} anchor="start" />
          <T text="HERITAGE." weight={300} size={92} width={474} x={60} y={480} anchor="start" />
          <T text="AFRICAN" weight={800} size={118} width={474} x={60} y={640} anchor="start" />
          <T text="SOIL." weight={300} size={92} width={240} x={60} y={740} anchor="start" />
        </g>
      </>
    ),
  },
];

// ── Night mock-up of a shopfront (6 m wide), to see the set together ───────────────────────────────────────────────
function Storefront({ door, fasciaD, blade, poster }: { door: Design; fasciaD: Design; blade: Design; poster: Design }) {
  const W = 6800, H = 4200, f = { x: 800, y: 380, w: 4800, h: 900 };
  const art = (d: Design, x: number, y: number, s = 1, glow = false) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} color={d.ink} filter={glow ? "url(#glow)" : undefined}>
      {d.body}
    </g>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={1600} height={1050}>
      <defs>
        <filter id="glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15110f" />
          <stop offset="1" stopColor="#0c0a09" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a211b" />
          <stop offset="1" stopColor="#3a2a1d" />
        </linearGradient>
        <radialGradient id="spill" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor={SUNSET} stopOpacity="0.16" />
          <stop offset="1" stopColor={SUNSET} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {/* Building: plaster wall, the shopfront opening, pavement */}
      <rect x={400} y={160} width={5600} height={3640} fill="#1d1916" />
      <rect x={f.x} y={f.y} width={f.w} height={f.h} fill={INK} />
      {art(fasciaD, f.x, f.y, 1, true)}
      <rect x={800} y={1420} width={4800} height={2380} fill="#141110" />
      {/* Windows and door (aluminium shopfront) */}
      <rect x={860} y={1480} width={2700} height={2320} fill="url(#glass)" />
      <rect x={3640} y={1480} width={1100} height={2320} fill="url(#glass)" />
      <rect x={4820} y={1480} width={720} height={2320} fill="url(#glass)" />
      {/* Warm interior light falling on the glass */}
      <rect x={860} y={1480} width={4680} height={2320} fill="url(#spill)" />
      {/* Window poster, hung behind the glass */}
      <rect x={1580} y={1880} width={1000} height={1250} fill={INK} />
      {art(poster, 1580, 1880, 1, true)}
      {/* Door vinyl at eye level */}
      {art(door, 3640 + (1100 - door.w) / 2, 2300 - door.h / 2 - 300, 1)}
      <rect x={3700} y={2700} width={30} height={500} rx={15} fill="#8a7f78" />
      {/* Mullions */}
      {[860, 3560, 3640, 4740, 4820, 5540].map((x) => (
        <rect key={x} x={x - 30} y={1440} width={60} height={2360} fill="#2b2522" />
      ))}
      <rect x={830} y={1440} width={4740} height={60} fill="#2b2522" />
      {/* Blade sign on its bracket */}
      <rect x={6000} y={560} width={260} height={24} fill="#2b2522" />
      <circle cx={6230} cy={900} r={300} fill={INK} stroke="#2b2522" strokeWidth={24} />
      {art(blade, 5930, 600, 1, true)}
      <rect x={6216} y={584} width={28} height={20} fill="#2b2522" />
      {/* Pavement */}
      <rect x={0} y={3800} width={W} height={400} fill="#1a1715" />
      <rect x={0} y={3800} width={W} height={10} fill="#2b2522" />
      <ellipse cx={3200} cy={3820} rx={2600} ry={70} fill={SUNSET} opacity={0.08} />
    </svg>
  );
}

// ── Write everything ───────────────────────────────────────────────────────────────────────────────────────────────
const code = process.argv[2];
let store = { code: null as string | null, name: "Herbal Holland Hillcrest", hours: SAMPLE_HOURS };
if (code) {
  const { db } = await import("../src/server/db");
  const s = await db.store.findUniqueOrThrow({ where: { code }, select: { code: true, name: true, hours: true } });
  store = { code: s.code, name: s.name, hours: parseHours(s.hours) };
}
const door = doorVinyl(store);
const all = code ? [door] : [...DESIGNS, door, ...WINDOW, ...INSIDE, ...BAYS, ...ART];

const svgOf = (d: Design, size: { width: string; height: string }, ground = false) =>
  renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${d.w} ${d.h}`} width={size.width} height={size.height} color={d.ink}>
      {ground && <rect width={d.w} height={d.h} fill={d.ground ?? "#3a2a1d"} />}
      {d.body}
    </svg>,
  );

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
const png = async (svg: string, w: number, h: number, file: string) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }));
};
for (const d of all) {
  writeFileSync(`${OUT}/${d.key}.svg`, svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` }));
  writeFileSync(`${OUT}/${d.key}.preview.svg`, svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` }, true));
  const k = 2400 / Math.max(d.w, d.h), w = Math.round(d.w * k), h = Math.round(d.h * k);
  await png(svgOf(d, { width: `${w}px`, height: `${h}px` }, true), w, h, `${OUT}/${d.key}.png`);
  await page.setContent(`<style>@page{margin:0}body{margin:0}</style>${svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` })}`);
  writeFileSync(`${OUT}/${d.key}.pdf`, await page.pdf({ width: `${d.w}mm`, height: `${d.h}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" }));
  console.log(`${d.key}: ${d.w} × ${Math.round(d.h)} mm`);
}
if (!code) {
  const byKey = Object.fromEntries(DESIGNS.map((d) => [d.key, d]));
  const scene = renderToStaticMarkup(<Storefront door={door} fasciaD={byKey["fascia-4800"]} blade={byKey["blade-600"]} poster={byKey["window-poster"]} />);
  writeFileSync(`${OUT}/storefront.svg`, scene);
  await png(scene, 1600, 1050, `${OUT}/storefront.png`);
  writeFileSync(`${OUT}/designs.json`, JSON.stringify(all.map(({ key, name, w, h, ink, ground, how }) => ({ key, name, w, h: Math.round(h), ink, ground, how })), null, 1));
}
await browser.close();
process.exit(0);
