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
  // ── The orange line: the range's signature. Sunset ground, black ink. ──
  {
    key: "grinder-lid-sunset", name: "Grinder lid, 63 mm (Sunset anodised)", w: 63, h: 63, ink: INK, ground: SUNSET,
    how: "Pad-printed in black on the Sunset-anodised lid (engraving would show bright metal, not black)",
    body: (
      <>
        <circle cx={31.5} cy={31.5} r={30.6} fill="none" stroke="currentColor" strokeWidth={0.6} />
        <Ring id="lid2" cx={31.5} cy={31.5} r={26.2} size={3.3} text="HERBAL HOLLAND · DUTCH HERITAGE · AFRICAN SOIL ·" />
        <M x={18.5} y={17} size={26} />
      </>
    ),
  },
  {
    key: "papers-sunset", name: "Sunset Papers booklet, king size slim (front and back)", w: 110, h: 92, ink: INK, ground: SUNSET,
    how: "Printed in black on Sunset board; the leaves inside are the orange papers. The fold is the dashed line",
    body: (
      <>
        <M x={10} y={9} size={26} />
        <Line text="SUNSET" x={42} y={21} width={52} size={11} weight={800} anchor="start" />
        <Line text="PAPERS" x={42} y={31} width={52} size={11} weight={300} anchor="start" />
        <Line text="KING SIZE SLIM · 32 ORANGE LEAVES + TIPS" x={10} y={41} width={90} size={2.9} weight={600} anchor="start" />
        <line x1={0} y1={46} x2={110} y2={46} stroke="currentColor" strokeWidth={0.3} strokeDasharray="1.5 1.5" />
        <Words x={55} y={56} width={40} size={8.6} />
        <Line text={TAGLINE} x={55} y={80} width={84} size={3.5} weight={500} />
        <Line text="HERBALHOLLAND.COM" x={55} y={87} width={40} size={2.6} weight={500} />
      </>
    ),
  },
  {
    key: "tips-sunset", name: "Sunset tips booklet, 60 × 30 mm", w: 60, h: 30, ink: INK, ground: SUNSET,
    how: "Printed in black on Sunset card; the tips are perforated Sunset card",
    body: (
      <>
        <M x={5} y={6} size={18} />
        <Line text="SUNSET TIPS" x={26} y={14} width={29} size={3.6} weight={800} anchor="start" />
        <Line text="50 PERFORATED TIPS" x={26} y={20} width={24} size={2.1} weight={500} anchor="start" />
      </>
    ),
  },
  {
    key: "cones-tube", name: "Sunset Cones tube label, 110 × 62 mm (wraps a Ø20 mm tube of 6)", w: 110, h: 62, ink: SUNSET, ground: INK,
    how: "Printed label wrapped round a black tube with a pop lid; six pre-rolled king size cones in Sunset paper",
    body: (
      <>
        <M x={6} y={8} size={22} />
        <Line text="SUNSET" x={34} y={17} width={46} size={10} weight={800} anchor="start" />
        <Line text="CONES" x={34} y={27} width={46} size={10} weight={300} anchor="start" />
        <Line text="6 PRE-ROLLED KING SIZE · ORANGE PAPER" x={6} y={42} width={98} size={3.6} weight={600} anchor="start" />
        <Line text={TAGLINE} x={6} y={53} width={76} size={3} weight={500} anchor="start" />
      </>
    ),
  },
  {
    key: "jar-lid", name: "Stash jar label, Ø58 mm", w: 58, h: 58, ink: SUNSET, ground: INK,
    how: "Round black label printed in Sunset, on the front of the violet glass jar (also fits the lid)",
    body: (
      <>
        <Ring id="jar" cx={29} cy={29} r={24.4} size={3} text="HERBAL HOLLAND · KEEP IT FRESH · HERBAL HOLLAND · KEEP IT FRESH ·" />
        <M x={16} y={15} size={26} />
      </>
    ),
  },
  {
    key: "pouch-front", name: "Smell-proof pouch, 150 × 200 mm (front)", w: 150, h: 200, ink: SUNSET, ground: INK,
    how: "Screen-printed in Sunset on the black pouch; Sunset zip pull with the Mark",
    body: (
      <>
        <M x={50} y={52} size={50} />
        <Words x={75} y={112} width={70} size={14} />
        <Line text={TAGLINE} x={75} y={180} width={110} size={4.6} weight={500} />
      </>
    ),
  },
  {
    key: "kit-lid", name: "Starter kit gift box lid, 240 × 170 mm", w: 240, h: 170, ink: SUNSET, ground: INK,
    how: "Rigid black box, lid printed in Sunset (or foil); inside: grinder, small tray, Sunset Papers, tips, lighter",
    body: (
      <>
        <rect x={8} y={8} width={224} height={154} rx={18} fill="none" stroke="currentColor" strokeWidth={5} />
        <M x={98} y={26} size={44} />
        <Words x={120} y={78} width={86} size={17} />
        <Line text="THE STARTER KIT" x={120} y={136} width={120} size={7} weight={700} />
        <Line text={TAGLINE} x={120} y={150} width={140} size={4.4} weight={500} />
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

// ── Product mock-ups for the range sheet: each design on its product, drawn flat on a 640 × 480 stage ────────────────
const byKey = Object.fromEntries(DESIGNS.map((d) => [d.key, d]));
const art = (key: string, x: number, y: number, w: number, h: number, crop?: string) => {
  const d = byKey[key];
  return <svg x={x} y={y} width={w} height={h} viewBox={crop ?? `0 0 ${d.w} ${d.h}`} color={d.ink} preserveAspectRatio="xMidYMid meet">{d.body}</svg>;
};
const shadow = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.09} fill="#000" opacity={0.45} />;
const SUN_PAPER = "#f7a463";
const MOCKS: Record<string, React.ReactNode> = {
  "grinder-black": (
    <>
      {shadow(320, 420, 170)}
      <circle cx={320} cy={236} r={172} fill="#151211" stroke="#2c2622" strokeWidth={10} strokeDasharray="3 5" />
      <circle cx={320} cy={236} r={150} fill={INK} stroke="#2a2420" strokeWidth={3} />
      {art("grinder-lid", 170, 86, 300, 300)}
    </>
  ),
  "grinder-sunset": (
    <>
      {shadow(320, 420, 170)}
      <circle cx={320} cy={236} r={172} fill="#d9772c" stroke="#b85f1d" strokeWidth={10} strokeDasharray="3 5" />
      <circle cx={320} cy={236} r={150} fill={SUNSET} stroke="#e48433" strokeWidth={3} />
      {art("grinder-lid-sunset", 170, 86, 300, 300)}
    </>
  ),
  "tray-large": (
    <>
      {shadow(320, 452, 150)}
      <rect x={196} y={22} width={248} height={420} rx={26} fill="#1c1816" />
      <rect x={206} y={32} width={228} height={400} rx={20} fill={INK} />
      {art("tray-large", 206, 32, 228, 400)}
    </>
  ),
  "tray-small": (
    <>
      {shadow(320, 430, 120)}
      <rect x={220} y={62} width={200} height={358} rx={22} fill="#1c1816" />
      <rect x={229} y={71} width={182} height={340} rx={17} fill={INK} />
      {art("tray-small", 229, 71, 182, 340)}
    </>
  ),
  "papers-sunset": (
    <>
      {shadow(320, 380, 190)}
      <g transform="rotate(-6 320 250)">
        {[0, 1, 2].map((i) => <rect key={i} x={170 + i * 14} y={128 - i * 16} width={300} height={140} fill={SUN_PAPER} stroke="#e8894a" strokeWidth={1} />)}
        <rect x={150} y={150} width={340} height={142} rx={4} fill={SUNSET} />
        {art("papers-sunset", 150, 150, 340, 142, "0 0 110 46")}
      </g>
    </>
  ),
  "papers-classic": (
    <>
      {shadow(320, 380, 190)}
      <g transform="rotate(-6 320 250)">
        {[0, 1, 2].map((i) => <rect key={i} x={170 + i * 14} y={128 - i * 16} width={300} height={140} fill="#e9dcc8" stroke="#d6c6ad" strokeWidth={1} />)}
        <rect x={150} y={150} width={340} height={142} rx={4} fill={INK} />
        {art("papers-cover", 150, 150, 340, 142, "0 0 110 46")}
      </g>
    </>
  ),
  "cones": (
    <>
      {shadow(320, 430, 150)}
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${380 + i * 34} ${330 - i * 8} L${430 + i * 30} ${150 - i * 10} L${462 + i * 30} ${158 - i * 10} Z`} fill={SUN_PAPER} stroke="#e48a4b" strokeWidth={1.5} />
      ))}
      <rect x={150} y={150} width={210} height={250} rx={10} fill={INK} />
      <rect x={150} y={130} width={210} height={34} rx={8} fill="#1d1917" />
      {art("cones-tube", 150, 180, 210, 118)}
    </>
  ),
  "tips": (
    <>
      {shadow(320, 380, 160)}
      <rect x={160} y={160} width={320} height={160} rx={6} fill={SUNSET} />
      {art("tips-sunset", 160, 160, 320, 160)}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={182 + i * 10} y={130 - i * 3} width={40} height={36} fill="#f3a465" stroke="#d97a35" />)}
    </>
  ),
  "lighter": (
    <>
      {shadow(320, 440, 90)}
      <rect x={278} y={56} width={84} height={52} rx={10} fill="#bdb6b0" />
      <rect x={262} y={96} width={116} height={330} rx={22} fill={SUNSET} />
      {art("lighter-wrap", 262, 110, 116, 300)}
    </>
  ),
  "ashtray": (
    <>
      {shadow(320, 410, 200)}
      <circle cx={320} cy={236} r={190} fill="#181413" />
      <circle cx={320} cy={236} r={168} fill={INK} stroke="#2a2421" strokeWidth={4} />
      {[0, 90, 180, 270].map((r) => <rect key={r} x={312} y={42} width={16} height={34} rx={8} fill="#2b2522" transform={`rotate(${r} 320 236)`} />)}
      {art("ashtray-centre", 220, 136, 200, 200)}
    </>
  ),
  "jar": (
    <>
      {shadow(320, 440, 130)}
      <rect x={200} y={150} width={240} height={286} rx={34} fill="#2a1a3a" />
      <rect x={214} y={164} width={30} height={240} rx={15} fill="#ffffff" opacity={0.08} />
      <rect x={190} y={92} width={260} height={70} rx={14} fill={INK} stroke="#2a2421" strokeWidth={3} />
      <circle cx={320} cy={290} r={84} fill={INK} />
      {art("jar-lid", 238, 208, 164, 164)}
    </>
  ),
  "pouch": (
    <>
      {shadow(320, 450, 150)}
      <rect x={200} y={40} width={240} height={400} rx={26} fill="#141110" />
      <rect x={214} y={66} width={212} height={6} rx={3} fill="#2c2623" />
      <rect x={408} y={56} width={22} height={34} rx={7} fill={SUNSET} />
      {art("pouch-front", 200, 80, 240, 320)}
    </>
  ),
  "kit": (
    <>
      {shadow(320, 430, 230)}
      <path d="M90 140 L550 140 L560 400 L80 400 Z" fill="#171312" />
      <rect x={80} y={90} width={480} height={300} rx={14} fill={INK} stroke="#2a2421" strokeWidth={3} />
      {art("kit-lid", 80, 90, 480, 300)}
    </>
  ),
};
for (const [key, body] of Object.entries(MOCKS))
  writeFileSync(
    `${OUT}/${key}.mockup.svg`,
    renderToStaticMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width={640} height={480}>
        <style dangerouslySetInnerHTML={{ __html: FACE }} />
        <defs>
          <radialGradient id="stage" cx="0.5" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#3a302a" />
            <stop offset="1" stopColor="#1a1614" />
          </radialGradient>
        </defs>
        <rect width={640} height={480} fill="url(#stage)" />
        {body}
      </svg>,
    ),
  );
await browser.close();
