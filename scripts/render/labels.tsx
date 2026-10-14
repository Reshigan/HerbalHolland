// Packaging labels for the product renders (scripts/render/products.py): one PNG per product in the brand's styles, and
// render/products.json, the list Blender works from (which model each product gets, its colours and its label).
// Labels: licensed products black with Sunset type, CBD, hemp and skin care cream with a Sunset band, food and
// supplements Sunset with black type, grow on kraft. Accessories and apparel carry their merch artwork instead.
//   npx tsx scripts/render/labels.tsx <products.json from the database> <out dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../../src/components/brand/logo";

type Row = { slug: string; name: string; cat: string; reg: string; strain: string | null; tagline: string | null; variants: string | null };
const [src, out] = process.argv.slice(2);
const rows: Row[] = JSON.parse(readFileSync(src, "utf8"));
mkdirSync(`${out}/labels`, { recursive: true });

const SUNSET = "#f5913c", INK = "#141110", CREAM = "#f4ede4", KRAFT = "#b98d5f";
const STYLE: Record<string, { ground: string; ink: string; accent: string }> = {
  dark: { ground: INK, ink: SUNSET, accent: SUNSET },
  reserve: { ground: INK, ink: "#efe6da", accent: SUNSET },
  cream: { ground: CREAM, ink: INK, accent: SUNSET },
  sunset: { ground: SUNSET, ink: INK, accent: INK },
  kraft: { ground: KRAFT, ink: INK, accent: INK },
};

/** Which model each product is rendered as. Accessories and apparel are matched by slug, the rest by category. */
const MODEL: Record<string, string> = {
  "rooibos-honey-gummies": "pouch", "dark-chocolate-squares": "box", "stroopwafel-bites": "box",
  "durban-poison-disposable": "vapepen", "windmill-haze-cartridge": "cartridge", "swazi-gold-cbd-vape": "vapepen",
  "cbd-softgels": "bottle", "calm-cbd-oil-600": "dropper", "rest-cbd-oil-300": "dropper", "hemp-seed-face-oil": "dropper",
  "herbal-holland-cbd-coffee": "pouch", "rooibos-cbd-tea": "box", "cbd-body-cream": "creamjar", "recover-cbd-balm": "creamjar", "hemp-hand-cream": "creamtube",
  "black-grinder": "grinder", "sunset-grinder": "grinder", "ceramic-ashtray": "ashtray", "king-size-papers": "booklet", "sunset-papers": "booklet",
  "delft-water-pipe": "waterpipe", "hemp-wick": "spool", "kite-vaporiser": "vaporiser", "windmill-rolling-tray": "tray", "smell-proof-pouch": "softpouch",
  "uv-stash-jar": "uvjar", "sunset-cones": "conetube", "sunset-lighter": "lighter", "sunset-tips": "tips", "starter-kit": "giftbox",
  "heritage-seed-pack": "seedpack", "led-grow-light": "ledpanel", "grow-tent": "tent", "living-soil": "soilbag", "bloom-nutrient-kit": "nutrients",
  "harrington-jacket": "folded", "heritage-crewneck": "folded", "sunset-hoodie": "folded", "windmill-tee": "folded",
  "windmill-cap": "cap", "sunset-bucket-hat": "buckethat", "windmill-beanie": "beanie", "windmill-tote": "tote",
};
const BY_CAT: Record<string, string> = { flower: "jar", "pre-rolls": "tubes", concentrates: "minijar", "protein-nutrition": "tub", "collagen-supplements": "tub" };

const styleOf = (r: Row) =>
  r.slug.startsWith("reserve-") ? "reserve" : r.reg === "THC" ? "dark" : ["CBD", "CBD_TOPICAL", "HEMP"].includes(r.reg) ? "cream" : ["CBD_FOOD", "SUPPLEMENT"].includes(r.reg) ? "sunset" : r.reg === "GROW" ? "kraft" : "dark";
const KIND: Record<string, string> = { flower: "Flower", "pre-rolls": "Pre-rolls", edibles: "Edible", vapes: "Vape", concentrates: "Concentrate", wellness: "CBD", "coffee-drinks": "CBD", "protein-nutrition": "Nutrition", "skin-care": "Skin care", "collagen-supplements": "Supplement", grow: "Grow" };
const first = (v: string | null) => (v ?? "").split(" | ")[0];
const font = readFileSync("node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2").toString("base64");
const mark = (color: string) => renderToStaticMarkup(<svg viewBox="0 0 100 100" width="100%" height="100%" color={color}><MarkGlyph /></svg>);

/** A label: wrap labels are wide (the front third shows), front labels are portrait (boxes, pouches). */
function label(r: Row, s: { ground: string; ink: string; accent: string }, shape: "wrap" | "front") {
  const strain = r.strain && r.strain !== KIND[r.cat]?.toUpperCase() ? r.strain[0] + r.strain.slice(1).toLowerCase() : null;
  const eyebrow = [KIND[r.cat], strain].filter(Boolean).join(" · ");
  const w = shape === "wrap" ? 2048 : 1024, h = shape === "wrap" ? 820 : 1280;
  const body = `
    <div class="c">
      <div class="m">${mark(s.ink)}</div>
      <div class="wm"><span>HERBAL</span><b>HOLLAND</b></div>
      <div class="rule"></div>
      <div class="e">${eyebrow.toUpperCase()}</div>
      <div class="n">${r.name}</div>
      <div class="v">${first(r.variants)}</div>
      <div class="f">ADULTS 18+ · LAB-TESTED</div>
    </div>`;
  return `<!doctype html><html><head><style>
    @font-face{font-family:O;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
    html,body{margin:0;width:${w}px;height:${h}px;background:${s.ground};color:${s.ink};font-family:O}
    body{display:flex;align-items:center;justify-content:center}
    .c{width:${shape === "wrap" ? 640 : 800}px;text-align:center;display:flex;flex-direction:column;align-items:center}
    .m{width:${shape === "wrap" ? 150 : 220}px;height:${shape === "wrap" ? 150 : 220}px}
    .wm{margin-top:14px;line-height:.95;letter-spacing:.16em;font-size:${shape === "wrap" ? 30 : 44}px}.wm span{display:block;font-weight:300}.wm b{display:block;font-weight:800;letter-spacing:.07em}
    .rule{width:90px;height:6px;border-radius:3px;background:${s.accent};margin:${shape === "wrap" ? 26 : 44}px 0 ${shape === "wrap" ? 22 : 36}px}
    .e{font-weight:700;letter-spacing:.22em;font-size:${shape === "wrap" ? 22 : 30}px;opacity:.85}
    .n{font-weight:700;font-size:${shape === "wrap" ? 62 : 84}px;line-height:1.02;margin-top:12px;letter-spacing:-.01em}
    .v{font-weight:400;font-size:${shape === "wrap" ? 30 : 40}px;margin-top:14px;opacity:.85}
    .f{font-weight:600;letter-spacing:.2em;font-size:${shape === "wrap" ? 16 : 22}px;margin-top:${shape === "wrap" ? 30 : 56}px;opacity:.7}
  </style></head><body>${body}</body></html>`;
}

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
const specs = [];
for (const r of rows) {
  const model = MODEL[r.slug] ?? BY_CAT[r.cat] ?? "jar";
  const style = styleOf(r);
  const shape = ["box", "pouch", "seedpack", "soilbag", "tent", "giftbox"].includes(model) ? "front" : "wrap";
  const s = STYLE[style];
  await page.setViewportSize({ width: shape === "wrap" ? 2048 : 1024, height: shape === "wrap" ? 820 : 1280 });
  await page.setContent(label(r, s, shape));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/labels/${r.slug}.png` });
  specs.push({ slug: r.slug, name: r.name, cat: r.cat, model, style, ground: s.ground, ink: s.ink, label: `${out}/labels/${r.slug}.png`, variant: first(r.variants) });
}
writeFileSync(`${out}/products.json`, JSON.stringify(specs, null, 1));
await browser.close();
console.log(`${specs.length} labels`);
