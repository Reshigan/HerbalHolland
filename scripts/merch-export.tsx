// Renders the files the merch partner embroiders and prints from, from the artwork in src/components/merch/art.tsx:
//   public/merch/print/<design>.pdf   vector master at actual size, font embedded, for digitising and DTF
//   public/merch/print/<design>.svg   the same vector master as SVG
//   public/merch/print/<design>.png   300 dpi, transparent, exact size
//   public/social/<key>.jpg           1080 px squares for social posts (--social)
// Usage: npx tsx scripts/merch-export.tsx [--social] [--preview <file.png>] [--mockups <file.png>]   (contact sheets for review)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { ART, INKS, type ArtKey } from "../src/components/merch/art";
import { MerchArt } from "../src/components/merch/mockup";
import { MERCH, merchFor } from "../src/lib/merch";
import { SOCIAL_IMAGES } from "../src/lib/social";

const OUT = "public/merch/print";
const DPI = 300;
const PX_PER_MM = DPI / 25.4;
const font = readFileSync("node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2").toString("base64");
const FACE = `@font-face{font-family:'Outfit Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}`;

const svgOf = (key: ArtKey, size: { width: string; height: string }, ink?: string) => {
  const a = ART[key];
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${a.w} ${a.h}`} width={size.width} height={size.height} color={ink ?? INKS[a.ink]}>
      <style dangerouslySetInnerHTML={{ __html: FACE }} />
      {a.body}
    </svg>,
  );
};

/** Stamps a PNG as 300 dpi (pHYs chunk after IHDR). Print partners check it. */
function withDpi(png: Buffer) {
  const data = Buffer.alloc(9);
  const ppm = Math.round(DPI / 0.0254);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data.writeUInt8(1, 8);
  const type = Buffer.from("pHYs");
  const chunk = Buffer.concat([Buffer.alloc(4), type, data, Buffer.alloc(4)]);
  chunk.writeUInt32BE(9, 0);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 17);
  const ihdrEnd = 8 + 8 + 13 + 4;
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const preview = arg("--preview");
const mockups = arg("--mockups");
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
const keys = Object.keys(ART) as ArtKey[];

if (mockups) {
  const tiles = MERCH.flatMap((m) => (["front", "back"] as const).filter((side) => side === m.hero || m.prints.some((p) => p.side === side)).map((side) => `<figure style="margin:0"><div style="width:420px;height:420px;border-radius:24px;overflow:hidden">${renderToStaticMarkup(<MerchArt slug={m.slug} side={side} className="" />).replace("<svg ", '<svg width="420" height="420" ')}</div><figcaption style="font:13px system-ui;margin-top:6px">${m.slug} · ${side}</figcaption></figure>`)).join("");
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.setContent(`<style>${FACE}</style><body style="margin:0;padding:24px;background:#ece5dd;display:flex;flex-wrap:wrap;gap:20px">${tiles}</body>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: mockups, fullPage: true });
  console.log("mockups", mockups);
} else if (process.argv.includes("--social")) {
  // 1080 px squares for social posts (HQ → Campaigns → Social): the window poster and each merch piece (zoomed out
  // to leave room for the name).
  mkdirSync("public/social", { recursive: true });
  const shoot = async (key: string, html: string) => {
    await page.setViewportSize({ width: 1080, height: 1080 });
    await page.setContent(`<style>${FACE}</style><body style="margin:0;width:1080px;height:1080px;position:relative;overflow:hidden;font-family:'Outfit Variable'">${html}</body>`);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(`public/social/${key}.jpg`, await page.screenshot({ type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: 1080, height: 1080 } }));
    console.log("social", key);
  };
  await shoot("brand", `<div style="width:100%;height:100%;background:${INKS.black};display:grid;place-items:center">${svgOf("window-back", { width: "662px", height: "900px" })}</div>`);
  for (const m of SOCIAL_IMAGES.slice(1).map((i) => merchFor(i.key)!)) {
    const fg = m.colour === "black" ? INKS.black : "#fbf7f3";
    const how = m.prints.some((p) => p.technique === "Embroidery") ? "Embroidered" : "Printed";
    await shoot(m.slug, `${renderToStaticMarkup(<MerchArt slug={m.slug} className="" />).replace('viewBox="0 0 120 120"', 'viewBox="-14 -26 148 148" width="1080" height="1080"').replace('<rect width="120" height="120"', '<rect x="-14" y="-26" width="148" height="148"')}<div style="position:absolute;left:64px;top:56px;color:${fg}"><div style="font-weight:600;font-size:52px;letter-spacing:-0.01em">${m.name}</div><div style="font-size:26px;margin-top:4px;opacity:.85">${how}${m.stocked ? "" : " · made to order in South Africa"}</div></div>`);
  }
} else if (preview) {
  // Contact sheet: each design at 1 mm = 1.6 px on its garment colour.
  const tiles = keys
    .map((k) => {
      const a = ART[k];
      const bg = a.ink === "sunset" ? INKS.black : INKS.sunset;
      return `<figure style="margin:0;background:${bg};padding:28px;border-radius:18px;display:flex;flex-direction:column;align-items:center;gap:14px">${svgOf(k, { width: `${a.w * 1.6}px`, height: `${a.h * 1.6}px` })}<figcaption style="font:13px system-ui;color:${a.ink === "sunset" ? "#bdb3a9" : "#0c0a09"}">${k} · ${a.w}×${a.h} mm</figcaption></figure>`;
    })
    .join("");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.setContent(`<body style="margin:0;padding:24px;background:#ece5dd;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">${tiles}</body>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: preview, fullPage: true });
  console.log("preview", preview);
} else {
  mkdirSync(OUT, { recursive: true });
  for (const k of keys) {
    const a = ART[k];
    const w = Math.round(a.w * PX_PER_MM), h = Math.round(a.h * PX_PER_MM);
    writeFileSync(`${OUT}/${k}.svg`, svgOf(k, { width: `${a.w}mm`, height: `${a.h}mm` }));
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<body style="margin:0;background:transparent">${svgOf(k, { width: `${w}px`, height: `${h}px` })}</body>`);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(`${OUT}/${k}.png`, withDpi(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } })));
    await page.setContent(`<style>@page{margin:0}body{margin:0}</style>${svgOf(k, { width: `${a.w}mm`, height: `${a.h}mm` })}`);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(`${OUT}/${k}.pdf`, await page.pdf({ width: `${a.w}mm`, height: `${a.h}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" }));
    console.log(`${k}: ${a.w}×${a.h} mm → ${w}×${h} px`);
  }
}
await browser.close();
