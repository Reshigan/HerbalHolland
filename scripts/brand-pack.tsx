// The brand pack: one zip with the logos in every colourway (SVG and large PNG), the product and category renders,
// the accessory mock-ups and artwork, the range sheets, the shopfront signage and the social kit.
//   npx tsx scripts/brand-pack.tsx <renders dir> <out.zip>      (renders: the jpgs scripts/render/products.py wrote)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";

const [renders, out = "Herbal-Holland-Brand-Pack.zip"] = process.argv.slice(2);
const DIR = out.replace(/\.zip$/, "");
rmSync(DIR, { recursive: true, force: true });
const SUNSET = "#f5913c", INK = "#0c0a09", CREAM = "#fbf7f3";
const font = Buffer.from(execFileSync("cat", ["node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"])).toString("base64");
const FACE = `@font-face{font-family:'Outfit Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}`;
const FONT = "'Outfit Variable', Outfit, sans-serif";

/** The wordmark as outlined text can't be made without a font engine, so the SVGs embed the font: they open anywhere. */
const Words = ({ x, y, size, anchor = "middle" }: { x: number; y: number; size: number; anchor?: "start" | "middle" }) => (
  <>
    <text x={x} y={y} textAnchor={anchor} fontFamily={FONT} fontSize={size} fontWeight={300} letterSpacing={size * 0.14} fill="currentColor">HERBAL</text>
    <text x={x} y={y + size * 0.98} textAnchor={anchor} fontFamily={FONT} fontSize={size} fontWeight={800} letterSpacing={size * 0.06} fill="currentColor">HOLLAND</text>
  </>
);
type Logo = { key: string; w: number; h: number; body: React.ReactNode };
const LOGOS: Logo[] = [
  { key: "mark", w: 100, h: 100, body: <MarkGlyph /> },
  { key: "mark-heavy", w: 100, h: 100, body: <MarkGlyph heavy /> },
  { key: "wordmark", w: 160, h: 64, body: <Words x={80} y={26} size={24} /> },
  { key: "wordmark-inline", w: 300, h: 40, body: <text x={150} y={30} textAnchor="middle" fontFamily={FONT} fontSize={26} fill="currentColor"><tspan fontWeight={300} letterSpacing={3.6}>HERBAL </tspan><tspan fontWeight={800} letterSpacing={1.6}>HOLLAND</tspan></text> },
  { key: "logo-horizontal", w: 300, h: 100, body: <><g transform="translate(0 0)"><MarkGlyph /></g><g transform="translate(112 0)"><text x={0} y={46} fontFamily={FONT} fontSize={30} fontWeight={300} letterSpacing={4.2} fill="currentColor">HERBAL</text><text x={0} y={76} fontFamily={FONT} fontSize={30} fontWeight={800} letterSpacing={1.8} fill="currentColor">HOLLAND</text></g></> },
  { key: "lockup-stacked", w: 200, h: 200, body: <><g transform="translate(50 0)"><MarkGlyph /></g><Words x={100} y={136} size={28} /></> },
];
const WAYS: [string, string, string | null][] = [["sunset-on-black", SUNSET, INK], ["black-on-sunset", INK, SUNSET], ["sunset", SUNSET, null], ["black", INK, null], ["cream", CREAM, null], ["white", "#ffffff", null]];
const svgOf = (l: Logo, ink: string, ground: string | null, px?: number) => {
  const pad = l.w * 0.12;
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${l.w + 2 * pad} ${l.h + 2 * pad}`} width={px ?? l.w + 2 * pad} height={px ? Math.round((px * (l.h + 2 * pad)) / (l.w + 2 * pad)) : l.h + 2 * pad} color={ink}>
      <style dangerouslySetInnerHTML={{ __html: FACE }} />
      {ground && <rect x={-pad} y={-pad} width={l.w + 2 * pad} height={l.h + 2 * pad} fill={ground} />}
      {l.body}
    </svg>,
  );
};

mkdirSync(`${DIR}/logos`, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
for (const l of LOGOS)
  for (const [way, ink, ground] of WAYS) {
    const name = `${l.key}.${way}`;
    writeFileSync(`${DIR}/logos/${name}.svg`, svgOf(l, ink, ground));
    const px = 4096, svg = svgOf(l, ink, ground, px);
    const h = Number(svg.match(/height="(\d+)"/)![1]);
    await page.setViewportSize({ width: px, height: h });
    await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(`${DIR}/logos/${name}.png`, await page.screenshot({ omitBackground: !ground, clip: { x: 0, y: 0, width: px, height: h } }));
  }
await browser.close();
writeFileSync(`${DIR}/logos/README.txt`, `Herbal Holland logos\n\nmark: the windmill-flower mark (open ring, tower, four petals). mark-heavy: the small-size cut for embroidery and caps.\nwordmark: stacked HERBAL / HOLLAND. wordmark-inline: one line. logo-horizontal: mark beside the words. lockup-stacked: the window-poster lock-up.\nColourways: sunset-on-black and black-on-sunset carry their ground; sunset, black, cream and white are on transparent.\nSVG is the master (the Outfit font is embedded); PNG is 4096 px wide.\nColours: Sunset ${SUNSET} (Pantone 1575 C), warm black ${INK}, cream ${CREAM}. Type: Outfit (display), Inter (text).\nClear space: the ring's stroke width on every side. Never recolour, outline, add effects or set the mark on a photo without a solid ground.\n`);

const copy = (from: string, to: string, filter?: (f: string) => boolean) => {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (!filter || filter(f)) cpSync(`${from}/${f}`, `${to}/${f}`, { recursive: true });
};
copy(renders, `${DIR}/renders/products`, (f) => f.endsWith(".jpg") && !f.startsWith("category-"));
copy(renders, `${DIR}/renders/categories`, (f) => f.startsWith("category-") && f.endsWith(".jpg"));
copy("public/merch/print/accessories", `${DIR}/accessories/mock-ups`, (f) => f.endsWith(".mockup.png"));
copy("public/merch/print/accessories", `${DIR}/accessories/artwork`, (f) => f.endsWith(".pdf") || f.endsWith(".svg") && !f.includes(".mockup") || f.endsWith(".png") && !f.includes(".mockup"));
copy("public/merch/print", `${DIR}/apparel/artwork`, (f) => /\.(pdf|svg|png)$/.test(f));
copy("public/brand/signage", `${DIR}/signage`, (f) => /\.(pdf|png)$/.test(f));
copy("public/brand/social", `${DIR}/social`);
copy("public/brand/video", `${DIR}/video`);
mkdirSync(`${DIR}/documents`, { recursive: true });
for (const f of ["Herbal-Holland-Accessories-Range.pdf", "Herbal-Holland-Accessories-Range-No-Prices.pdf", "Herbal-Holland-Accessories-Artwork.pdf", "Herbal-Holland-Shopfront-Signage.pdf"]) if (existsSync(`docs/${f}`)) cpSync(`docs/${f}`, `${DIR}/documents/${f}`);
writeFileSync(`${DIR}/README.txt`, `Herbal Holland brand pack\n\nlogos/        the mark, wordmark and lock-ups in every colourway, SVG (master) and 4096 px PNG\nrenders/      studio renders of every product and the category group shots\naccessories/  the accessory range: mock-ups and print-ready artwork (SVG, 300 dpi PNG, actual-size PDF)\napparel/      embroidery and print masters for the merch\nsignage/      fascia, blade sign, window poster and door vinyl, print-ready\nsocial/       @herbalholland avatars, covers, highlight covers and the pinned posts\nvideo/        the eight launch videos, 9:16 and 16:9\ndocuments/    the range sheets (with and without prices), the artwork spec and the signage spec\n\nAdults 18+ on everything that leaves the building. Keep product renders off social (platform rules); the logos, signage and social folders are fine.\n`);
rmSync(out, { force: true });
execFileSync("zip", ["-qr", resolve(out), basename(DIR)], { cwd: dirname(resolve(DIR)) });
rmSync(DIR, { recursive: true, force: true });
console.log(out);
