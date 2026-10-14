// Shopfront signage, drawn at actual size in millimetres: the fascia (two sizes), the projecting blade sign, the window
// poster and the door vinyl. Lettering is outlined (scripts/text-outline.py), so the files cut as they are; the Mark is
// drawn as strokes (Outline Stroke before routing). Writes SVG, PDF (actual size), a PNG preview and a preview on the
// panel's colour per design to public/brand/signage, plus a night mock-up of a shopfront (storefront.svg/.png).
//   npx tsx --env-file=.env scripts/signage-art.tsx [STORE_CODE]   (a store code: its door vinyl with its name and hours)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";
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
const all = code ? [door] : [...DESIGNS, door];

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
