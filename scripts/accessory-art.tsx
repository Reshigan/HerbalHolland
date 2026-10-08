// Brand artwork for the accessories: the grinder, rolling trays, papers and tips, the lighter, the ashtray. Each design
// is one colour (the Mark keeps its two colourways: Sunset on black, black on Sunset), drawn at actual size in mm, with
// the brand font embedded. Writes SVG, a 300 dpi PNG and a PDF per design to public/merch/print/accessories.
//   npx tsx scripts/accessory-art.tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";

const OUT = "public/merch/print/accessories";
const SUNSET = "#f5913c", INK = "#0c0a09";
const font = readFileSync("node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2").toString("base64");
const FACE = `@font-face{font-family:'Outfit Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}`;
const FONT = "'Outfit Variable', Outfit, sans-serif";
const TAGLINE = "DUTCH HERITAGE · AFRICAN SOIL";

const M = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
    <MarkGlyph heavy />
  </g>
);
const Line = ({ text, x, y, width, size, weight, anchor = "middle" }: { text: string; x: number; y: number; width: number; size: number; weight: number; anchor?: "start" | "middle" }) => (
  <text x={x} y={y} textLength={width} lengthAdjust="spacing" textAnchor={anchor} fontFamily={FONT} fontSize={size} fontWeight={weight} fill="currentColor">
    {text}
  </text>
);
const Words = ({ x, y, width, size, anchor = "middle" }: { x: number; y: number; width: number; size: number; anchor?: "start" | "middle" }) => (
  <>
    <Line text="HERBAL" x={x} y={y + size * 0.7} width={width * 0.93} size={size} weight={400} anchor={anchor} />
    <Line text="HOLLAND" x={x} y={y + size * 0.7 + size * 0.98} width={width} size={size} weight={800} anchor={anchor} />
  </>
);
/** Text set around a circle (clockwise from the top), for round lids. */
const Ring = ({ id, cx, cy, r, text, size }: { id: string; cx: number; cy: number; r: number; text: string; size: number }) => (
  <>
    <path id={id} d={`M ${cx} ${cy - r} a ${r} ${r} 0 1 1 -0.01 0`} fill="none" />
    <text fontFamily={FONT} fontSize={size} fontWeight={600} fill="currentColor" letterSpacing={size * 0.18}>
      <textPath href={`#${id}`} textLength={2 * Math.PI * r - size} lengthAdjust="spacing">{text}</textPath>
    </text>
  </>
);

type Design = { key: string; name: string; w: number; h: number; ink: string; ground: string; how: string; body: React.ReactNode };
const DESIGNS: Design[] = [
  {
    key: "grinder-lid", name: "Grinder lid, 63 mm", w: 63, h: 63, ink: SUNSET, ground: INK,
    how: "Laser-engraved into the anodised lid (the metal shows through); or pad-printed in Sunset",
    body: (
      <>
        <circle cx={31.5} cy={31.5} r={30.6} fill="none" stroke="currentColor" strokeWidth={0.6} />
        <Ring id="lid" cx={31.5} cy={31.5} r={26.2} size={3.3} text="HERBAL HOLLAND · DUTCH HERITAGE · AFRICAN SOIL ·" />
        <M x={18.5} y={17} size={26} />
      </>
    ),
  },
  {
    key: "grinder-band", name: "Grinder side band, 63 mm grinder", w: 190, h: 8, ink: SUNSET, ground: INK,
    how: "Laser-engraved around the top chamber",
    body: (
      <>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <M x={i * 47.5 + 1} y={0.6} size={6.8} />
            <Line text="HERBAL HOLLAND" x={i * 47.5 + 10} y={5.4} width={34} size={3.3} weight={700} anchor="start" />
          </g>
        ))}
      </>
    ),
  },
  {
    key: "tray-large", name: "Rolling tray, large 180 × 280 mm", w: 180, h: 280, ink: SUNSET, ground: INK,
    how: "Printed on the black metal tray floor; the middle stays clear to work on",
    body: (
      <>
        <rect x={9} y={9} width={162} height={262} rx={16} fill="none" stroke="currentColor" strokeWidth={4.5} />
        <M x={77} y={22} size={26} />
        <Words x={90} y={52} width={44} size={9} />
        <Line text={TAGLINE} x={90} y={259} width={118} size={4.9} weight={500} />
      </>
    ),
  },
  {
    key: "tray-small", name: "Rolling tray, small 140 × 220 mm", w: 140, h: 220, ink: SUNSET, ground: INK,
    how: "Printed on the black metal tray floor",
    body: (
      <>
        <rect x={7} y={7} width={126} height={206} rx={13} fill="none" stroke="currentColor" strokeWidth={3.6} />
        <M x={60} y={17} size={20} />
        <Words x={70} y={40.5} width={34} size={7} />
        <Line text={TAGLINE} x={70} y={203} width={92} size={3.8} weight={500} />
      </>
    ),
  },
  {
    key: "papers-cover", name: "Papers booklet, king size slim (front and back)", w: 110, h: 92, ink: SUNSET, ground: INK,
    how: "Printed on black board in Sunset; the fold is the dashed line",
    body: (
      <>
        <M x={10} y={9} size={26} />
        <Words x={42} y={12} width={40} size={8.6} anchor="start" />
        <Line text="KING SIZE SLIM · UNBLEACHED" x={42} y={38} width={56} size={3.3} weight={500} anchor="start" />
        <line x1={0} y1={46} x2={110} y2={46} stroke="currentColor" strokeWidth={0.3} strokeDasharray="1.5 1.5" />
        <Line text={TAGLINE} x={55} y={66} width={84} size={3.5} weight={500} />
        <Line text="HERBALHOLLAND.COM" x={55} y={76} width={40} size={2.6} weight={500} />
      </>
    ),
  },
  {
    key: "tips-cover", name: "Tips booklet, 60 × 30 mm", w: 60, h: 30, ink: SUNSET, ground: INK,
    how: "Printed on black board in Sunset",
    body: (
      <>
        <M x={5} y={6} size={18} />
        <Line text="HERBAL HOLLAND" x={26} y={14} width={30} size={2.9} weight={800} anchor="start" />
        <Line text="TIPS · UNBLEACHED" x={26} y={20} width={22} size={2.1} weight={500} anchor="start" />
      </>
    ),
  },
  {
    key: "lighter-wrap", name: "Lighter wrap, 24 × 60 mm", w: 24, h: 60, ink: INK, ground: SUNSET,
    how: "Printed in black on a Sunset lighter body",
    body: (
      <>
        <M x={4} y={5} size={16} />
        <g transform="translate(14.8 25) rotate(90)">
          <Line text="HERBAL HOLLAND" x={0} y={0} width={32} size={3.3} weight={800} anchor="start" />
        </g>
      </>
    ),
  },
  {
    key: "ashtray-centre", name: "Ashtray centre, 50 mm", w: 50, h: 50, ink: SUNSET, ground: INK,
    how: "Fired-on ceramic decal in the centre of a black glazed ashtray",
    body: (
      <>
        <Ring id="ash" cx={25} cy={25} r={21.5} size={2.7} text="HERBAL HOLLAND · DUTCH HERITAGE · AFRICAN SOIL ·" />
        <M x={14} y={13} size={22} />
      </>
    ),
  },
];

const svgOf = (d: Design, size: { width: string; height: string }, withGround = false) =>
  renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${d.w} ${d.h}`} width={size.width} height={size.height} color={d.ink}>
      <style dangerouslySetInnerHTML={{ __html: FACE }} />
      {withGround && <rect width={d.w} height={d.h} fill={d.ground} />}
      {d.body}
    </svg>,
  );

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
for (const d of DESIGNS) {
  writeFileSync(`${OUT}/${d.key}.svg`, svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` }));
  const w = Math.round((d.w / 25.4) * 300), h = Math.round((d.h / 25.4) * 300);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;background:transparent">${svgOf(d, { width: `${w}px`, height: `${h}px` })}</body>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(`${OUT}/${d.key}.png`, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }));
  await page.setContent(`<style>@page{margin:0}body{margin:0}</style>${svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` })}`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(`${OUT}/${d.key}.pdf`, await page.pdf({ width: `${d.w}mm`, height: `${d.h}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" }));
  // A preview on the product's own colour, for the spec sheet.
  writeFileSync(`${OUT}/${d.key}.preview.svg`, svgOf(d, { width: `${d.w}mm`, height: `${d.h}mm` }, true));
  console.log(`${d.key}: ${d.w}×${d.h} mm (${d.how})`);
}
writeFileSync(`${OUT}/designs.json`, JSON.stringify(DESIGNS.map(({ key, name, w, h, ink, ground, how }) => ({ key, name, w, h, ink, ground, how })), null, 1));
await browser.close();
