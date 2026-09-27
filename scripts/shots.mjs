// Screenshot tool for design QA (uses the dev server on :3000).
//   node scripts/shots.mjs <outdir> <width> <height> [login:<email>] [pos:<storeCode>:<pin>] <path> ...
// login:<email>  signs in as a demo staff user (DEMO_MODE) for the following paths.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , outdir, w = "1440", h = "900", ...targets] = process.argv;
if (!outdir) throw new Error("usage: node scripts/shots.mjs <outdir> <width> <height> [login:<email>] <path>...");
mkdirSync(outdir, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
}
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "hh_age", value: "1", url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errors.push(m.text()));
let i = 0;
for (const t of targets) {
  if (t.startsWith("login:")) {
    await page.goto(`${base}/api/auth/demo?email=${encodeURIComponent(t.slice(6))}&next=/`, { waitUntil: "load" });
    continue;
  }
  const url = t.startsWith("http") ? t : `${base}${t}`;
  const t0 = Date.now();
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(600);
  const file = `${outdir}/${String(++i).padStart(2, "0")}-${t.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(res?.status(), `${Date.now() - t0}ms`, file);
}
if (errors.length) console.log("PAGE ERRORS:\n" + [...new Set(errors)].slice(0, 15).join("\n"));
await browser.close();
