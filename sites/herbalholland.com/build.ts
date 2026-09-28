// Builds herbalholland.com as static files for Cloudflare (a Worker serving static assets):
//   npx tsx sites/herbalholland.com/build.ts             → sites/herbalholland.com/dist
//   npx tsx sites/herbalholland.com/build.ts --images    also re-renders og.png, apple-touch-icon.png and favicon.ico
//                                                        into ./static with Chromium (Playwright), then builds
//   BUILD_DATE=2026-10-01 npx tsx sites/…/build.ts       builds as of a day (a press release shows from its date)
// Every page is rendered once with react-dom/server; the browser gets plain HTML, one CSS file, one small ES module and
// a tiny head script (the gate's first-paint decision; the CSP allows no inline script). CSS, JS and fonts carry a
// content hash in their names (cached for a year, immutable); HTML is served no-cache (see _headers).
// No database: the facts are in ./facts.ts, the words in ./content.ts.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dayKey } from "@/lib/format";
import { FACTS, firstStores, greatCircleKm } from "./facts";
import { site } from "./src/layout";
import { patternUrl } from "./src/art";
import { AppIcon, OG_CSS, OgCard } from "./src/og";
import { literals, mangleClasses, precomputeColors, shortenTokens, tighten } from "./src/optimize";
import { AboutPage } from "./src/pages/about";
import { CareersPage } from "./src/pages/careers";
import { ContactPage } from "./src/pages/contact";
import { FranchisePage } from "./src/pages/franchise";
import { HomePage } from "./src/pages/home";
import { NotFoundPage } from "./src/pages/notfound";
import { PressPage } from "./src/pages/press";
import { StoresPage } from "./src/pages/stores";
import { PaiaPage, PrivacyPage, TermsPage } from "./src/pages/legal";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, "..", "..");
const DIST = join(ROOT, "dist");
const STATIC = join(ROOT, "static");
const BUDGET = { js: 45_000, css: 55_000 }; // bytes, before compression
const FONTS = {
  outfit: join(REPO, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"),
  inter: join(REPO, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
};

/** The pages, served without extensions (Cloudflare maps /about to about.html). */
const PAGES: [path: string, file: string, page: FunctionComponent][] = [
  ["/", "index.html", HomePage],
  ["/about", "about.html", AboutPage],
  ["/stores", "stores.html", StoresPage],
  ["/franchise", "franchise.html", FranchisePage],
  ["/press", "press.html", PressPage],
  ["/careers", "careers.html", CareersPage],
  ["/contact", "contact.html", ContactPage],
  ["/privacy", "privacy.html", PrivacyPage],
  ["/terms", "terms.html", TermsPage],
  ["/paia", "paia.html", PaiaPage],
];

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex").slice(0, 10);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

// esbuild ships with tsx (already installed); if it's ever missing, TypeScript strips the types and the output is
// simply unminified.
type Esbuild = typeof import("esbuild");
const esbuild: Esbuild | null = await import("esbuild").catch(() => null);

async function script(file: string, format: "esm" | "iife") {
  const src = readFileSync(join(ROOT, file), "utf8");
  if (esbuild) return (await esbuild.transform(src, { loader: "ts", format, minify: true, target: "es2020", legalComments: "none" })).code;
  const ts = (await import("typescript")).default;
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText;
  return format === "iife" ? out.replace(/export\s*\{\s*\};?/g, "") : out;
}

async function styles(src: string) {
  if (esbuild) return tighten((await esbuild.transform(src, { loader: "css", minify: true, legalComments: "none" })).code);
  return tighten(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};])\s*/g, "$1").trim());
}

function emit(name: string, ext: string, body: Buffer | string) {
  const file = `assets/${name}.${hash(body)}.${ext}`;
  writeFileSync(join(DIST, file), body);
  return `/${file}`;
}

/** The share image and the icons, rendered from ./src/og.tsx with the site's CSS (fonts inlined). */
async function renderImages(css: string) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
  const face = (family: string, file: string) => `@font-face{font-family:"${family}";font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(file).toString("base64")}) format("woff2")}`;
  const head = `<meta charset="utf-8"><style>${face("Outfit Variable", FONTS.outfit)}${face("Inter Variable", FONTS.inter)}${css.replace(/@font-face\{[^}]*\}/g, "")}${OG_CSS}</style>`;
  const shoot = async (w: number, h: number, body: string, out: string, omitBackground = false) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html lang="en-ZA"><head>${head}</head><body>${body}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png", omitBackground });
    await page.close();
    if (out) writeFileSync(join(STATIC, out), png);
    return png;
  };
  mkdirSync(STATIC, { recursive: true });
  await shoot(1200, 630, renderToStaticMarkup(createElement(OgCard)), "og.png");
  await shoot(180, 180, renderToStaticMarkup(createElement(AppIcon, { size: 180 })), "apple-touch-icon.png");
  // favicon.ico: one 32 px PNG inside an ICO container (for browsers and crawlers that ask for /favicon.ico).
  const icon = readFileSync(join(STATIC, "icon.svg"), "utf8");
  const png = await shoot(32, 32, `<style>body{background:transparent}</style>${icon.replace("<svg ", '<svg width="32" height="32" ')}`, "", true);
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt8(32, 6);
  ico.writeUInt8(32, 7);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  writeFileSync(join(STATIC, "favicon.ico"), Buffer.concat([ico, png]));
  await browser.close();
  console.log("  rendered static/og.png, static/apple-touch-icon.png, static/favicon.ico");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function main() {
  const day = process.env.BUILD_DATE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.BUILD_DATE) ? process.env.BUILD_DATE : dayKey(new Date());

  // The published distances must match the coordinates they're drawn from.
  const off: string[] = [];
  for (const [key, published] of Object.entries(FACTS.km)) {
    const store = FACTS.stores.find((s) => s.key === key);
    if (!store) off.push(`facts.ts has a distance for "${key}", but no store with that key`);
    else if (Math.round(greatCircleKm(FACTS.places.amsterdam, store)) !== published)
      off.push(`Amsterdam → ${store.name} is ${greatCircleKm(FACTS.places.amsterdam, store).toFixed(1)} km by great circle, but facts.ts says ${published}`);
  }
  const [s1, s2] = FACTS.stores;
  if (s1 && s2 && Math.round(greatCircleKm(s1, s2)) !== FACTS.kmBetweenStores)
    off.push(`${s1.name} → ${s2.name} is ${greatCircleKm(s1, s2).toFixed(1)} km by great circle, but facts.ts says ${FACTS.kmBetweenStores}`);
  const first = firstStores()[0];
  if (first && !(first.key in FACTS.km)) off.push(`facts.ts needs the Amsterdam distance for ${first.name}, the first store (km.${first.key})`);
  for (const s of FACTS.stores) if (!/^\d{4}-\d{2}-\d{2}$/.test(s.opens)) off.push(`facts.ts: ${s.name} opens "${s.opens}", not a YYYY-MM-DD date`);
  if (off.length) throw new Error(off.join("\n"));
  // A store still marked "opening" after its day: the pages would go on saying when it opens.
  for (const s of FACTS.stores)
    if (s.status === "opening" && s.opens < day) console.warn(`  ⚠ facts.ts: ${s.name} was due to open on ${s.opens} but is still marked "opening": set its status to "open".`);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, "assets"), { recursive: true });

  // Fonts, then the CSS that points at them, then the scripts.
  const fonts = {
    outfit: emit("outfit", "woff2", readFileSync(FONTS.outfit)),
    inter: emit("inter", "woff2", readFileSync(FONTS.inter)),
  };
  const cssSource = readFileSync(join(ROOT, "styles/site.css"), "utf8").replace("__OUTFIT__", fonts.outfit).replace("__INTER__", fonts.inter).replace("__PATTERN__", patternUrl());
  const css = await styles(shortenTokens(precomputeColors(cssSource)));
  const mainSrc = readFileSync(join(ROOT, "client/main.ts"), "utf8");
  const bootSrc = readFileSync(join(ROOT, "client/boot.ts"), "utf8");
  const js = await script("client/main.ts", "esm");
  const boot = await script("client/boot.ts", "iife");
  const CSS_HREF = "/assets/__site_css__";
  // The store concept renders (WebP, cropped to our own storefront), fingerprinted like the rest.
  const concept = readdirSync(join(STATIC, "concept"))
    .filter((f) => f.endsWith(".webp"))
    .sort()
    .map((f) => emit(f.replace(/\.webp$/, ""), "webp", readFileSync(join(STATIC, "concept", f))));
  site.assets = { css: CSS_HREF, js: emit("site", "js", js), boot: emit("boot", "js", boot), ...fonts, concept };
  site.day = day;
  site.year = Number(day.slice(0, 4));

  // The images are drawn with the stylesheet's own token names (OG_CSS uses them), so before tokens are shortened.
  if (process.argv.includes("--images")) await renderImages(await styles(precomputeColors(cssSource)));

  // Pages.
  const problems: string[] = [];
  const files = [...PAGES.map(([, file, page]) => [file, page] as const), ["404.html", NotFoundPage] as const];
  const html = files.map(([file, page]) => {
    const h = `<!doctype html>${renderToStaticMarkup(createElement(page))}`;
    // The CSP forbids inline styles and scripts; never ship the platform's demo company details.
    if (/\sstyle="/.test(h)) problems.push(`${file}: an inline style attribute (blocked by the CSP)`);
    if (/<script(?![^>]*\b(src=|type="application\/(ld\+)?json"))/.test(h)) problems.push(`${file}: an inline script (blocked by the CSP)`);
    if (/481516|Windmill Lane/.test(h)) problems.push(`${file}: demo company details from the seed`);
    return h;
  });
  if (problems.length) throw new Error(`Build checks failed:\n  ${problems.join("\n  ")}`);
  // Short class names in the CSS and the pages alike, then the stylesheet gets its content hash.
  const small = mangleClasses(css, html, [mainSrc, bootSrc].flatMap(literals));
  site.assets.css = emit("site", "css", small.css);
  files.forEach(([file], i) => writeFileSync(join(DIST, file), small.pages[i].replace(CSS_HREF, site.assets.css)));

  // Static files from ./static (the site keeps its own copies): the icon, share image, press logos.
  for (const f of ["icon.svg", "og.png", "apple-touch-icon.png", "favicon.ico"]) {
    if (!existsSync(join(STATIC, f))) throw new Error(`static/${f} is missing${f === "icon.svg" ? "" : ": run the build once with --images"}`);
    copyFileSync(join(STATIC, f), join(DIST, f));
  }
  mkdirSync(join(DIST, "press"), { recursive: true });
  for (const f of readdirSync(join(STATIC, "press"))) copyFileSync(join(STATIC, "press", f), join(DIST, "press", f));

  // robots.txt, sitemap.xml and the headers Cloudflare applies.
  writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${FACTS.origin}/sitemap.xml\n`);
  writeFileSync(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(([p]) => `  <url><loc>${FACTS.origin}${p}</loc><lastmod>${day}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
  const csp = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  writeFileSync(
    join(DIST, "_headers"),
    [
      "/*",
      `  Content-Security-Policy: ${csp}`,
      // HTTPS only, for a year, subdomains included: the same policy the herbalholland.com zone sends at Cloudflare's
      // edge, so browsers never see two different ones. (Not on the preload list.)
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
      "  X-Frame-Options: DENY",
      "  Cache-Control: no-cache",
      "",
      "/assets/*",
      "  ! Cache-Control",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
    ].join("\n"),
  );

  // Report, and hold the budgets.
  const size = (p: string) => statSync(join(DIST, p.replace(/^\//, ""))).size;
  const gz = (p: string) => gzipSync(readFileSync(join(DIST, p.replace(/^\//, "")))).length;
  const line = (label: string, p: string) => console.log(`  ${label.padEnd(26)} ${kb(size(p)).padStart(9)}  ${kb(gz(p)).padStart(9)} gzip   ${p}`);
  console.log(`\nherbalholland.com built for ${day} → ${relative(REPO, DIST)}\n`);
  line("JS (module)", site.assets.js);
  line("JS (head, gate)", site.assets.boot);
  line("CSS", site.assets.css);
  line("Font: Outfit (latin)", site.assets.outfit);
  line("Font: Inter (latin)", site.assets.inter);
  for (const [, file] of PAGES) line(`HTML ${file}`, file);
  line("HTML 404.html", "404.html");
  const jsBytes = size(site.assets.js) + size(site.assets.boot);
  const cssBytes = size(site.assets.css);
  const n = (b: number) => b.toLocaleString("en-US");
  console.log(`\n  ${walk(DIST).length} files · budgets: JS ${n(jsBytes)} of ${n(BUDGET.js)} bytes, CSS ${n(cssBytes)} of ${n(BUDGET.css)} bytes`);
  const over = [jsBytes > BUDGET.js && `JS ${n(jsBytes)} > ${n(BUDGET.js)} bytes`, cssBytes > BUDGET.css && `CSS ${n(cssBytes)} > ${n(BUDGET.css)} bytes`].filter(Boolean);
  if (over.length) throw new Error(`Over budget: ${over.join(", ")}`);
}

await main();
