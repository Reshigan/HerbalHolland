// The accessories range sheet as two PDFs: with suggested retail prices (for HQ and the buyers) and without (for
// suppliers and printers). Each product shows its mock-up from public/merch/print/accessories and the brief for
// whoever makes it; prices come from prisma/seed-data.ts so the sheet never drifts from the catalogue.
//   npx tsx scripts/accessories-range.tsx
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PRODUCTS } from "../prisma/seed-data";

const ART = "public/merch/print/accessories";
const price = (slug: string) => {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`no product ${slug}`);
  const ps = [...new Set(p.variants.map((v) => v[2]))];
  return ps.map((r) => `R${r}`).join(" / ");
};
type Item = { slug: string; mock: string; eyebrow: string; title: string; copy: string; rows: [string, string][] };
const ITEMS: Item[] = [
  { slug: "sunset-papers", mock: "papers-sunset", eyebrow: "King size slim · 32 orange leaves + tips", title: "Sunset Papers", copy: "The signature. Ultra-thin papers in our own orange, so every roll says where it came from. Nobody else in the country has them.", rows: [["Paper", "Ultra-thin (about 14 g/m²) rice or hemp blend, tinted orange with a food-grade, plant-based colour; natural acacia gum"], ["Booklet", "Sunset board printed in black; 32 leaves + 32 tips"], ["Files", "papers-sunset (booklet), tips-sunset"]] },
  { slug: "sunset-cones", mock: "cones", eyebrow: "6 pre-rolled king size cones, orange paper", title: "Sunset Cones", copy: "The same orange paper, ready to fill: the quickest add-on to any basket online or at the till.", rows: [["Pack", "Black tube with pop lid, 6 cones, filter tips in Sunset card"], ["Label", "110 × 62 mm wrap, Sunset on black"], ["Files", "cones-tube"]] },
  { slug: "sunset-tips", mock: "tips", eyebrow: "50 perforated tips", title: "Sunset Tips", copy: "Orange card tips to match the papers. Cheap, light, letterbox-size: they ride along in every order.", rows: [["Card", "Perforated card, Sunset both sides, unbleached core"], ["Booklet", "60 × 30 mm, black on Sunset"], ["Files", "tips-sunset"]] },
  { slug: "king-size-papers", mock: "papers-classic", eyebrow: "Unbleached king size slim · 32 leaves", title: "Classic Papers", copy: "The everyday unbleached paper in the black booklet, for people who want it plain.", rows: [["Paper", "Unbleached, natural acacia gum"], ["Booklet", "Black board printed in Sunset"], ["Files", "papers-cover, tips-cover"]] },
  { slug: "black-grinder", mock: "grinder-black", eyebrow: "63 mm, four-piece, anodised aluminium", title: "The Grinder, black", copy: "Black anodised with the ring and Mark laser-engraved, so the lettering shines silver. The gift people come back for.", rows: [["Build", "Four-piece, diamond teeth, pollen screen and scraper"], ["Lid", "Laser-engraved ring and Mark; side band engraved"], ["Files", "grinder-lid, grinder-band"]] },
  { slug: "sunset-grinder", mock: "grinder-sunset", eyebrow: "63 mm, four-piece, Sunset anodised", title: "The Grinder, Sunset", copy: "The same grinder in our orange, printed in black. The one that stands out on the counter and in photos.", rows: [["Build", "As the black grinder, Sunset anodising matched to #F5913C"], ["Lid", "Pad-printed in black"], ["Files", "grinder-lid-sunset, grinder-band"]] },
  { slug: "windmill-rolling-tray", mock: "tray-large", eyebrow: "180 × 280 mm and 140 × 220 mm, black metal", title: "Rolling Tray", copy: "The window frame, the Mark and the name on a matte black tray. The middle stays clear to work on; the small one fits a coffee table, a bag and the starter kit.", rows: [["Build", "Pressed steel, rolled edges, matte black"], ["Print", "Sunset, one colour"], ["Files", "tray-large, tray-small"]] },
  { slug: "sunset-lighter", mock: "lighter", eyebrow: "Refillable, Sunset body", title: "The Lighter", copy: "An orange lighter is hard to lose and easy to spot. Refillable, with a replaceable flint.", rows: [["Body", "Sunset, printed in black"], ["Build", "Refillable, adjustable flame"], ["Files", "lighter-wrap"]] },
  { slug: "ceramic-ashtray", mock: "ashtray", eyebrow: "Ceramic, black glaze, 140 mm", title: "The Ashtray", copy: "Heavy black ceramic with the ring and Mark fired in Sunset. Made to stay out on the table.", rows: [["Build", "Stoneware, black glaze, four rests"], ["Decal", "Fired-on, Sunset, 50 mm centre"], ["Files", "ashtray-centre"]] },
  { slug: "uv-stash-jar", mock: "jar", eyebrow: "UV violet glass, 100 ml and 250 ml", title: "Stash Jar", copy: "Violet glass with a screw lid and a round Sunset label: keeps things fresh and looks good on a shelf.", rows: [["Glass", "Violet UV glass, airtight black lid"], ["Label", "58 mm round, Sunset on black"], ["Files", "jar-lid"]] },
  { slug: "smell-proof-pouch", mock: "pouch", eyebrow: "150 × 200 mm, carbon-lined", title: "Smell-proof Pouch", copy: "Black pouch with an activated-carbon lining, a combination lock and a Sunset zip pull. Discreet to carry.", rows: [["Build", "Carbon lining, water-resistant shell, lock"], ["Print", "Sunset screen print"], ["Files", "pouch-front"]] },
  { slug: "mylar-bag-small", mock: "mylar-7x10-black", eyebrow: "70 × 100 mm, zip seal, pack of 50", title: "Mylar Bag, 7 × 10 cm", copy: "The small bag for the counter: black printed in Sunset, or Sunset printed in black. Light-proof, smell-proof and food-safe, with a zip seal and a tear notch.", rows: [["Build", "Matte mylar (PET/AL/PE), zip seal, tear notch, heat-sealed base; the back plain"], ["Print", "One colour, flexo or screen: Sunset on the black bag, black on the Sunset bag"], ["Files", "mylar-7x10-black, mylar-7x10-sunset"]] },
  { slug: "mylar-bag-large", mock: "mylar-10x15-sunset", eyebrow: "100 × 150 mm, zip seal, pack of 50", title: "Mylar Bag, 10 × 15 cm", copy: "The larger bag, same print and finish in both colours. Sold in packs of 50 online and at the till; the same bags carry our own products in store.", rows: [["Build", "Matte mylar (PET/AL/PE), zip seal, tear notch, heat-sealed base; the back plain"], ["Print", "One colour, flexo or screen: Sunset on the black bag, black on the Sunset bag"], ["Files", "mylar-10x15-black, mylar-10x15-sunset"]] },
  { slug: "black-vape-pen", mock: "pen-black", eyebrow: "510 battery, 400 mAh, USB-C", title: "Black Vape Pen", copy: "A slim 510-thread battery in matte black with the Mark and the name in Sunset. Variable voltage with preheat; fits every cartridge we sell.", rows: [["Build", "Ø10.5 × 85 mm, 400 mAh, three voltage steps and preheat, USB-C, Sunset ring at the thread"], ["Print", "Pad-printed in Sunset round the body"], ["Files", "pen-wrap"]] },
  { slug: "starter-kit", mock: "kit", eyebrow: "Gift box", title: "The Starter Kit", copy: "The black grinder, a small tray, Sunset Papers, Sunset Tips and a lighter in one black box. Built for gifting, birthdays and December.", rows: [["Inside", "Grinder (black), small tray, Sunset Papers, Sunset Tips, lighter (R700 apart)"], ["Box", "Rigid black box, lid in Sunset print or foil"], ["Files", "kit-lid"]] },
];

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const img = (key: string) => `data:image/svg+xml;base64,${readFileSync(`${ART}/${key}.mockup.svg`).toString("base64")}`;
const html = (prices: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Accessories Range</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#0C0A09;--sun:#F5913C;--cream:#FBF7F3;--muted:#6b5f57;--line:#e8dfd7}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:#1c1917;font:15px/1.55 Inter,system-ui,sans-serif}
main{max-width:900px;margin:0 auto;padding:40px 16px 60px}
.cover{background:var(--ink);color:#fff;border-radius:22px;overflow:hidden;break-inside:avoid}
.cover img{display:block;width:100%}.cover .t{padding:26px 32px 32px}
.eyebrow{font:700 11px/1 Outfit,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#B85A12}
.cover .eyebrow{color:var(--sun)}
h1{font:700 40px/1.05 Outfit,sans-serif;margin:10px 0 12px}h1 em{font-style:normal;color:var(--sun)}
.cover p{color:#cfc4ba;max-width:62ch;margin:0}
h2{font:700 22px/1.2 Outfit,sans-serif;margin:6px 0 6px}.price{color:#B85A12;font-weight:600;margin-left:6px}
h3{font:700 20px/1.2 Outfit,sans-serif;margin:0 0 8px}
article{display:grid;grid-template-columns:300px minmax(0,1fr);gap:22px;align-items:center;padding:22px 0;border-bottom:1px solid var(--line);break-inside:avoid}
article img{width:100%;border-radius:16px;display:block}
article p{margin:0 0 10px;color:#3d342e}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:600;width:22%;padding:5px 10px 5px 0;vertical-align:top}td{padding:5px 0;border-top:1px solid var(--line)}
section.box{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 26px;margin:26px 0;break-inside:avoid}
.box li{margin:5px 0}.lead{color:var(--muted);margin:0 0 6px}
.why{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0 6px}
.why div{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;font-size:13.5px}.why b{display:block;font-family:Outfit;font-size:15px;margin-bottom:3px}
@media print{main{padding:0}}
</style></head><body><main>
<div class="cover"><img src="${img("kit")}" alt=""><div class="t"><div class="eyebrow">Herbal Holland accessories · one range for every store and online</div>
<h1>The orange paper. <em>Only here.</em></h1>
<p>One range for every store and the online shop. Black and Sunset, the Mark and the name, nothing else. The orange papers, cones and tips are the signature: once you've seen an orange roll, you know where it came from.</p></div></div>
<div class="why"><div><b>Consumables first</b>Papers, cones, tips and bags are bought every week. Small, cheap to post and the easiest add-on to any online order.</div><div><b>Gifts second</b>Grinders, trays, the jar, the pen and the starter kit carry the brand into homes and photos. Strong in December.</div><div><b>One look</b>Black and Sunset only, so the range reads as one shelf in store and one row online.</div></div>
${ITEMS.map((i) => `<article><img src="${img(i.mock)}" alt="${esc(i.title)} mock-up"><div><div class="eyebrow">${esc(i.eyebrow)}</div><h2>${esc(i.title)}${prices ? ` <span class="price">${price(i.slug)}</span>` : ""}</h2><p>${esc(i.copy)}</p><table>${i.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table></div></article>`).join("\n")}
<section class="box"><h3>The orange paper: what to ask the supplier for</h3>
<p class="lead">The differentiator only works if it is safe and certified. Brief every paper supplier with this, and don't launch the orange papers without the paperwork.</p>
<ul>
<li><strong>Paper:</strong> ultra-thin rice or hemp blend, about 14 g/m², natural acacia (gum arabic) gum, king size slim (110 × 44 mm) and 1¼.</li>
<li><strong>Colour:</strong> a food-grade, plant-based colourant (for example paprika extract or beta-carotene), matched as close to Sunset #F5913C as the paper allows. No azo dyes, no metallic inks, no chlorine bleaching.</li>
<li><strong>Proof before we buy:</strong> a lab certificate for heavy metals, a burn and combustion test, and the colourant's food-grade certificate. Keep them on file (HQ → Compliance) for every batch.</li>
<li><strong>Same paper for cones and tips:</strong> cones pre-rolled from the same certified paper; tips in Sunset card.</li>
<li><strong>If a tint can't be certified:</strong> fall back to unbleached paper in the orange booklet with an orange-printed watermark line on the gum edge. Same look on the shelf, no tint in the leaf.</li>
<li><strong>What we never say:</strong> no health words. Not "safer", "cleaner", "natural smoke" or anything like it. Name, size, leaves, colour. That's all.</li>
</ul></section>
<section class="box"><h3>Mylar bags and the pen: what to ask for</h3><ul>
<li><strong>Bags:</strong> matte three-layer mylar (PET / aluminium / PE), 70 × 100 mm and 100 × 150 mm, zip seal, tear notch, heat-sealed base, food-grade certificate. Black and Sunset (matched to #F5913C) bodies; one-colour print from the front files; the back plain. Child-resistant zip where the law requires it for what goes inside.</li>
<li><strong>Pen:</strong> 510-thread battery, 400 mAh, Ø10.5 × 85 mm, three voltage steps and preheat, USB-C, matte black body, Sunset ring at the thread, pad print from pen-wrap. CE/RoHS certificates and a lithium-cell transport declaration for couriers. It is an electronic delivery device under the tobacco-control rules: no display or advertising beyond what the rules allow, adults 18+ only.</li>
</ul></section>
<section class="box"><h3>Selling it</h3><ul>
<li><strong>Everywhere at once:</strong> the same range${prices ? ", prices" : ""} and photos in every store and the online shop.${prices ? " Prices here are suggested retail, to confirm against landed cost." : ""}</li>
<li><strong>Online:</strong> list the papers, cones, tips and bags as add-ons at checkout; they fit any parcel and push orders over the free-delivery line.</li>
<li><strong>At the till:</strong> papers, cones, tips, bags and lighters at the counter; grinders, trays, jars, the pen and the kit on the wall.</li>
<li><strong>Who can buy:</strong> adults 18+, members only, like everything else we sell. Check the current tobacco-control rules on displaying and advertising smoking accessories before launch.</li>
<li><strong>Files:</strong> every design is in <code>public/merch/print/accessories</code> as SVG, 300 dpi PNG and actual-size PDF.</li>
</ul></section>
</main></body></html>`;

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
for (const [file, prices] of [["docs/Herbal-Holland-Accessories-Range.pdf", true], ["docs/Herbal-Holland-Accessories-Range-No-Prices.pdf", false]] as const) {
  await page.setContent(html(prices), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(file, await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" } }));
  console.log(file);
}
await browser.close();
