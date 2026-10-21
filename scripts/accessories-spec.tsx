// The accessories manufacturing spec, as a PDF for suppliers: no prices; every product with its dimensions, material,
// colour (Pantone, RAL, hex, CMYK), finish, print method and area, artwork file and pack, plus the brand colour chart
// and a size chart of the whole range. Mock-ups and renders come from public/; artwork sizes from designs.json.
//   npx tsx scripts/accessories-spec.tsx
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const ART = "public/merch/print/accessories";
const designs: Record<string, { w: number; h: number; ink: string; ground: string; how: string }> = Object.fromEntries(JSON.parse(readFileSync(`${ART}/designs.json`, "utf8")).map((d: { key: string }) => [d.key, d]));
const SUNSET = { name: "Sunset", hex: "#F5913C", pantone: "1575 C", ral: "2003 Pastel orange", cmyk: "0 / 52 / 80 / 0", thread: "Madeira 1278 / Isacord 1102" };
const BLACK = { name: "Warm black", hex: "#0C0A09", pantone: "Black 6 C", ral: "9005 Jet black", cmyk: "70 / 65 / 65 / 90", thread: "Madeira 1000 / Isacord 0020" };
const CREAM = { name: "Cream", hex: "#FBF7F3", pantone: "Warm Gray 1 C at 20%", ral: "9001 Cream", cmyk: "2 / 3 / 5 / 0", thread: "Madeira 1001" };
const SUN_PAPER = { name: "Sunset paper tint", hex: "#F7A463", pantone: "1565 C (target; as close as the certified colourant allows)", ral: "2003 at 70%", cmyk: "0 / 40 / 60 / 0", thread: "" };

type Spec = {
  key: string; name: string; mock: string; render?: string;
  size: string; material: string; colour: string; finish: string; print: string; art: string[]; pack: string; notes?: string;
};
const artLine = (k: string) => {
  const d = designs[k];
  const on = d.ink.toLowerCase() === SUNSET.hex.toLowerCase() ? "Sunset on black" : "black on Sunset";
  return `${k}: ${d.w} × ${d.h} mm, ${on}`;
};
const SPECS: Spec[] = [
  { key: "sunset-papers", name: "Sunset Papers", mock: "papers-sunset", size: "King size slim leaves 110 × 44 mm; booklet 110 × 46 mm closed (110 × 92 mm flat); 32 leaves + 32 tips", material: "Leaves: ultra-thin rice or hemp blend, about 14 g/m², natural acacia gum. Booklet: 300 g/m² board", colour: "Leaves tinted to the Sunset paper tint with a food-grade plant colourant; booklet Sunset board", finish: "Uncoated, matte", print: "Booklet: one-colour black, offset or digital, front and back, dashed line is the fold", art: ["papers-sunset", "tips-sunset"], pack: "25 booklets per display box; 20 boxes per carton", notes: "Certificates before first order: heavy metals, burn test, colourant food-grade. No azo dyes, no metallic inks, no chlorine bleaching" },
  { key: "sunset-cones", name: "Sunset Cones", mock: "cones", size: "6 pre-rolled king size cones, 109 mm, 26 mm tip; tube Ø20 × 115 mm", material: "Same certified Sunset paper as the papers; tips in Sunset card. Tube: black PP with pop lid", colour: "Tube black; label Sunset on black", finish: "Tube matte; label matte laminated", print: "Label: wrap 110 × 62 mm, one-colour Sunset, applied round the tube", art: ["cones-tube"], pack: "12 tubes per display; 12 displays per carton" },
  { key: "sunset-tips", name: "Sunset Tips", mock: "tips", size: "50 perforated tips 60 × 18 mm; booklet 60 × 30 mm", material: "Perforated card 240 g/m², Sunset both sides, unbleached core", colour: "Sunset card", finish: "Uncoated", print: "Cover: one-colour black", art: ["tips-sunset"], pack: "50 booklets per display box" },
  { key: "king-size-papers", name: "Classic Papers", mock: "papers-classic", size: "King size slim 110 × 44 mm; booklet 110 × 46 mm closed; 32 leaves", material: "Unbleached paper, natural acacia gum; black 300 g/m² board", colour: "Black booklet", finish: "Uncoated, matte", print: "Cover: one-colour Sunset, front and back", art: ["papers-cover", "tips-cover"], pack: "25 booklets per display box" },
  { key: "black-grinder", name: "Black Grinder", mock: "grinder-black", size: "Ø63 × 48 mm closed, four pieces; 6 mm lid, 12 mm teeth chamber, 14 mm screen chamber, 16 mm pollen base", material: "CNC aluminium 6061, diamond teeth, 100 µm stainless pollen screen, magnet in the lid, scraper", colour: "Black anodised, type II", finish: "Matte bead-blast", print: "Lid: laser engraved (silver on black). Band: laser engraved round the teeth chamber", art: ["grinder-lid", "grinder-band"], pack: "Each in a black kraft box with the Mark; 50 per carton" },
  { key: "sunset-grinder", name: "Sunset Grinder", mock: "grinder-sunset", render: "sunset-grinder", size: "As the black grinder, Ø63 × 48 mm", material: "As the black grinder", colour: "Sunset anodised, matched to Pantone 1575 C on a dyed sample before production", finish: "Matte bead-blast", print: "Lid: one-colour black pad print (not engraved). Band: engraved", art: ["grinder-lid-sunset", "grinder-band"], pack: "As the black grinder" },
  { key: "windmill-rolling-tray", name: "Rolling Tray", mock: "tray-large", size: "Large 280 × 180 × 20 mm; small 220 × 140 × 18 mm; rolled edges, R16 corners", material: "0.5 mm pressed steel", colour: "Black powder coat", finish: "Matte, smooth (no texture)", print: "Floor: one-colour Sunset, screen or UV, the middle clear", art: ["tray-large", "tray-small"], pack: "Each in a sleeve; 24 per carton" },
  { key: "sunset-lighter", name: "Sunset Lighter", mock: "lighter", size: "24 × 12 × 80 mm (body 60 mm)", material: "Refillable butane lighter, adjustable flame, replaceable flint, metal cap", colour: "Body Sunset (matched to 1575 C), cap brushed silver", finish: "Matte body", print: "One-colour black pad print, wrap 24 × 60 mm", art: ["lighter-wrap"], pack: "50 per display tray", notes: "Child-resistant ignition where the destination market requires it" },
  { key: "ceramic-ashtray", name: "Ceramic Ashtray", mock: "ashtray", size: "Ø140 × 32 mm, four rests", material: "Stoneware, 2 kg minimum", colour: "Black glaze", finish: "Satin glaze", print: "Fired-on decal in the centre, Ø50 mm, Sunset (decal colour matched to 1575 C after firing)", art: ["ashtray-centre"], pack: "Each in a kraft box; 12 per carton" },
  { key: "uv-stash-jar", name: "Stash Jar", mock: "jar", size: "100 ml: Ø55 × 75 mm. 250 ml: Ø70 × 110 mm", material: "Violet UV glass, airtight black PP lid with silicone seal", colour: "Violet glass, black lid", finish: "Gloss glass, matte lid", print: "Round label Ø58 mm, Sunset on black, matte laminated, on the front (fits the lid too)", art: ["jar-lid"], pack: "12 per carton with dividers" },
  { key: "smell-proof-pouch", name: "Smell-proof Pouch", mock: "pouch", size: "150 × 200 × 40 mm", material: "Water-resistant 600D shell, activated-carbon lining, three-digit combination lock, Sunset zip pull with the Mark", colour: "Black shell, Sunset pull", finish: "Matte", print: "Front: one-colour Sunset screen print 150 × 200 mm (the live area is the front panel)", art: ["pouch-front"], pack: "Each polybagged; 30 per carton" },
  { key: "mylar-bag-small", name: "Mylar Bag 7 × 10 cm", mock: "mylar-7x10-black", render: "mylar-bag-small", size: "70 × 100 mm outside; zip seal 12 mm below the top; tear notch both sides; 8 mm bottom seal", material: "Three-layer PET / aluminium / PE, 100 µm, food-grade", colour: "Black body or Sunset body (1575 C), matte", finish: "Matte, smell-proof, light-proof", print: "One-colour flexo or screen on the front: Sunset on the black bag, black on the Sunset bag; back plain", art: ["mylar-7x10-black", "mylar-7x10-sunset"], pack: "Packs of 50, 20 packs per carton", notes: "Child-resistant zip option for bags that will hold licensed product" },
  { key: "mylar-bag-large", name: "Mylar Bag 10 × 15 cm", mock: "mylar-10x15-sunset", render: "mylar-bag-large", size: "100 × 150 mm outside; zip seal 14 mm below the top; tear notch both sides; 10 mm bottom seal", material: "As the small bag", colour: "As the small bag", finish: "As the small bag", print: "As the small bag", art: ["mylar-10x15-black", "mylar-10x15-sunset"], pack: "Packs of 50, 12 packs per carton" },
  { key: "black-vape-pen", name: "Black Vape Pen", mock: "pen-black", render: "black-vape-pen", size: "Ø10.5 × 85 mm body; 510 thread; overall 100 mm with a 45 mm cartridge", material: "Aluminium body, 400 mAh lithium cell, USB-C, three voltage steps (2.6 / 3.2 / 3.8 V) and 10 s preheat, five-click lock", colour: "Matte black body; Sunset anodised ring at the thread", finish: "Soft-touch matte", print: "One-colour Sunset pad print round the body, wrap 33 × 70 mm, the Mark at the top", art: ["pen-wrap"], pack: "Each in a black box with a USB-C cable; 50 per carton", notes: "CE, RoHS and UN38.3 certificates; lithium transport declaration for couriers" },
  { key: "starter-kit", name: "The Starter Kit", mock: "kit", size: "Box 240 × 170 × 70 mm, rigid, lift-off lid; black EVA insert cut for the grinder, small tray, papers, tips and lighter", material: "2 mm greyboard wrapped in black paper, EVA insert", colour: "Black", finish: "Matte wrap", print: "Lid: one-colour Sunset screen print or Sunset foil, 240 × 170 mm", art: ["kit-lid"], pack: "Each shrink-wrapped; 6 per carton" },
];

const img = (file: string) => (existsSync(file) ? `data:image/${file.endsWith(".webp") ? "webp" : file.endsWith(".png") ? "png" : "svg+xml"};base64,${readFileSync(file).toString("base64")}` : "");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const swatch = (c: typeof SUNSET) => `<div class="sw"><div class="chip" style="background:${c.hex}"></div><b>${c.name}</b><table><tr><th>Hex</th><td>${c.hex}</td></tr><tr><th>Pantone</th><td>${c.pantone}</td></tr><tr><th>RAL</th><td>${c.ral}</td></tr><tr><th>CMYK</th><td>${c.cmyk}</td></tr>${c.thread ? `<tr><th>Thread</th><td>${c.thread}</td></tr>` : ""}</table></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Accessories manufacturing spec</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#0C0A09;--sun:#F5913C;--cream:#FBF7F3;--muted:#6b5f57;--line:#e8dfd7}
*{box-sizing:border-box}body{margin:0;background:#fff;color:#1c1917;font:12.5px/1.5 Inter,system-ui,sans-serif}
main{max-width:900px;margin:0 auto}
.cover{background:var(--ink);color:#fff;border-radius:22px;padding:34px 36px;break-after:page}
.eyebrow{font:700 11px/1 Outfit,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#B85A12}.cover .eyebrow{color:var(--sun)}
h1{font:700 38px/1.05 Outfit,sans-serif;margin:10px 0 12px}h1 em{font-style:normal;color:var(--sun)}
h2{font:700 24px/1.2 Outfit,sans-serif;margin:0 0 4px}h3{font:700 17px/1.2 Outfit,sans-serif;margin:18px 0 8px}
.cover p{color:#cfc4ba;max-width:66ch}
.sws{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:14px 0 22px}.sw{border:1px solid var(--line);border-radius:14px;padding:12px}.chip{height:56px;border-radius:10px;border:1px solid var(--line);margin-bottom:8px}.sw b{font-family:Outfit;display:block;margin-bottom:4px}
table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--muted);font-weight:600;width:24%;padding:4px 8px 4px 0;vertical-align:top;font-size:11.5px}td{padding:4px 0;border-top:1px solid var(--line);vertical-align:top}
.sw table th{width:34%}.sw td,.sw th{font-size:11px;border:0;padding:1.5px 0}
article{display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px;padding:16px 0;border-bottom:1px solid var(--line);break-inside:avoid}
article .pics img{width:100%;border-radius:14px;display:block;margin-bottom:8px}
.chart th,.chart td{font-size:11px;padding:5px 6px}.chart th{width:auto;border-bottom:2px solid var(--ink);color:var(--ink)}
section{break-inside:avoid}.page{break-before:page}
.note{background:var(--cream);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:10px 0}
</style></head><body><main>
<div class="cover"><div class="eyebrow">Herbal Holland · accessories · manufacturing specification</div>
<h1>The range, <em>for making.</em></h1>
<p>Fifteen products, one look: black and Sunset, the Mark and the name. Every line below gives the size, material, colour, finish, print method and print area, the artwork file and the pack. Artwork files are supplied separately as outlined SVG at actual size, PDF and 300 dpi PNG; match colours to the chart on the next page and send a pre-production sample of every colour-critical part (anodising, paper tint, decals, fabric) before the run.</p>
<p>Adults 18+ wording stays as drawn wherever it appears. No prices in this document.</p></div>

<h2>Colour chart</h2>
<div class="sws">${[SUNSET, BLACK, CREAM, SUN_PAPER].map(swatch).join("")}</div>
<div class="note">Everything in the range is one colour on its ground: <b>Sunset on black</b> or <b>black on Sunset</b>. Anodising, powder coat, paper tint, fabric and decals are matched to Pantone 1575 C by physical sample; hex and CMYK are for screen and digital print only.</div>

<h2>Size chart</h2>
<table class="chart"><tr><th>Product</th><th>Outside size</th><th>Print / artwork</th><th>Pack</th></tr>
${SPECS.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.size)}</td><td>${s.art.map((a) => esc(artLine(a))).join("<br>")}</td><td>${esc(s.pack)}</td></tr>`).join("")}
</table>

<h2 class="page">Products</h2>
${SPECS.map((s) => `<article><div class="pics"><img src="${img(`${ART}/${s.mock}.mockup.png`)}" alt="">${s.render ? `<img src="${img(`public/catalogue/products/${s.render}.webp`)}" alt="">` : ""}</div><div>
<div class="eyebrow">${esc(s.key.replace(/-/g, " "))}</div><h2>${esc(s.name)}</h2>
<table>
<tr><th>Size</th><td>${esc(s.size)}</td></tr>
<tr><th>Material</th><td>${esc(s.material)}</td></tr>
<tr><th>Colour</th><td>${esc(s.colour)}</td></tr>
<tr><th>Finish</th><td>${esc(s.finish)}</td></tr>
<tr><th>Print</th><td>${esc(s.print)}</td></tr>
<tr><th>Artwork</th><td>${s.art.map((a) => `${esc(artLine(a))}<br><span style="color:var(--muted)">${esc(designs[a].how)}</span>`).join("<br>")}</td></tr>
<tr><th>Pack</th><td>${esc(s.pack)}</td></tr>
${s.notes ? `<tr><th>Notes</th><td>${esc(s.notes)}</td></tr>` : ""}
</table></div></article>`).join("\n")}

<h3>Before the first run</h3>
<ul>
<li>A pre-production sample of every colour-critical part, approved against a Pantone 1575 C swatch in daylight.</li>
<li>Certificates on file for the papers (heavy metals, burn test, colourant), the bags (food-grade), the pen (CE, RoHS, UN38.3) and the lighter (child-resistance where required).</li>
<li>Artwork is never redrawn, outlined, stretched or recoloured; if a print area does not fit, tell us and we re-set the file.</li>
<li>Pack and carton labels carry the SKU and the product name only.</li>
</ul>
</main></body></html>`;

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const out = "docs/Herbal-Holland-Accessories-Manufacturing-Spec.pdf";
writeFileSync(out, await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" } }));
await browser.close();
console.log(out);
