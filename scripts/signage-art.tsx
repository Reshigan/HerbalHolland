// Store signage, drawn at actual size in millimetres. Outside: the fascia (two sizes), the projecting blade sign, the
// window poster, door vinyl, window stickers, the "Join free" window QR panel and the A-frame pavement board. Inside: the
// counter QR stand, till and counter signs, the welcome and members signs, a header for every shelving bay and the wall
// art. One generic set serves every store: no town, hours or address on any sign.
// Lettering is outlined (scripts/text-outline.py), so the files cut as they are; the Mark is drawn as strokes (Outline
// Stroke before routing). Writes SVG, PDF (actual size), a PNG preview and a preview on the panel's colour per design to
// public/brand/signage, plus a night mock-up of a shopfront (storefront.png), a contact sheet and README.md.
//   npx tsx scripts/signage-art.tsx            (HD=<dir> also writes 300 dpi PNGs there)
// Content rules: no prices, offers, health claims or testing / certificate / traceability claims; no leaf or smoke
// imagery; never "dispensary" outside; "Adults 18+" on every sign with a message; brand colours only; no em dashes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import QRCode from "qrcode";
import { MarkGlyph } from "../src/components/brand/logo";
import { CATEGORIES } from "../prisma/seed-data";
import { hoursLine, type Hours } from "../src/server/shop/hours";

const OUT = "public/brand/signage";
const SUNSET = "#f5913c", INK = "#0c0a09", CREAM = "#fbf7f3";

// ── The stores (from the live database, 24 Oct 2026). hours: null = not confirmed yet, so no sign shows hours. ─────
type Store = { code: string; slug: string; town: string; address: string; opening: string | null; hours: Hours | null };
// One generic set for every store (no town, hours or address): "now" is the store that's trading, "soon" the one that
// isn't open yet (its window poster says Opening soon; everything else is the same).
const STORES: Store[] = [
  { code: "ALL", slug: "", town: "", address: "", opening: null, hours: null },
  { code: "SOON", slug: "soon", town: "", address: "", opening: "soon", hours: null },
];
const JOIN = (src: string) => `https://shop.herbalholland.com/club/join?src=${src}`;

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

/** One line at its natural tracking, shrunk (never grown) so it is at most `maxW` wide. */
function Fit({ text, weight, size, maxW, x, y, tracking = 0.04, anchor = "middle" }: { text: string; weight: number; size: number; maxW: number; x: number; y: number; tracking?: number; anchor?: "start" | "middle" | "end" }) {
  const s = Math.min(size, (size * maxW) / widthOf(text, weight, size, tracking));
  return <T text={text} weight={weight} size={s} width={widthOf(text, weight, s, tracking)} x={x} y={y} anchor={anchor} />;
}

/** A QR code (error correction M) `size` wide including its 4-module quiet zone: ink modules on a cream tile. */
function QR({ url, x, y, size }: { url: string; x: number; y: number; size: number }) {
  const q = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = q.modules.size, k = size / (n + 8);
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (!q.modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < n && q.modules.get(r, e)) e++;
      d += `M${c} ${r}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }
  return (
    <>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.04} fill={CREAM} />
      <path d={d} fill={INK} transform={`translate(${x + 4 * k} ${y + 4 * k}) scale(${k})`} shapeRendering="crispEdges" />
    </>
  );
}

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
type Design = {
  key: string; name: string; w: number; h: number; ink: string; ground: string | null; how: string; body: React.ReactNode;
  side: "Outside" | "Inside"; where: string; material: string; qty: string; store?: string;
};
const AGE = "MEMBERS ONLY · ADULTS 18+";
const CUT = "Cut vinyl, one colour, no background: weeded and applied with transfer tape.";
const center = (text: string, weight: number, size: number, y: number, x: number, tracking = 0.04) => <T text={text} weight={weight} size={size} width={widthOf(text, weight, size, tracking)} x={x} y={y} />;

/** Fascia: the shopfront's orange window frame on a black panel, the horizontal lock-up inside it and the age line under it. */
function fascia(key: string, name: string, w: number, h: number, how: string, extra: Pick<Design, "where" | "material" | "qty">): Design {
  const t = h * 0.045, inset = h * 0.07, block = h * 0.52, size = block / 1.68, mark = block * 1.04, gap = block * 0.26;
  const ww = wordsWidth(size), lock = mark + gap + ww, x0 = (w - lock) / 2, cy = h * 0.45, cap = h * 0.05;
  return {
    key, name, w, h, ink: SUNSET, ground: INK, how, side: "Outside", ...extra,
    body: (
      <>
        <rect x={inset} y={inset} width={w - 2 * inset} height={h - 2 * inset} rx={h * 0.13} fill="none" stroke="currentColor" strokeWidth={t} />
        <M x={x0} y={cy - mark / 2} size={mark} heavy />
        <Words x={x0 + mark + gap} y={cy - block / 2} width={ww} size={size} anchor="start" />
        <T text={AGE} weight={600} size={cap} width={widthOf(AGE, 600, cap, 0.22)} x={w / 2} y={h - inset - t - h * 0.075} />
      </>
    ),
  };
}

const TAGLINE = "DUTCH HERITAGE · AFRICAN SOIL";
const JOIN_LINE = "Join free in store or at shop.herbalholland.com";

/** Door vinyl: name, town, hours (only where confirmed), members only, how to join. */
function doorVinyl(s: Store): Design {
  const w = 420, cx = w / 2;
  const lines = s.hours ? hoursLine(s.hours).split(", ") : [];
  const top = 168, step = 26, after = lines.length ? top + 34 + lines.length * step : top + 14;
  const town = s.town.toUpperCase();
  return {
    key: `door-vinyl${s.slug ? `-${s.slug}` : ""}`, name: "Door vinyl (every store)", store: s.slug,
    w, h: after + 150, ink: SUNSET, ground: null, side: "Outside",
    where: "Outside face of the entrance door glass, centre 1,500 mm from the floor",
    material: "Cut Sunset cast vinyl, weeded, transfer tape",
    qty: "1 per entrance door",
    how: `Cut Sunset vinyl, applied to the outside of the door glass at eye level (centre 1,500 mm from the floor). One colour, no background. The same for every store: cut a separate hours strip per store to sit under the rule if wanted.`,
    body: (
      <>
        <M x={cx - 40} y={0} size={80} />
        <Words x={cx} y={96} width={190} size={30} />
        {town && <T text={town} weight={500} size={17} width={Math.min(300, Math.max(widthOf(town, 500, 17, 0.2), town.length * 17))} x={cx} y={top} />}
        <rect x={cx - 150} y={top + 14} width={300} height={1.6} fill="currentColor" />
        {lines.map((l, i) => (
          <T key={l} text={l} weight={400} size={15} width={widthOf(l, 400, 15, 0.02)} x={cx} y={top + 46 + i * step} />
        ))}
        {lines.length > 0 && <rect x={cx - 150} y={after} width={300} height={1.6} fill="currentColor" />}
        <T text={AGE} weight={700} size={16} width={300} x={cx} y={after + 38} />
        {center(JOIN_LINE, 400, 13, after + 70, cx, 0.01)}
        <T text={TAGLINE} weight={500} size={10} width={240} x={cx} y={after + 120} />
      </>
    ),
  };
}

/** Window poster in the window-poster frame: the Mark, the wordmark, the town and the news (now open / opening on a date). */
function windowPoster(s: Store): Design {
  const t = 44, mark = 340, cx = 500;
  const status = s.opening === "soon" ? ["OPENING SOON"] : s.opening ? ["OPENING", s.opening.toUpperCase()] : ["NOW OPEN"];
  return {
    key: `window-poster${s.slug ? `-${s.slug}` : ""}`, name: `Window poster: ${s.opening === "soon" ? "Opening soon" : "Now open"}`, store: s.slug,
    w: 1000, h: 1250, ink: SUNSET, ground: INK, side: "Outside",
    where: "Main shop window, behind the glass, centre 1,500 mm from the floor",
    material: "Reverse-printed clear window film (or 5 mm black foamboard hung 50 mm behind the glass)",
    qty: s.opening ? "1 (until opening day, then swap for the Now open version)" : "1",
    how: `Printed on the back of clear window film (or on a black foamboard panel hung 50 mm behind the glass). The window-poster frame: our oldest brand code, the store window itself.${s.opening ? " For a store that isn't trading yet; on opening day swap it for the Now open version." : ""}`,
    body: (
      <>
        <rect x={t / 2} y={t / 2} width={1000 - t} height={1250 - t} rx={96} fill="none" stroke="currentColor" strokeWidth={t} />
        <M x={cx - mark / 2} y={110} size={mark} />
        <Words x={cx} y={500} width={540} size={96} />
        {s.town ? <Fit text={s.town.toUpperCase()} weight={500} size={56} maxW={720} tracking={0.22} x={cx} y={752} /> : <T text={TAGLINE} weight={500} size={40} width={640} x={cx} y={752} />}
        <rect x={180} y={800} width={640} height={5} fill="currentColor" />
        {status.length === 1 ? (
          <Fit text={status[0]} weight={800} size={130} maxW={720} tracking={0.06} x={cx} y={985} />
        ) : (
          <>
            <Fit text={status[0]} weight={800} size={104} maxW={720} tracking={0.08} x={cx} y={935} />
            <Fit text={status[1]} weight={500} size={72} maxW={720} tracking={0.08} x={cx} y={1040} />
          </>
        )}
        <T text={AGE} weight={700} size={30} width={640} x={cx} y={1132} />
      </>
    ),
  };
}

/** "Join free" window QR panel, A2 portrait. */
function windowQr(s: Store): Design {
  const w = 420, h = 594, cx = w / 2;
  return {
    key: `window-qr${s.slug ? `-${s.slug}` : ""}`, name: "Join free window QR panel, A2 420 × 594 mm", store: s.slug,
    w, h, ink: SUNSET, ground: INK, side: "Outside",
    where: "Shop window beside the door, centre 1,300 mm from the floor (reachable for a phone)",
    material: "3 mm Forex (PVC foam) or 5 mm foamboard stood 20 mm behind the glass; or printed opaque window vinyl, face-mounted",
    qty: "1",
    how: `Printed full colour (black ground, Sunset lettering, cream QR tile). The QR opens ${JOIN("window")}: test-scan the proof through the glass before printing in quantity. Keep the glass in front of the code clean and unfrosted.`,
    body: (
      <>
        <rect x={16} y={16} width={w - 32} height={h - 32} rx={44} fill="none" stroke="currentColor" strokeWidth={10} />
        <Fit text="JOIN FREE" weight={800} size={76} maxW={320} tracking={0.06} x={cx} y={112} />
        <T text="HERBAL HOLLAND REWARDS" weight={600} size={17} width={320} x={cx} y={148} />
        <QR url={JOIN("window")} x={cx - 130} y={172} size={260} />
        {center("Scan to join in a minute", 500, 21, 474, cx, 0.01)}
        {center("shop.herbalholland.com", 400, 14, 502, cx, 0.02)}
        <T text={AGE} weight={700} size={14} width={300} x={cx} y={540} />
      </>
    ),
  };
}

/** Counter QR stand, A5 portrait, to join Rewards at the till. */
function counterQr(s: Store): Design {
  const w = 148, h = 210, cx = w / 2;
  return {
    key: `counter-qr${s.slug ? `-${s.slug}` : ""}`, name: "Counter QR stand, A5 148 × 210 mm", store: s.slug,
    w, h, ink: SUNSET, ground: INK, side: "Inside",
    where: "On the cash wrap beside each card machine, facing the customer",
    material: "350 g silk card (or 3 mm Forex) in a clear acrylic A5 T-stand",
    qty: "1 per till",
    how: `Printed full colour, slotted into a clear A5 acrylic stand. The QR opens ${JOIN("counter")}, so joins at the till are counted separately from the window.`,
    body: (
      <>
        <rect x={6} y={6} width={w - 12} height={h - 12} rx={16} fill="none" stroke="currentColor" strokeWidth={3} />
        <Fit text="JOIN FREE" weight={800} size={30} maxW={112} tracking={0.06} x={cx} y={42} />
        <T text="HERBAL HOLLAND REWARDS" weight={600} size={7.2} width={112} x={cx} y={57} />
        <QR url={JOIN("counter")} x={cx - 46} y={67} size={92} />
        {center("Scan to join in a minute", 500, 8.6, 174, cx, 0.01)}
        <T text={AGE} weight={700} size={6.4} width={112} x={cx} y={191} />
      </>
    ),
  };
}


const DESIGNS: Design[] = [
  fascia("fascia-4800", "Fascia, 4,800 × 900 mm (street front)", 4800, 900, "Black aluminium composite panel (3 mm ACM). The frame is 40 mm Sunset LED neon flex; the Mark and lettering are built-up channel letters, 50 mm deep, Sunset acrylic faces, face-lit (warm white LEDs behind Sunset acrylic). The age line is 5 mm flat-cut Sunset acrylic, unlit. Lit dusk to closing on a timer.", {
    where: "Above the shopfront, centred on the opening (street-front stores: Bluff, Pietermaritzburg)", material: "3 mm black ACM, LED neon frame, 50 mm face-lit channel letters", qty: "1 (street fronts)",
  }),
  fascia("fascia-2400", "Fascia, 2,400 × 600 mm (mall bulkhead, narrow fronts)", 2400, 600, "Black ACM panel. Frame, Mark and lettering in 10 mm flat-cut Sunset acrylic, pinned 20 mm off the panel and halo-lit (white LEDs behind); the age line 5 mm flat-cut, unlit. Check the centre's signage criteria first.", {
    where: "Centre bulkhead over the shop entrance (Hillcrest, Hilton; or a narrow street front)", material: "3 mm black ACM, 10 mm halo-lit Sunset acrylic", qty: "1 (centre fronts)",
  }),
  {
    key: "blade-600", name: "Projecting blade sign, Ø600 mm (double-sided)", w: 600, h: 600, ink: SUNSET, ground: INK, side: "Outside",
    where: "Wall bracket beside the fascia, underside at least 2,400 mm above the pavement or walkway",
    material: "Round lightbox, 120 mm deep, black powder-coat, opal acrylic faces",
    qty: "1 (where the landlord or centre allows)",
    how: "Round double-sided lightbox, 120 mm deep, black powder-coated, on a wall bracket at least 2,400 mm above the pavement. Faces: black-printed opal acrylic with the artwork left clear so it glows Sunset (or Sunset vinyl on opal). Same artwork both sides.",
    body: (
      <>
        <circle cx={300} cy={300} r={284} fill="none" stroke="currentColor" strokeWidth={9} />
        <Arc cx={300} cy={300} r={226} size={40} weight={700} text="HERBAL HOLLAND" />
        <Arc cx={300} cy={300} r={226} size={24} weight={600} tracking={0.16} text={AGE} bottom />
        {[-1, 1].map((side) => (
          <circle key={side} cx={300 + side * (226 + 14)} cy={300} r={5} fill="currentColor" />
        ))}
        <M x={300 - 150} y={300 - 160} size={300} heavy />
      </>
    ),
  },
  {
    key: "a-board", name: "A-frame pavement board, A1 594 × 841 mm (both faces)", w: 594, h: 841, ink: SUNSET, ground: INK, side: "Outside",
    where: "On the pavement or walkway beside the entrance, clear of the walking line (keep 1,500 mm free); in at closing",
    material: "Printed 5 mm Correx (or 3 mm ACM) inserts in a black A1 snap-frame A-board",
    qty: "1 board, 2 prints (one per face)",
    how: "Printed full colour on 5 mm Correx (weatherproof) or 3 mm ACM, one print per face of a black A1 A-board. Check the municipality's (or centre's) rules for pavement boards; bring it in at closing.",
    body: (
      <>
        <rect x={30} y={30} width={534} height={781} rx={56} fill="none" stroke="currentColor" strokeWidth={14} />
        <M x={297 - 95} y={84} size={190} />
        <Words x={297} y={312} width={300} size={54} />
        <Fit text="NOW OPEN" weight={800} size={110} maxW={440} tracking={0.06} x={297} y={530} />
        <rect x={110} y={566} width={374} height={3} fill="currentColor" />
        {center("Join Herbal Holland", 600, 36, 630, 297, 0.01)}
        {center("Rewards free", 600, 36, 678, 297, 0.01)}
        {center("In store or at shop.herbalholland.com", 400, 17, 722, 297, 0.01)}
        <T text={AGE} weight={700} size={19} width={420} x={297} y={772} />
      </>
    ),
  },
];

// ── Window stickers, in-store signs, bay headers and wall art ─────────────────────────────────────────────────────


/** Round window sticker, Ø200 mm: a ring, a big word and a small line. */
function sticker(key: string, name: string, big: string, small: string, extra?: React.ReactNode): Design {
  return {
    key, name: `Window sticker: ${name}, Ø200 mm`, w: 200, h: 200, ink: SUNSET, ground: null, side: "Outside",
    where: "Entrance door glass, in a row at 1,200 mm from the floor (beside the handle side)",
    material: "Cut Sunset vinyl, weeded, transfer tape",
    qty: "1",
    how: `${CUT} Sunset, outside face of the entrance door glass; the three stickers in a row, 40 mm apart, centres 1,200 mm from the floor.`,
    body: (
      <>
        <circle cx={100} cy={100} r={94} fill="none" stroke="currentColor" strokeWidth={6} />
        {extra}
        <Fit text={big} weight={800} size={big.length > 4 ? 40 : 84} maxW={142} tracking={0.04} x={100} y={big.length > 4 ? 112 : 122} />
        <Fit text={small} weight={700} size={14} maxW={120} tracking={0.16} x={100} y={big.length > 4 ? 142 : 154} />
      </>
    ),
  };
}

const WINDOW: Design[] = [
  sticker("sticker-18", "Adults 18+", "18+", "ADULTS ONLY"),
  sticker("sticker-members", "Members only", "MEMBERS", "ONLY · ADULTS 18+", <M x={75} y={30} size={50} heavy />),
  sticker("sticker-id", "ID checked", "ID", "ADULTS 18+", <Fit text="WE CHECK" weight={700} size={14} maxW={100} tracking={0.2} x={100} y={50} />),
  {
    key: "window-manifestation", name: "Glass manifestation band, 1,000 × 80 mm (tiles every 250 mm)", w: 1000, h: 80, ink: SUNSET, ground: null, side: "Outside",
    where: "Every glass door and full-height pane, two bands centred 1,000 mm and 1,500 mm from the floor",
    material: "Cut Sunset vinyl (or etch-effect frost vinyl)", qty: "As needed: run the full width of every pane, 2 bands",
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
    key: "window-mark", name: "Window Mark, Ø600 mm", w: 600, h: 600, ink: SUNSET, ground: null, side: "Outside",
    where: "Main window, centre 1,700 mm from the floor (beside the poster)", material: "Reverse-cut Sunset vinyl, applied from inside", qty: "1",
    how: `${CUT} Sunset, on the main window, centre 1,700 mm from the floor. Reverse-cut and applied from inside for a clean face that can't be scratched off.`,
    body: <M x={0} y={0} size={600} />,
  },
  {
    key: "window-members", name: "Members-only notice, 420 × 150 mm", w: 420, h: 150, ink: SUNSET, ground: null, side: "Outside",
    where: "Side panel or second door leaf, centre 1,500 mm (beside the door vinyl)", material: "Cut Sunset vinyl, weeded, transfer tape", qty: "1",
    how: `${CUT} Sunset, on the glass beside the door vinyl, centre 1,500 mm. Required wording: we sell to members only, adults 18+.`,
    body: (
      <>
        <T text="MEMBERS ONLY" weight={800} size={46} width={400} x={210} y={58} />
        <rect x={10} y={78} width={400} height={2.4} fill="currentColor" />
        <T text="ADULTS 18+ · JOIN FREE IN STORE OR ONLINE" weight={600} size={15} width={400} x={210} y={110} />
        {center("shop.herbalholland.com", 400, 15, 138, 210, 0.02)}
      </>
    ),
  },
];

const INSIDE: Design[] = [
  {
    key: "feature-mark", name: "Feature-wall Mark, Ø1,200 mm (illuminated)", w: 1200, h: 1200, ink: SUNSET, ground: null, side: "Inside",
    where: "Black feature wall behind the counter, centre 1,900 mm from the floor", material: "60 mm face-lit channel letters, Sunset acrylic (or Sunset neon flex on routed black backing)", qty: "1",
    how: "The Mark on the black feature wall behind the counter, centre 1,900 mm from the floor: built-up channel letters 60 mm deep, Sunset acrylic faces, face-lit with warm white LEDs (or 30 mm Sunset neon flex on a black backing routed to this shape). This file is the face, cut as drawn.",
    body: <M x={0} y={0} size={1200} />,
  },
  ...([
    ["counter-pay", "Counter sign: Pay here", "PAY HERE", "CARD · CASH · PAYSHAP"],
    ["counter-collect", "Counter sign: Click & collect", "CLICK & COLLECT", "SHOW YOUR ORDER CODE"],
  ] as const).map(
    ([key, name, big, small]): Design => ({
      key, name: `${name}, 900 × 260 mm (hanging, double-sided)`, w: 900, h: 260, ink: SUNSET, ground: INK, side: "Inside",
      where: key === "counter-pay" ? "Hung over the till end of the cash wrap, bottom edge 2,300 mm" : "Hung over the collection end of the cash wrap, bottom edge 2,300 mm",
      material: "6 mm black acrylic, Sunset vinyl both faces, 2 steel hanging cables", qty: "1",
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
          <T text="ADULTS 18+" weight={600} size={18} width={widthOf("ADULTS 18+", 600, 18, 0.16)} x={846} y={196} anchor="end" />
        </>
      ),
    }),
  ),
  {
    key: "dispensary", name: "Dispensary sign, 600 × 200 mm (inside only)", w: 600, h: 200, ink: SUNSET, ground: INK, side: "Inside",
    where: "Wall beside the dispensary counter, 1,800 mm (stores with an authorised dispenser only; never outside or in a window)", material: "3 mm black ACM, Sunset vinyl", qty: "1 (licensed stores only)",
    how: "3 mm black ACM, Sunset vinyl, screwed to the wall beside the dispensary counter at 1,800 mm. Inside only: the word never appears on outside signs or in a window. Plain wording only: no product names, no claims.",
    body: (
      <>
        <M x={30} y={34} size={132} heavy />
        <T text="DISPENSARY" weight={800} size={58} width={400} x={180} y={104} anchor="start" />
        <T text="REGISTERED PATIENTS · ASK OUR DISPENSER" weight={600} size={15} width={392} x={182} y={140} anchor="start" />
        <T text="ADULTS 18+" weight={600} size={13} width={widthOf("ADULTS 18+", 600, 13, 0.16)} x={182} y={168} anchor="start" />
      </>
    ),
  },
  {
    key: "fitting-room", name: "Fitting room, 300 × 420 mm", w: 300, h: 420, ink: SUNSET, ground: INK, side: "Inside",
    where: "Curtain-rail bracket or the wall beside the fitting room, 1,600 mm", material: "3 mm black ACM, Sunset vinyl", qty: "1 per fitting room",
    how: "3 mm black ACM, Sunset vinyl, on the curtain rail bracket or the wall beside it at 1,600 mm.",
    body: (
      <>
        <rect x={10} y={10} width={280} height={400} rx={30} fill="none" stroke="currentColor" strokeWidth={6} />
        <M x={75} y={60} size={150} />
        <T text="FITTING" weight={800} size={46} width={220} x={150} y={300} />
        <T text="ROOM" weight={300} size={46} width={160} x={150} y={350} />
        <T text="ADULTS 18+" weight={600} size={13} width={widthOf("ADULTS 18+", 600, 13, 0.18)} x={150} y={386} />
      </>
    ),
  },
  {
    key: "till-id", name: "Till sign: ID is checked, 300 × 200 mm", w: 300, h: 200, ink: SUNSET, ground: INK, side: "Inside",
    where: "On the cash wrap at each till, facing the customer (or on the wall behind the till at 1,500 mm)",
    material: "5 mm black acrylic block (free-standing) or 3 mm ACM, Sunset vinyl", qty: "1 per till",
    how: "5 mm black acrylic counter block (or 3 mm black ACM with stand-offs on the wall behind the till), Sunset vinyl or UV print. Staff point to it before asking for ID.",
    body: (
      <>
        <rect x={8} y={8} width={284} height={184} rx={24} fill="none" stroke="currentColor" strokeWidth={5} />
        <Fit text="ID IS CHECKED" weight={800} size={44} maxW={236} tracking={0.04} x={150} y={74} />
        {center("for every purchase.", 400, 25, 110, 150, 0.01)}
        <rect x={60} y={130} width={180} height={2.4} fill="currentColor" />
        <T text="ADULTS 18+ ONLY" weight={700} size={18} width={210} x={150} y={166} />
      </>
    ),
  },
  {
    key: "inside-members", name: "Members only: join free in a minute, A3 420 × 297 mm", w: 420, h: 297, ink: SUNSET, ground: INK, side: "Inside",
    where: "Inside the entrance, first wall the customer faces, centre 1,500 mm (or on the welcome desk)",
    material: "3 mm black ACM, Sunset vinyl (or A3 print in a black frame)", qty: "1",
    how: "3 mm black ACM with Sunset vinyl or UV print, screwed or taped (VHB) to the wall just inside the door; or an A3 print in a black frame.",
    body: (
      <>
        <rect x={12} y={12} width={396} height={273} rx={34} fill="none" stroke="currentColor" strokeWidth={6} />
        <M x={185} y={34} size={50} heavy />
        <Fit text="MEMBERS ONLY" weight={800} size={60} maxW={330} tracking={0.04} x={210} y={146} />
        {center("Join free in a minute.", 400, 32, 192, 210, 0.01)}
        {center("At the till, or at shop.herbalholland.com", 400, 15, 226, 210, 0.01)}
        <T text="ADULTS 18+" weight={700} size={16} width={150} x={210} y={262} />
      </>
    ),
  },
  {
    key: "welcome", name: "Welcome: Ask us anything, 600 × 400 mm", w: 600, h: 400, ink: SUNSET, ground: INK, side: "Inside",
    where: "Facing the door as you walk in, centre 1,600 mm (or on a floor stand by the entrance)",
    material: "3 mm black ACM, Sunset vinyl (or 5 mm foamboard on a black floor stand)", qty: "1",
    how: "3 mm black ACM with Sunset vinyl or UV print, on the wall facing the door; or 5 mm foamboard on a black poster stand by the entrance.",
    body: (
      <>
        <rect x={14} y={14} width={572} height={372} rx={44} fill="none" stroke="currentColor" strokeWidth={7} />
        <M x={250} y={40} size={100} />
        <T text="WELCOME" weight={300} size={36} width={300} x={300} y={192} />
        <Fit text="ASK US ANYTHING" weight={800} size={62} maxW={500} tracking={0.04} x={300} y={262} />
        {center("Our team is happy to help you find your way around.", 400, 17, 304, 300, 0.01)}
        <T text={AGE} weight={700} size={15} width={300} x={300} y={348} />
      </>
    ),
  },
];

// Licensed categories (THC) stay behind the dispensary counter, not on open shelves: no bay headers for them.
const LICENSED = new Set(["flower", "pre-rolls", "edibles", "vapes", "concentrates"]);
const BAYS: Design[] = CATEGORIES.filter((c) => !LICENSED.has(c.slug)).map((c) => {
  const name = c.name.toUpperCase();
  return {
    key: `bay-${c.slug}`, name: `Bay header: ${c.name}, 1,000 × 150 mm`, w: 1000, h: 150, ink: SUNSET, ground: INK, side: "Inside",
    where: "On top of the shelving bay for that category, clipped to the uprights", material: "3 mm black ACM, Sunset vinyl or UV print", qty: "1 per bay of the category",
    how: "3 mm black ACM header on top of each 1,000 mm shelving bay (Hilton layout), letters in Sunset vinyl or UV print. Clips to the bay uprights.",
    body: (
      <>
        <M x={24} y={22} size={106} heavy />
        <T text={name} weight={800} size={58} width={Math.min(800, widthOf(name, 800, 58, 0.08))} x={156} y={98} anchor="start" />
        <rect x={156} y={116} width={820} height={3} fill="currentColor" />
        <T text="ADULTS 18+" weight={600} size={17} width={widthOf("ADULTS 18+", 600, 17, 0.16)} x={976} y={142} anchor="end" />
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
    side: "Inside", where: "Feature wall opposite the counter, scaled to fit", material: "Matte vinyl wallpaper, or painted in low-sheen acrylic", qty: "1 (where there is a free wall)",
    how: "Feature wall opposite the counter (the Christians Village and Hilton concept). Print on matte vinyl wallpaper, or paint by colour: the sky is seven flat bands, the sun is Sunset #F5913C, the hills four flat browns to black (hex values in the file; mix to match, low-sheen acrylic). Scale up or down evenly to fit the wall.",
    body: hills(2400, 1600),
  },
  {
    key: "print-hills", name: "Framed print: Holland, meet the Hills, A1 594 × 841 mm", w: 594, h: 841, ink: SUNSET, ground: null,
    side: "Inside", where: "Lounge or waiting wall, centre 1,600 mm", material: "300 g matte art paper, black aluminium frame, 50 mm cream mount", qty: "1",
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
    side: "Inside", where: "Lounge wall, pair with Dutch heritage print, centre 1,600 mm", material: "300 g matte art paper, black frame", qty: "1",
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
    side: "Inside", where: "Lounge wall, pair with the Mark print, centre 1,600 mm", material: "300 g matte art paper, black frame", qty: "1",
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
function Storefront({ door, fasciaD, blade, poster, qr, board }: { door: Design; fasciaD: Design; blade: Design; poster: Design; qr: Design; board: Design }) {
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
      {/* Join free QR panel in the side light, centre 1,300 mm */}
      {art(qr, 4820 + (720 - qr.w) / 2, 3800 - 1300 - qr.h / 2, 1)}
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
      {/* A-board on the pavement, left of the door */}
      <path d={`M${3000} ${3900} L${3090} ${2960} L${3640} ${2960} L${3730} ${3900}`} fill="none" stroke="#2b2522" strokeWidth={30} />
      <rect x={3070} y={2940} width={594} height={841} fill={INK} />
      {art(board, 3070, 2940, 1)}
    </svg>
  );
}

// ── Write everything ───────────────────────────────────────────────────────────────────────────────────────────────
const arg = process.argv[2]?.toLowerCase();
const only = arg ? STORES.find((s) => s.code.toLowerCase() === arg || s.slug === arg) : undefined;
if (arg && !only) throw new Error(`No store ${arg}: one of ${STORES.map((s) => `${s.code} (${s.slug})`).join(", ")}`);
const perStore = (s: Store) => (s.slug ? [windowPoster(s)] : [doorVinyl(s), windowPoster(s), windowQr(s), counterQr(s)]);
const STORE_DESIGNS = STORES.flatMap(perStore);
const all = only ? perStore(only) : [...DESIGNS, ...WINDOW, ...STORE_DESIGNS, ...INSIDE, ...BAYS, ...ART];

// Retired files: the generic door vinyl (it showed sample hours) and the generic window poster (no age line), replaced
// by one per store.
// The per-store sets are retired for one generic set: clear their files.
if (!only)
  for (const town of ["bluff", "pietermaritzburg", "hillcrest", "hilton"])
    for (const k of ["door-vinyl", "window-poster", "window-town", "window-qr", "counter-qr"])
      for (const ext of ["svg", "preview.svg", "png", "pdf"]) rmSync(`${OUT}/${k}-${town}.${ext}`, { force: true });

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
  const k = 2000 / Math.max(d.w, d.h), w = Math.round(d.w * k), h = Math.round(d.h * k);
  await png(svgOf(d, { width: `${w}px`, height: `${h}px` }, true), w, h, `${OUT}/${d.key}.png`);
  await page.setContent(`<style>@page{margin:0}body{margin:0}</style>${svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` })}`);
  writeFileSync(`${OUT}/${d.key}.pdf`, await page.pdf({ width: `${d.w}mm`, height: `${d.h}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" }));
  if (process.env.HD) {
    // 300 dpi, capped at 8,000 px on the long edge (the fascia, mural and bands are large: print those from the PDF).
    const k2 = Math.min(300 / 25.4, 8000 / Math.max(d.w, d.h)), w2 = Math.round(d.w * k2), h2 = Math.round(d.h * k2);
    mkdirSync(process.env.HD, { recursive: true });
    await png(svgOf(d, { width: `${w2}px`, height: `${h2}px` }, true), w2, h2, `${process.env.HD}/${d.key}.png`);
  }
  console.log(`${d.key}: ${d.w} × ${Math.round(d.h)} mm`);
}

if (!only) {
  const byKey = Object.fromEntries([...DESIGNS, ...STORE_DESIGNS].map((d) => [d.key, d]));
  const scene = renderToStaticMarkup(
    <Storefront door={byKey["door-vinyl"]} fasciaD={byKey["fascia-4800"]} blade={byKey["blade-600"]} poster={byKey["window-poster"]} qr={byKey["window-qr"]} board={byKey["a-board"]} />,
  );
  writeFileSync(`${OUT}/storefront.svg`, scene);
  await png(scene, 1600, 1050, `${OUT}/storefront.png`);
  writeFileSync(`${OUT}/designs.json`, JSON.stringify(all.map(({ key, name, w, h, ink, ground, side, where, material, qty, store, how }) => ({ key, name, w, h: Math.round(h), ink, ground, side, where, material, qty, store: store ?? null, how })), null, 1));

  // Contact sheet: every design small, grouped outside / per store / inside, labelled with its file and size.
  const tile = (d: { key: string; w: number; h: number }, label: string) => {
    const src = `data:image/png;base64,${readFileSync(`${OUT}/${d.key}.png`).toString("base64")}`;
    return `<figure><div class="art"><img src="${src}"></div><figcaption><b>${d.key}</b><br>${label}</figcaption></figure>`;
  };
  const mm = (d: Design) => `${d.w.toLocaleString("en-GB")} × ${Math.round(d.h).toLocaleString("en-GB")} mm`;
  const group = (title: string, ds: Design[]) => `<h2>${title}</h2><div class="grid">${ds.map((d) => tile(d, mm(d))).join("")}</div>`;
  const generic = [...DESIGNS, ...WINDOW];
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px 32px;background:${CREAM};color:${INK};font:13px/1.3 system-ui,sans-serif;width:1736px}
    h1{font-size:26px;margin:0 0 4px}p{margin:0 0 8px;color:#57534e}h2{font-size:15px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:#9a4a12}
    .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}figure{margin:0}
    .art{height:150px;display:flex;align-items:center;justify-content:center;background:#e7e0d9;border-radius:10px;padding:8px}
    .art img{max-width:100%;max-height:100%;box-shadow:0 1px 3px rgba(0,0,0,.25)}figcaption{font-size:11px;margin-top:4px;word-break:break-all}
    .scene img{width:560px;border-radius:10px}</style>
    <h1>Herbal Holland store signs</h1><p>One set for every store. Generated ${new Date().toISOString().slice(0, 10)} by scripts/signage-art.tsx. Files and placement: README.md.</p>
    <div class="scene"><img src="data:image/png;base64,${readFileSync(`${OUT}/storefront.png`).toString("base64")}"></div>
    ${group("Outside: every store", generic.filter((d) => d.side === "Outside"))}
    ${group("Door, window posters and QR: every store", STORE_DESIGNS)}
    ${group("Inside: every store", [...generic.filter((d) => d.side === "Inside"), ...INSIDE])}
    ${group("Bay headers", BAYS)}
    ${group("Wall art", ART)}`;
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.setContent(html);
  await page.waitForLoadState("load");
  writeFileSync(`${OUT}/contact-sheet.png`, await page.screenshot({ fullPage: true }));

  // README: one table of every file, then per store, then what is still pending.
  const cell = (t: string) => t.replace(/\|/g, "/");
  const row = (d: Design) => `| \`${d.key}\` (.pdf, .svg, .png) | ${d.side} | ${cell(d.where)} | ${mm(d)} | ${cell(d.material)} | ${cell(d.qty)} |`;
  const table = (ds: Design[]) => ["| File | Side | Where it goes | Size | Material | Qty per store |", "|---|---|---|---|---|---|", ...ds.map(row)].join("\n");
  const shared = [...DESIGNS, ...WINDOW, ...INSIDE, ...BAYS, ...ART];
  const readme = `# Store signs: ready-to-print files

Generated by \`npx tsx scripts/signage-art.tsx\`. Do not edit the
files by hand: change the script and re-run. Every design is drawn at actual size in millimetres.

- \`<key>.pdf\`: actual size, vector, for the printer or sign maker.
- \`<key>.svg\`: actual size, outlined lettering (no fonts needed), one colour where it is cut vinyl; for the plotter or router.
- \`<key>.png\`: preview on the panel's colour (cut vinyl previews on a brown "glass" ground, which is not printed).
- \`contact-sheet.png\`: every design at a glance. \`storefront.png\`: a night mock-up of a street front with the set together.
- \`designs.json\`: the same list as below, with the full fabrication note for each design.

Colours: Sunset orange #F5913C, warm black #0C0A09, cream #FBF7F3 (QR tiles only). No other colours. Match cut vinyl,
acrylic and paint to a printed swatch of #F5913C under the store's own lighting before ordering.

Content rules these files keep (check any reprint against them): no prices or offers; no health or medical claims; no
lab-testing, batch-testing, certificate or traceability claims; no leaf, smoke or consumption imagery; the word
"dispensary" only on the inside dispensary sign of a licensed store, never outside; "Adults 18+" on every sign that carries
a message (the Mark, the manifestation band, the store name and the wall art are brand graphics with no message).

## Signs for every store

${table(shared)}

## Door, window posters and QR codes (every store)

${table(STORE_DESIGNS)}

The window poster comes in two versions: \`window-poster\` (Now open) and \`window-poster-soon\` (Opening soon, for a store
that isn't trading yet). QR codes: window \`${JOIN("window")}\`, counter \`${JOIN("counter")}\`.

High-resolution PNGs (300 dpi, at most 8,000 px on the long edge) come from \`HD=<dir> npx tsx scripts/signage-art.tsx\`; the
PDFs and SVGs are vector and print sharp at any size.

## Shopping list per store

Outside: fascia (one of the two sizes, to suit the front), blade sign (where allowed), window poster, window
Mark, door vinyl, members-only notice, three round stickers (18+, members only, ID checked), manifestation bands on every
pane, the Join free QR panel and the A-board (two prints).
Inside: feature-wall Mark, Pay here and Click & collect hanging signs, the ID till sign and the counter QR stand at every
till, the Members only sign and the Welcome sign by the door, a bay header per shelving bay, the fitting-room sign (stores
with apparel), the dispensary sign (licensed stores with an authorised dispenser only) and the wall art.

## Still to confirm

- The door vinyl carries no hours (they differ by store): cut a separate hours strip per store to sit under the rule.
- No sign carries a phone number or email yet. Add one only once the store number is live.
- Fascia size and blade sign per store depend on the landlord's or centre's signage criteria: get approval on the proofs first.
- Test-scan every QR proof (window panel through the glass, counter stand at arm's length) before the print run.
`;
  writeFileSync(`${OUT}/README.md`, readme);
}
await browser.close();
process.exit(0);
