// E2E crawl: signs in as each role (shopper, member, store manager, franchise owner, area manager, HQ, trade buyer) and visits every
// page it can reach by following links. Fails on broken links, server errors, crashes and console errors; reports how
// long each page took on the server (HTML fully streamed) and to paint.
//   BASE_URL=http://127.0.0.1:3000 DATABASE_URL=... node e2e/crawl.mjs [outdir] [only-role]
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";

const [, , outdir = "test-results/e2e-crawl", only] = process.argv;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
mkdirSync(outdir, { recursive: true });

// Route templates straight from the app directory, so each URL is counted against the page that renders it.
function templates(dir = "src/app", segs = []) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...templates(`${dir}/${e.name}`, /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name]));
    else if (/^(page|route)\.tsx?$/.test(e.name)) {
      const tpl = `/${segs.join("/")}`;
      const re = new RegExp(`^${segs.map((s) => (/^\[.*\]$/.test(s) ? "/[^/]+" : `/${s.replace(/\./g, "\\.")}`)).join("") || "/"}$`);
      out.push({ tpl, re, statics: segs.filter((s) => !/^\[/.test(s)).length, api: e.name.startsWith("route") });
    }
  }
  return out;
}
const TEMPLATES = templates();
const templateOf = (path) => TEMPLATES.filter((t) => t.re.test(path)).sort((a, b) => b.statics - a.statics)[0];

const NEVER = /^\/(logout|pos|api\/(auth|pos|cron|push)|unsubscribe|api\/unsubscribe)(\/|$)/;
const PER_TEMPLATE = 5; // distinct URLs per route template (query variants included)
const SLOW_MS = 1500;

const staff = (email) => async (page) => {
  await page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}`);
};
async function member(page) {
  // A member with online orders and till sales, so their Rewards pages have history.
  const m = (await db.query(`select c.phone from "Customer" c where exists (select 1 from "Order" o where o."customerId" = c.id and o."paymentStatus" = 'PAID')
    and exists (select 1 from "Sale" s where s."customerId" = c.id) order by c."memberNo" limit 1`)).rows[0];
  await page.goto(`${BASE}/club/join?next=/club`);
  await page.getByLabel("Mobile number").fill(`0${m.phone.slice(3)}`);
  await page.getByRole("button", { name: /Send my code/ }).click();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/club", { timeout: 30_000 });
}

/** The trade portal: a throwaway approved account (on account, every trade range, licences verified) signs in with the demo code. */
let tradeAccountId = null;
async function trade(page) {
  const email = `crawl.${Date.now().toString(36)}@example.co.za`;
  const row = (await db.query(
    `insert into "TradeAccount" (id, number, name, "legalName", kind, "regNumber", email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, "paymentDays", "creditLimitCents", classes, "adultAttestedAt", "termsVersion", "termsAcceptedAt", "approvedAt", "updatedAt")
     values (gen_random_uuid()::text, $1, 'Crawl Trade Co', 'Crawl Trade Co (Pty) Ltd', 'RETAILER', '2020/000001/07', $2, '+27123456789', '1 Crawl Street', 'Hatfield', 'Pretoria', 'GP', '0083', 'APPROVED', 'ACCOUNT', 30, 2000000,
       array['CBD','CBD_FOOD','CBD_TOPICAL','HEMP','SUPPLEMENT','ACCESSORY','APPAREL','GROW']::"RegClass"[], now(), 'trade-1', now(), now(), now()) returning id`,
    [`TA-9${String(Date.now() % 100000).padStart(5, "0")}`, email],
  )).rows[0];
  tradeAccountId = row.id;
  // What a retailer buying every range needs, verified; the document is a seeded one (the account page links to it).
  await db.query(
    `insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId", status, "reviewedAt")
     select gen_random_uuid()::text, $1, k::"TradeLicenceKind", 'E2E/' || k, (select "uploadId" from "TradeLicence" order by "createdAt" limit 1), 'VERIFIED', now() from unnest($2::text[]) k`,
    [row.id, ["CIPC_REGISTRATION", "FOOD_COA"]],
  );
  await db.query(`insert into "TradeBuyer" (id, "tradeAccountId", name, email, role) values (gen_random_uuid()::text, $1, 'Crawl Buyer', $2, 'OWNER')`, [row.id, email]);
  await page.goto(`${BASE}/trade/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/trade/range", { timeout: 30_000 });
}
async function tradeCleanup() {
  if (!tradeAccountId) return;
  await db.query(`delete from "AuditLog" where "entityId" = $1 or "actorId" in (select id from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
  await db.query(`delete from "MessageLog" where "to" in (select email from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
  await db.query(`delete from "Otp" where email in (select email from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
  await db.query(`delete from "TradeAccount" where id = $1`, [tradeAccountId]); // buyers and sessions go with it
  tradeAccountId = null;
}

const SHOP = /^\/(?!(hq|store|account|menu|brand)(\/|$))/;
const ROLES = [
  { name: "shopper", scope: SHOP, start: ["/", "/shop", "/stores", "/learn", "/drops", "/dispensary", "/club/join", "/cart", "/checkout", "/login", "/legal/terms", "/trade", "/trade/apply", "/trade/login", "/trade/terms"] },
  { name: "member", login: member, scope: SHOP, start: ["/club", "/club/orders", "/club/points", "/club/invoices", "/club/settings"] },
  { name: "manager", login: staff("manager.pta01@herbalholland.co.za"), scope: /^\/(store|account|menu|invoice)(\/|$)/, start: ["/store/PTA01"] },
  { name: "owner", login: staff("thabo@mokoenaretail.co.za"), scope: /^\/(store|account)(\/|$)/, start: ["/store"] },
  { name: "area", login: staff("area.gpn@herbalholland.co.za"), scope: /^\/(hq|store)(\/|$)/, start: ["/hq"] },
  { name: "hq", login: staff("hq@herbalholland.co.za"), scope: /^\/(hq|store|menu|invoice|brand)(\/|$)/, start: ["/hq"] },
  { name: "trade", login: trade, cleanup: tradeCleanup, scope: /^\/(trade|invoice)(\/|$)/, start: ["/trade/range", "/trade/cart", "/trade/checkout", "/trade/orders", "/trade/account", "/trade/statements"] },
];

const METRICS = () =>
  new Promise((done) => {
    const nav = performance.getEntriesByType("navigation")[0];
    let lcp = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    const js = performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script").reduce((s, r) => s + (r.decodedBodySize || 0), 0);
    setTimeout(() => done({ ttfb: Math.round(nav.responseStart - nav.requestStart), html: Math.round(nav.responseEnd - nav.requestStart), lcp: Math.round(lcp), js }), 50);
  });

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
await db.connect();
const ref = (await db.query(`select "referralCode" from "Customer" where "referralCode" is not null order by "memberNo" limit 1`)).rows[0].referralCode;
ROLES[0].start.push(`/s/${ref}`); // shared Rewards card (sent from the member's phone)
ROLES[2].start.push("/store/PTA01/finance/statement"); // statement emails link here
ROLES[5].start.push("/brand");
const results = [];
const problems = [];

for (const role of ROLES.filter((r) => !only || r.name === only)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
  const page = await ctx.newPage();
  let current = "";
  const issue = (kind, detail) => problems.push({ role: role.name, url: current, kind, detail: String(detail).slice(0, 300) });
  page.on("pageerror", (e) => issue("crash", e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && issue("console", m.text()));
  page.on("response", (r) => r.url().startsWith(BASE) && r.status() >= 400 && r.request().resourceType() !== "document" && issue(`http ${r.status()}`, r.url().slice(BASE.length)));
  if (role.login) await role.login(page);

  const seen = new Set();
  const perTpl = new Map();
  const queue = role.start.map((p) => new URL(p, BASE).href);
  while (queue.length) {
    const href = queue.shift();
    const u = new URL(href);
    const key = u.pathname + u.search;
    if (seen.has(key)) continue;
    seen.add(key);
    const tpl = templateOf(u.pathname);
    if (!tpl) { issue("no route", key); continue; }
    const n = perTpl.get(tpl.tpl) ?? 0;
    if (n >= PER_TEMPLATE && !role.start.includes(key)) continue;
    perTpl.set(tpl.tpl, n + 1);
    current = key;

    if (tpl.api) {
      // Exports and downloads: fetch them from the page (same cookies as a click), don't navigate. A redirect means bounced to sign-in.
      const r = await page.evaluate(async (u) => {
        const t0 = performance.now();
        const res = await fetch(u, { redirect: "manual" });
        await res.arrayBuffer();
        return { status: res.type === "opaqueredirect" ? 302 : res.status, html: Math.round(performance.now() - t0) };
      }, href);
      results.push({ role: role.name, url: key, tpl: tpl.tpl, ...r });
      if (r.status !== 200) issue(`download ${r.status}`, key);
      continue;
    }
    let res;
    try {
      res = await page.goto(href, { waitUntil: "load", timeout: 30_000 });
    } catch (e) {
      issue("timeout", e.message.split("\n")[0]);
      continue;
    }
    const status = res?.status() ?? 0;
    const final = new URL(page.url());
    const m = await page.evaluate(METRICS).catch(() => ({}));
    results.push({ role: role.name, url: key, final: final.pathname + final.search, tpl: tpl.tpl, status, ...m });
    if (status >= 400) issue(`page ${status}`, key);
    if (await page.locator("text=/Something went wrong|Application error/").count()) issue("error boundary", key);

    for (const a of await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.href))) {
      const l = new URL(a, BASE);
      if (l.origin !== new URL(BASE).origin || NEVER.test(l.pathname) || !role.scope.test(l.pathname)) continue;
      l.hash = "";
      if (!seen.has(l.pathname + l.search)) queue.push(l.href);
    }
  }
  console.log(`${role.name}: ${[...perTpl.values()].reduce((a, b) => a + b, 0)} URLs across ${perTpl.size} routes`);
  await ctx.close();
  if (role.cleanup) await role.cleanup();
}
await browser.close();
await db.end();

writeFileSync(`${outdir}/crawl.json`, JSON.stringify({ results, problems }, null, 2));
const pages = results.filter((r) => r.lcp !== undefined);
const pct = (xs, p) => xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
console.log(`\n${results.length} URLs · ${new Set(results.map((r) => r.tpl)).size} routes · server p50 ${pct(pages.map((r) => r.html), 0.5)}ms p95 ${pct(pages.map((r) => r.html), 0.95)}ms · LCP p95 ${pct(pages.map((r) => r.lcp), 0.95)}ms`);
console.log("\nSlowest:");
for (const r of [...results].sort((a, b) => b.html - a.html).slice(0, 25))
  console.log(`  ${String(r.html).padStart(6)}ms  lcp ${String(r.lcp ?? "-").padStart(5)}  ${Math.round((r.js ?? 0) / 1024)}KB js  ${r.role.padEnd(8)} ${r.url}`);
const unvisited = TEMPLATES.filter((t) => !t.api && !results.some((r) => r.tpl === t.tpl)).map((t) => t.tpl);
console.log(`\nPages no role reached (${unvisited.length}): ${unvisited.join(", ")}`);
const slow = pages.filter((r) => r.html > SLOW_MS);
if (slow.length) console.log(`\n${slow.length} page(s) over ${SLOW_MS}ms on the server`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ [${p.role}] ${p.kind}: ${p.detail}  (on ${p.url})`);
  process.exit(1);
}
console.log("\nNO PROBLEMS FOUND");
