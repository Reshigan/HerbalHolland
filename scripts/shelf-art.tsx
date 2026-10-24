// Shelf signs as artwork, at actual size, for the printer and for stores that order printed labels instead of printing
// their own from the back office (/labels/[code], which uses each store's live prices): a shelf-edge label for every
// variant and an A6 shelf talker for every product, at the national suggested retail price from the catalogue, plus
// blank templates. Licensed medicines are never shelved or priced on display, so they get none. Writes SVG and an
// actual-size PDF per sign to public/brand/shelf (scripts/print-svg.py turns the PDFs into outlined, cut-ready SVG).
//   npx tsx scripts/shelf-art.tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";
import { CATEGORIES, PRODUCTS, type ProductSeed } from "../prisma/seed-data";

const OUT = "public/brand/shelf";
const BASE = "https://shop.herbalholland.com";
const SUNSET = "#f5913c", INK = "#0c0a09", BROWN = "#b85a12", MUTED = "#6b5f57";
const font = readFileSync("node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2").toString("base64");
const FACE = `@font-face{font-family:'Outfit Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}`;
const FONT = "'Outfit Variable', Outfit, sans-serif";

const M = ({ x, y, size, heavy = true }: { x: number; y: number; size: number; heavy?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
    <MarkGlyph heavy={heavy} />
  </g>
);
const Tx = ({ x, y, size, weight, children, fill = INK, anchor = "start", spacing = 0 }: { x: number; y: number; size: number; weight: number; children: string; fill?: string; anchor?: "start" | "middle" | "end"; spacing?: number }) => (
  <text x={x} y={y} fontFamily={FONT} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} letterSpacing={spacing}>
    {children}
  </text>
);
/** Lines of `text` no wider than `chars`, at most `max` lines (the last ends with … if cut). */
const wrap = (text: string, chars: number, max: number) => {
  const out: string[] = [];
  for (const w of text.split(" ")) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + " " + w).length <= chars) out[out.length - 1] = last + " " + w;
    else out.push(w);
  }
  if (out.length > max) out.splice(max, out.length - max, ""), (out[max - 1] = out[max - 1].replace(/\s*\S*$/, "") + "…");
  return out.filter(Boolean);
};
const Qr = ({ value, x, y, size }: { value: string; x: number; y: number; size: number }) => {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules.data[r * n + c]) d += `M${c} ${r}h1v1h-1z`;
  return <path d={d} fill={INK} transform={`translate(${x} ${y}) scale(${size / n})`} />;
};
const rand = (r: number) => `R${r.toLocaleString("en-ZA").replace(/ /g, " ")}`;

type Sign = { key: string; w: number; h: number; body: React.ReactNode };
const catName = (p: ProductSeed) => CATEGORIES.find((c) => c.slug === p.cat)!.name;

/** Shelf-edge label, 63.5 × 38.1 mm (Avery L7160 / Tower W221): name and size left, price and QR right. */
function edge(p: ProductSeed | null, variant: string, price: number | null, key: string): Sign {
  const name = p ? wrap(p.name, 22, 2) : ["Product name"];
  return {
    key, w: 63.5, h: 38.1,
    body: (
      <>
        <rect width={63.5} height={38.1} fill="#ffffff" />
        <rect width={1.6} height={38.1} fill={SUNSET} />
        <g color={BROWN}><M x={4} y={2.6} size={3.6} /></g>
        <Tx x={8.4} y={5.4} size={1.95} weight={700} fill={BROWN} spacing={0.27}>{(p ? catName(p) : "Category").toUpperCase()}</Tx>
        {name.map((l, i) => <Tx key={i} x={4} y={10.6 + i * 3.6} size={3.35} weight={600}>{l}</Tx>)}
        <Tx x={4} y={11.4 + name.length * 3.6} size={2.45} weight={400} fill={MUTED}>{variant}</Tx>
        <Tx x={4} y={35.4} size={1.75} weight={400} fill={MUTED}>Incl. VAT · Adults 18+</Tx>
        <Tx x={60.9} y={9.6} size={5.2} weight={700} anchor="end">{price == null ? "R000" : rand(price)}</Tx>
        <Qr value={`${BASE}/p/${p?.slug ?? ""}`} x={49.4} y={23.4} size={11.5} />
      </>
    ),
  };
}

/** A6 shelf talker, 105 × 148 mm: one product, big. */
function talker(p: ProductSeed | null, key: string): Sign {
  const prices = p ? [...new Set(p.variants.map((v) => v[2]))].sort((a, b) => a - b) : [0];
  const name = p ? wrap(p.name, 16, 3) : ["Product name"];
  const tag = p ? wrap(p.tagline, 34, 3) : ["The tagline, in a line or two."];
  const sizes = p ? p.variants.map((v) => v[0]).join(" · ") : "Size";
  return {
    key, w: 105, h: 148,
    body: (
      <>
        <rect width={105} height={148} fill="#ffffff" />
        <g color={SUNSET}><M x={9} y={8} size={9} heavy={false} /></g>
        <Tx x={20} y={11.6} size={2.9} weight={300} spacing={0.4}>HERBAL</Tx>
        <Tx x={20} y={15} size={2.9} weight={800} spacing={0.17}>HOLLAND</Tx>
        <Tx x={96} y={14.6} size={2.3} weight={700} fill={BROWN} anchor="end" spacing={0.37}>{(p ? catName(p) : "Category").toUpperCase()}</Tx>
        <rect x={9} y={24} width={16} height={1.2} rx={0.6} fill={SUNSET} />
        {name.map((l, i) => <Tx key={i} x={9} y={36 + i * 8.2} size={7.8} weight={600}>{l}</Tx>)}
        <Tx x={9} y={36 + name.length * 8.2 + 1.4} size={3.5} weight={400} fill={MUTED}>{sizes.length > 44 ? sizes.slice(0, 43) + "…" : sizes}</Tx>
        {tag.map((l, i) => <Tx key={i} x={9} y={36 + name.length * 8.2 + 9 + i * 4.4} size={3.2} weight={400} fill="#3d342e">{l}</Tx>)}
        <Tx x={9} y={124} size={prices.length > 1 ? 9 : 10.5} weight={700}>{p ? (prices.length > 1 ? `from ${rand(prices[0])}` : rand(prices[0])) : "R000"}</Tx>
        <Qr value={`${BASE}/p/${p?.slug ?? ""}`} x={72} y={98} size={24} />
        <Tx x={84} y={126} size={2.1} weight={500} fill={MUTED} anchor="middle">Scan for details</Tx>
        <rect x={9} y={131} width={87} height={0.3} fill="#e2d9cf" />
        <Tx x={9} y={136} size={2.1} weight={400} fill={MUTED}>Suggested retail, incl. VAT · Adults 18+ only</Tx>
      </>
    ),
  };
}

const products = PRODUCTS.filter((p) => p.reg !== "THC");
const signs: Sign[] = [
  edge(null, "Size", null, "template-edge"),
  talker(null, "template-talker"),
  ...products.flatMap((p) => p.variants.map((v, i) => edge(p, v[0], v[2], `edge-${p.slug}${p.variants.length > 1 ? `-${i + 1}` : ""}`))),
  ...products.map((p) => talker(p, `talker-${p.slug}`)),
];

const svgOf = (s: Sign, unit = "mm") =>
  renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${s.w} ${s.h}`} width={`${s.w}${unit}`} height={`${s.h}${unit}`}>
      <style dangerouslySetInnerHTML={{ __html: FACE }} />
      {s.body}
    </svg>,
  );

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
for (const s of signs) {
  writeFileSync(`${OUT}/${s.key}.svg`, svgOf(s));
  await page.setContent(`<style>@page{margin:0}body{margin:0}</style>${svgOf(s)}`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(`${OUT}/${s.key}.pdf`, await page.pdf({ width: `${s.w}mm`, height: `${s.h}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" }));
}
// A preview sheet of the templates and the first products, to check the layout at a glance.
const pick = [signs[0], ...signs.filter((s) => s.key.startsWith("edge-")).slice(0, 3), signs[1], ...signs.filter((s) => s.key.startsWith("talker-")).slice(0, 2)];
await page.setViewportSize({ width: 1500, height: 900 });
await page.setContent(`<body style="margin:0;background:#555;display:flex;flex-wrap:wrap;gap:16px;padding:16px">${pick.map((s) => svgOf(s).replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${s.w * 5}" height="${s.h * 5}"`)).join("")}</body>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(`${OUT}/preview.png`, await page.screenshot({ fullPage: true }));
await browser.close();
console.log(`${signs.length} shelf signs in ${OUT}`);
