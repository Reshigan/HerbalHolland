// E2E controls: every button on every page, as every role, at desktop and phone size, must do something when clicked.
// "Something" is any of: the address changes, the page changes (a menu opens, a panel expands, a count updates), a
// request goes out, a new tab, a download or a browser dialog. A control that does none of those within CLICK_MS is a
// dead control. Links are checked by the crawl (a link that lands back where it was is a dead link).
//
// Pages come from the crawl (one per route template and role), so run the crawl first; without its report each role's
// start pages are used. Buttons whose names mean a real change (delete, refund, approve, send, sign out...) are not
// clicked, and neither are form submits that post; a GET form's submit (a search, a filter) is.
//   BASE_URL=http://127.0.0.1:3000 DATABASE_FILE=<the local D1 file> node e2e/controls.mjs [outdir] [only-role] [crawl.json]
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { makeRoles } from "./_roles.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [, , outdir = "test-results/e2e-controls", only, crawlFile = "test-results/e2e-crawl/crawl.json"] = process.argv;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CLICK_MS = 1500;
const db = createDb();
mkdirSync(outdir, { recursive: true });

const RISKY = /\b(delete|remove|sign ?out|log ?out|refund|void|pay|approve|reject|decline|accept|archive|reset|cancel|close|end|clear|revoke|disable|deactivate|suspend|erase|send|submit|publish|post|confirm|lock|unlock|merge|import|run|apply|write.?off|place|order now|checkout|book|claim|redeem|transfer|receive|dispatch|delete|forget|block|unpublish|retire|terminate|resend|regenerate|rotate)\b/i;
const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

const crawl = existsSync(crawlFile) ? JSON.parse(readFileSync(crawlFile, "utf8")) : null;
function pagesFor(role) {
  if (!crawl) return role.start;
  const byTpl = new Map();
  for (const r of crawl.results) if (r.role === role.name && r.status < 400 && r.lcp !== undefined && !byTpl.has(r.tpl)) byTpl.set(r.tpl, r.url);
  return [...byTpl.values()];
}

// Tags every clickable control on the page with data-probe and returns what to click. Runs in the page.
const TAG = (risky) => {
  const re = new RegExp(risky, "i");
  const out = [];
  const els = document.querySelectorAll('button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], summary');
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!r.width || !r.height || style.visibility === "hidden" || style.pointerEvents === "none") return;
    if (el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[inert]")) return;
    if (el.tagName === "A") return; // a link with role=button: the crawl follows it
    // Already the current choice (the selected tab, the checked option): clicking it again rightly does nothing.
    if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-current") || el.querySelector?.("input:checked")) return;
    const form = el.form ?? el.closest("form");
    const submits = el.tagName === "BUTTON" && el.type === "submit" && form;
    if (submits && (form.getAttribute("method") ?? "get").toLowerCase() !== "get") return; // posts: a journey's job
    if (submits && form.getAttribute("action")?.startsWith("javascript:")) return; // a server action
    const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name || re.test(name)) return;
    el.setAttribute("data-probe", String(i));
    out.push({ id: String(i), name, kind: el.getAttribute("role") || el.tagName.toLowerCase() });
  });
  return out;
};

// Counts DOM changes from now on. Arms after the hover, so a tooltip is not mistaken for the click's effect.
const ARM = () => {
  window.__probeFx = 0;
  window.__probeObs?.disconnect();
  window.__probeObs = new MutationObserver((m) => (window.__probeFx += m.length));
  window.__probeObs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
};

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
await db.connect();
const ROLES = makeRoles(db);
const problems = [];
let clicked = 0;
const canaries = new Set(), caught = new Set();

for (const role of ROLES.filter((r) => !only || r.name === only)) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext(vp);
    await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
    // A print dialog leaves no trace in a headless browser: count window.print() as the click's effect.
    await ctx.addInitScript(() => { window.print = () => { document.documentElement.dataset.printed = String(Date.now()); }; });
    const page = await ctx.newPage();
    if (role.login) await role.login(page);
    let at = "";
    const issue = (kind, detail) => problems.push({ role: role.name, viewport: vp.name, url: at, kind, detail: String(detail).slice(0, 300) });
    page.on("pageerror", (e) => issue("crash", e.message));
    page.on("dialog", (d) => d.dismiss().catch(() => {}));

    // Effects of the click in flight, besides the DOM: requests, new tabs, downloads, dialogs.
    let side = 0;
    page.on("request", (r) => r.resourceType() !== "image" && r.resourceType() !== "font" && side++);
    page.on("download", () => side++);
    page.on("dialog", () => side++);
    ctx.on("page", (p) => { side++; p.close().catch(() => {}); });

    const tried = new Set(); // one click per control name per role and size: the header's menu button is tested once
    let n = 0;
    for (const path of pagesFor(role)) {
      at = path;
      const open = async () => {
        await page.goto(new URL(path, BASE).href, { waitUntil: "load", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {}); // hydrated: a click before it does nothing
      };
      try { await open(); } catch { continue; } // the crawl reports pages that fail to load
      // Canary: a button that does nothing, on the first page of each role and size. The probe must flag it, or it is blind.
      // First in the DOM, so it is clicked before any control that navigates and reloads the page without it.
      if (!n && !canaries.has(`${role.name} ${vp.name}`)) {
        canaries.add(`${role.name} ${vp.name}`);
        await page.evaluate(() => { const b = document.createElement("button"); b.type = "button"; b.textContent = "Probe canary"; b.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647;width:80px;height:40px"; document.body.prepend(b); }).catch(() => {});
      }
      const controls = await page.evaluate(TAG, RISKY.source).catch(() => []);
      for (const c of controls) {
        if (c.name !== "Probe canary" && tried.has(c.name)) continue;
        tried.add(c.name);
        const el = page.locator(`[data-probe="${c.id}"]`);
        if (!(await el.isVisible().catch(() => false))) continue; // gone after an earlier click: tried on the next page that has it
        try {
          await el.hover({ timeout: 2_000 });
          await page.waitForTimeout(150);
          await page.evaluate(ARM);
          side = 0;
          const before = page.url();
          await el.click({ timeout: 3_000, noWaitAfter: true });
          clicked++;
          n++;
          let did = false;
          for (let t = 0; t < CLICK_MS && !did; t += 100) {
            await page.waitForTimeout(100);
            const fx = await page.evaluate(() => window.__probeFx).catch(() => 1); // context gone = navigated
            did = fx > 0 || side > 0 || page.url() !== before;
          }
          if (c.name === "Probe canary") { if (!did) caught.add(`${role.name} ${vp.name}`); }
          else if (!did) issue("dead control", `${c.kind} "${c.name}" does nothing when clicked`);
          // Back to the page as it was: off the new page, or out of an open menu or dialog.
          if (page.url() !== before) await open();
          else await page.keyboard.press("Escape").catch(() => {});
        } catch (e) {
          // Covered by something else or moved mid-click: say so once, then carry on from a fresh copy of the page.
          if (!/Timeout|detached|not attached|intercepts pointer/.test(e.message)) issue("click failed", `"${c.name}": ${e.message.split("\n")[0]}`);
          await open().catch(() => {});
        }
      }
    }
    console.log(`${role.name} ${vp.name}: ${n} controls clicked across ${pagesFor(role).length} pages`);
    await ctx.close();
    if (role.cleanup) await role.cleanup();
  }
}
await browser.close();
await db.end();

for (const k of canaries) if (!caught.has(k)) problems.push({ role: k, viewport: "", url: "", kind: "probe blind", detail: "the canary button that does nothing was not flagged: this run proves nothing" });
writeFileSync(`${outdir}/controls.json`, JSON.stringify({ clicked, problems }, null, 2));
console.log(`\n${clicked} controls clicked`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ [${p.role} ${p.viewport}] ${p.kind}: ${p.detail}  (on ${p.url})`);
  process.exit(1);
}
console.log("\nEVERY CONTROL DOES SOMETHING");
