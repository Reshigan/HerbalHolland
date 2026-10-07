// Builds herbalholland.com as static files for Cloudflare (a Worker serving static assets):
//   npx tsx sites/herbalholland.com/build.ts             → sites/herbalholland.com/dist
//   npx tsx sites/herbalholland.com/build.ts --images    also re-renders og.png, apple-touch-icon.png and favicon.ico
//                                                        into ./static with Chromium (Playwright), then builds
//   BUILD_DATE=2026-10-01 npx tsx sites/…/build.ts       builds as of a day (a press release shows from its date)
// Every page is rendered once with react-dom/server; the browser gets plain HTML, one CSS file, one small ES module and
// a tiny head script (the gate's first-paint decision; the CSP allows no inline script). CSS, JS and fonts carry a
// content hash in their names (cached for a year, immutable); HTML is served no-cache (see _headers).
// No database: the facts are in ./facts.ts, the words in ./content.ts. The pages: the home page, the six inner pages,
// the three legal documents, a page per store (/stores/{key}) and a page per published release (/press/{slug}).
// The CSS: the first screen's rules (styles/site.css above its @@rest marker) are inlined in every page, allowed by their
// sha256 hash in the CSP; the rest is a stylesheet per page, pruned to the rules that page can use, loaded without
// blocking the first paint. The head script is inlined the same way (hashed). No nonces, no 'unsafe-inline'.
// The build checks: distances against coordinates, opening days, that no live press release says the online shop is
// open before FACTS.shop.url is set, every page's title (≤ 60 characters) and description (120–160), that no page's
// `updated` day is in the future, no inline style attribute or unhashed script, no demo company details, and the size
// budgets.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dayKey } from "@/lib/format";
import { ABOUT, CAREERS, CONTACT, FRANCHISE, HOME, PAIA, PRESS, PRIVACY, STORES, TERMS, releasesOn, shopOpenClaim } from "./content";
import { FACTS, greatCircleKm, newStores } from "./facts";
import { patternUrl } from "./src/art";
import { SPECULATION, site } from "./src/layout";
import { AppIcon, OG_CSS, OgCard } from "./src/og";
import { classesIn, literals, mangleClasses, precomputeColors, pruneCss, shortenTokens, tighten } from "./src/optimize";
import { AboutPage } from "./src/pages/about";
import { CareersPage } from "./src/pages/careers";
import { ContactPage } from "./src/pages/contact";
import { FranchisePage } from "./src/pages/franchise";
import { HomePage } from "./src/pages/home";
import { NotFoundPage } from "./src/pages/notfound";
import { PressPage, ReleasePage } from "./src/pages/press";
import { StorePage, StoresPage } from "./src/pages/stores";
import { PaiaPage, PrivacyPage, TermsPage } from "./src/pages/legal";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, "..", "..");
const DIST = join(ROOT, "dist");
const STATIC = join(ROOT, "static");
const BUDGET = { js: 90_000, css: 60_000 }; // bytes, before compression: the scripts; a page's inline CSS plus its own stylesheet
const FONTS = {
  outfit: join(REPO, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"),
  inter: join(REPO, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
};

type PageDef = { path: string; file: string; render: () => ReactElement; updated: string };

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex").slice(0, 10);
/** A CSP source for an inline block: 'sha256-<base64>' of its exact text. */
const cspHash = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
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

/** Image files in a folder under ./static (WebP, JPEG, PNG), fingerprinted into dist/assets, by their base name. */
function images(folder: string) {
  const dir = join(STATIC, folder);
  if (!existsSync(dir)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).sort()) {
    const ext = f.split(".").pop()!.toLowerCase().replace("jpeg", "jpg");
    out[f.replace(/\.[^.]+$/, "")] = emit(f.replace(/\.[^.]+$/, ""), ext, readFileSync(join(dir, f)));
  }
  return out;
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
  // The two new stores (the next opening day's) are the ones the published distance between stores is about.
  const [s1, s2] = newStores();
  if (s1 && s2 && Math.round(greatCircleKm(s1, s2)) !== FACTS.kmBetweenStores)
    off.push(`${s1.name} → ${s2.name} is ${greatCircleKm(s1, s2).toFixed(1)} km by great circle, but facts.ts says ${FACTS.kmBetweenStores}`);
  // The km story ends at the first of the new stores, so its distance from Amsterdam must be published.
  if (s1 && !(s1.key in FACTS.km)) off.push(`facts.ts needs the Amsterdam distance for ${s1.name}, where the km story ends (km.${s1.key})`);
  // An opening day, where there is one, is a date; a store still to open must have one. An open store may have none.
  for (const s of FACTS.stores) {
    if (s.opens !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(s.opens)) off.push(`facts.ts: ${s.name} opens "${s.opens}", not a YYYY-MM-DD date`);
    if (s.status === "opening" && !s.opens) off.push(`facts.ts: ${s.name} is "opening" but has no opening day`);
    if (!/^[a-z0-9-]+$/.test(s.key)) off.push(`facts.ts: ${s.name}'s key "${s.key}" isn't a URL slug (a-z, 0-9, -)`);
  }
  for (const r of PRESS.releases.items) if (!/^[a-z0-9-]+$/.test(r.slug)) off.push(`content.ts: the release "${r.title}" has a slug that isn't a-z, 0-9, -`);
  // A release that goes out while the online shop isn't live (FACTS.shop.url is null) can't say it's open.
  if (!FACTS.shop.url)
    for (const r of releasesOn(day)) {
      const said = [r.title, r.pageTitle, r.description, r.summary, ...r.body].map(shopOpenClaim).find(Boolean);
      if (said)
        off.push(`content.ts: the release "${r.slug}" is live from ${r.date} and says the online shop is open ("${said}"), but facts.ts has no shop.url yet. Hold the release back (date: null) until the shop opens, or set FACTS.shop.url.`);
    }
  if (off.length) throw new Error(off.join("\n"));
  // A store still marked "opening" after its day: the pages would go on saying when it opens.
  for (const s of FACTS.stores)
    if (s.status === "opening" && s.opens && s.opens < day) console.warn(`  ⚠ facts.ts: ${s.name} was due to open on ${s.opens} but is still marked "opening": set its status to "open".`);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, "assets"), { recursive: true });
  mkdirSync(join(DIST, "stores"), { recursive: true });
  mkdirSync(join(DIST, "press"), { recursive: true });

  // Fonts, then the CSS that points at them, then the scripts.
  const fonts = {
    outfit: emit("outfit", "woff2", readFileSync(FONTS.outfit)),
    inter: emit("inter", "woff2", readFileSync(FONTS.inter)),
  };
  const cssSource = readFileSync(join(ROOT, "styles/site.css"), "utf8").replace("__OUTFIT__", fonts.outfit).replace("__INTER__", fonts.inter).replace("__PATTERN__", patternUrl());
  // The first screen's CSS and the rest, split at the marker (tokens are shortened across both, so they agree).
  const whole = shortenTokens(precomputeColors(cssSource));
  const mark = whole.indexOf("/* @@rest");
  if (mark < 0) throw new Error("styles/site.css: the @@rest marker is missing");
  const critical = await styles(whole.slice(0, mark));
  const rest = await styles(whole.slice(whole.indexOf("*/", mark) + 2));
  const mainSrc = readFileSync(join(ROOT, "client/main.ts"), "utf8");
  const bootSrc = readFileSync(join(ROOT, "client/boot.ts"), "utf8");
  const js = await script("client/main.ts", "esm");
  const boot = (await script("client/boot.ts", "iife")).trim();
  const CSS_HREF = "/assets/__site_css__";
  // The store concept renders (WebP, cropped to the owner's storefront renders) and any store photographs
  // (static/stores/{key}.webp), fingerprinted like the rest.
  const concept = Object.values(images("concept"));
  const stores = images("stores");
  for (const s of FACTS.stores) if (s.photo && !stores[s.key]) throw new Error(`facts.ts: ${s.name} has a photo, but static/stores/${s.key}.webp (or .jpg) is missing`);
  const iconSvg = readFileSync(join(STATIC, "icon.svg"), "utf8").replace(/\s+/g, " ").trim();
  const icon = `data:image/svg+xml,${iconSvg.replace(/[<>#"%{}]/g, encodeURIComponent)}`;
  site.assets = { css: CSS_HREF, js: emit("site", "js", js), ...fonts, icon, concept, stores };
  site.day = day;
  site.year = Number(day.slice(0, 4));

  // The images are drawn with the stylesheet's own token names (OG_CSS uses them), so before tokens are shortened.
  if (process.argv.includes("--images")) await renderImages(await styles(precomputeColors(cssSource)));

  // Pages. A release's page exists from its date; a store's page always.
  const pages: PageDef[] = [
    { path: "/", file: "index.html", render: () => createElement(HomePage), updated: HOME.meta.updated },
    { path: "/about", file: "about.html", render: () => createElement(AboutPage), updated: ABOUT.meta.updated },
    { path: "/stores", file: "stores.html", render: () => createElement(StoresPage), updated: STORES.meta.updated },
    ...FACTS.stores.map((s) => ({ path: `/stores/${s.key}`, file: `stores/${s.key}.html`, render: () => createElement(StorePage, { store: s }), updated: STORES.meta.updated })),
    { path: "/franchise", file: "franchise.html", render: () => createElement(FranchisePage), updated: FRANCHISE.meta.updated },
    { path: "/press", file: "press.html", render: () => createElement(PressPage), updated: PRESS.meta.updated },
    ...releasesOn(day).map((r) => ({ path: `/press/${r.slug}`, file: `press/${r.slug}.html`, render: () => createElement(ReleasePage, { release: r }), updated: r.date })),
    { path: "/careers", file: "careers.html", render: () => createElement(CareersPage), updated: CAREERS.meta.updated },
    { path: "/contact", file: "contact.html", render: () => createElement(ContactPage), updated: CONTACT.meta.updated },
    { path: "/privacy", file: "privacy.html", render: () => createElement(PrivacyPage), updated: PRIVACY.meta.updated },
    { path: "/terms", file: "terms.html", render: () => createElement(TermsPage), updated: TERMS.meta.updated },
    { path: "/paia", file: "paia.html", render: () => createElement(PaiaPage), updated: PAIA.meta.updated },
  ];
  const problems: string[] = [];
  for (const p of pages) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.updated)) problems.push(`${p.path}: updated "${p.updated}" isn't a YYYY-MM-DD date`);
    else if (p.updated > day) problems.push(`${p.path}: its copy is dated ${p.updated}, after today (${day}): set content.ts's updated to the day it changed`);
  }
  const files = [...pages.map((p) => [p.file, p.render, p.path] as const), ["404.html", () => createElement(NotFoundPage), null] as const];
  const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const html = files.map(([file, render, path]) => {
    const h = `<!doctype html>${renderToStaticMarkup(render())}`;
    // The CSP forbids inline styles and scripts; never ship the platform's demo company details.
    if (/\sstyle="/.test(h)) problems.push(`${file}: an inline style attribute (blocked by the CSP)`);
    if (/<script(?![^>]*\b(src=|data-boot|type="application\/(ld\+)?json"|type="speculationrules"))/.test(h)) problems.push(`${file}: an inline script (blocked by the CSP)`);
    if ((h.match(/<style>/g) ?? []).length !== 1) problems.push(`${file}: expected one inline <style> (the critical CSS)`);
    if (/481516|Windmill Lane/.test(h)) problems.push(`${file}: demo company details from the seed`);
    // Search: a title of 60 characters or fewer, a description of 120 to 160, both unique; every page has one h1.
    if (path) {
      const title = decode(/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "");
      const desc = decode(/<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? "");
      if (title.length > 60) problems.push(`${path}: title is ${title.length} characters (60 at most): "${title}"`);
      if (desc.length < 120 || desc.length > 160) problems.push(`${path}: description is ${desc.length} characters (120 to 160): "${desc}"`);
      if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push(`${path}: not exactly one h1`);
      if (!h.includes(`<link rel="canonical" href="${FACTS.origin}${path === "/" ? "/" : path}"/>`)) problems.push(`${path}: canonical link missing or wrong`);
    }
    return h;
  });
  const titles = new Map<string, string>();
  const descs = new Map<string, string>();
  files.forEach(([, , path], i) => {
    if (!path) return;
    const t = /<title>([^<]*)<\/title>/.exec(html[i])?.[1] ?? "";
    const d = /<meta name="description" content="([^"]*)"/.exec(html[i])?.[1] ?? "";
    if (titles.has(t)) problems.push(`${path}: the same title as ${titles.get(t)}`);
    if (descs.has(d)) problems.push(`${path}: the same description as ${descs.get(d)}`);
    titles.set(t, path);
    descs.set(d, path);
  });
  if (problems.length) throw new Error(`Build checks failed:\n  ${problems.join("\n  ")}`);
  // Short class names in the CSS and the pages alike; then each page gets its own CSS: the critical rules it can use,
  // inline, and the rest it can use as its stylesheet (pages with the same needs share a file).
  const small = mangleClasses([critical, rest], html, [mainSrc, bootSrc].flatMap(literals));
  const styleHashes = new Set<string>();
  const sizes = new Map<string, { inline: number; sheet: number; href: string }>();
  files.forEach(([file], i) => {
    const present = new Set([...classesIn(small.pages[i]), ...small.keep]);
    const crit = pruneCss(small.css[0], present);
    const own = pruneCss(small.css[1], present);
    const href = emit("site", "css", own);
    styleHashes.add(cspHash(crit));
    sizes.set(file, { inline: Buffer.byteLength(crit), sheet: Buffer.byteLength(own), href });
    writeFileSync(join(DIST, file), small.pages[i].replace("__CRITICAL__", () => crit).replace("__BOOT__", () => boot).replaceAll(CSS_HREF, href));
  });

  // Static files from ./static (the site keeps its own copies): the icon, share image, press logos.
  for (const f of ["icon.svg", "og.png", "apple-touch-icon.png", "favicon.ico"]) {
    if (!existsSync(join(STATIC, f))) throw new Error(`static/${f} is missing${f === "icon.svg" ? "" : ": run the build once with --images"}`);
    copyFileSync(join(STATIC, f), join(DIST, f));
  }
  for (const f of readdirSync(join(STATIC, "press"))) copyFileSync(join(STATIC, "press", f), join(DIST, "press", f));

  // robots.txt (the API isn't a page), sitemap.xml with each page's own lastmod, and the headers Cloudflare applies.
  writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${FACTS.origin}/sitemap.xml\n`);
  writeFileSync(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${FACTS.origin}${p.path}</loc><lastmod>${p.updated}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
  // The inline blocks are allowed by hash: every page's critical CSS (they differ a little, so all are listed), the
  // one head script and the speculation rules. Nothing else inline runs.
  const csp = `default-src 'self'; img-src 'self' data:; style-src 'self' ${[...styleHashes].join(" ")}; script-src 'self' ${cspHash(boot)} ${cspHash(SPECULATION)}; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
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
  const line = (label: string, p: string) => console.log(`  ${label.padEnd(30)} ${kb(size(p)).padStart(9)}  ${kb(gz(p)).padStart(9)} gzip   ${p}`);
  console.log(`\nherbalholland.com built for ${day} → ${relative(REPO, DIST)}\n`);
  line("JS (module)", site.assets.js);
  console.log(`  ${"JS (head, inline)".padEnd(30)} ${kb(Buffer.byteLength(boot)).padStart(9)}`);
  line("Font: Outfit (latin, preloaded)", site.assets.outfit);
  line("Font: Inter (latin)", site.assets.inter);
  for (const [file, s] of sizes) console.log(`  ${`HTML ${file}`.padEnd(30)} ${kb(size(file)).padStart(9)}  ${kb(gz(file)).padStart(9)} gzip   CSS inline ${kb(s.inline)} + ${kb(s.sheet)} ${s.href}`);
  const jsBytes = size(site.assets.js) + Buffer.byteLength(boot);
  const cssBytes = Math.max(...[...sizes.values()].map((s) => s.inline + s.sheet));
  const n = (b: number) => b.toLocaleString("en-US");
  console.log(`\n  ${walk(DIST).length} files · ${pages.length + 1} pages · budgets: JS ${n(jsBytes)} of ${n(BUDGET.js)} bytes, CSS (largest page, inline + sheet) ${n(cssBytes)} of ${n(BUDGET.css)} bytes`);
  const over = [jsBytes > BUDGET.js && `JS ${n(jsBytes)} > ${n(BUDGET.js)} bytes`, cssBytes > BUDGET.css && `CSS ${n(cssBytes)} > ${n(BUDGET.css)} bytes`].filter(Boolean);
  if (over.length) throw new Error(`Over budget: ${over.join(", ")}`);
}

await main();
