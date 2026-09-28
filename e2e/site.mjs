// End-to-end test of herbalholland.com, the corporate site (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 [SITE_URL=http://herbalholland.test:3000] node e2e/site.mjs [outdir]
// With SITE_URL (as in CI, where the server has it too) Chromium maps the site's host to the server, so the real host
// routing is exercised: the pages at /, a shop link → the shop, www → the bare domain, /site on the shop → the site,
// robots.txt and sitemap.xml per host. Without it the site is visited at BASE_URL/site.
// Journey: 18+ gate → every page (status, heading, canonical, no errors, timings) → phone layout → franchise enquiry
// (errors first, then sent; acknowledgement and HQ emails) → HQ works the lead → the lead is deleted again.
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";
import http from "node:http";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SITE = process.env.SITE_URL?.replace(/\/$/, "") || null;
const siteHost = SITE && new URL(SITE).hostname;
const at = (p) => `${SITE ?? `${BASE}/site`}${p === "/" ? "" : p}`;
const out = process.argv[2] ?? "test-results/e2e-site";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const args = siteHost ? [`--host-resolver-rules=MAP ${siteHost} 127.0.0.1, MAP www.${siteHost} 127.0.0.1`] : [];
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
const watch = (page, who) => {
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000); // a dev server compiles a route on its first visit
  page.on("pageerror", (e) => problems.push(`${who} on ${page.url()}: pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|\/_next\/(webpack-)?hmr/.test(m.text()) && problems.push(`${who} on ${page.url()}: console error: ${m.text().slice(0, 300)}`));
  page.on("response", (r) => r.status() >= 500 && problems.push(`${who}: HTTP ${r.status()} ${r.request().method()} ${r.url()}`));
  return page;
};
let n = 0;
// caret: "initial" — hiding the caret writes a style onto inputs, which React reports as a hydration mismatch in dev.
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true, caret: "initial" }).catch(() => undefined);
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => console.log(`\n▸ ${s}`);
const timings = [];
async function timed(label, fn) {
  const t0 = performance.now();
  const r = await fn();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  return r;
}
const cleanup = [];

const PAGES = ["/", "/about", "/franchise", "/press", "/careers", "/contact"];
const visitor = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = watch(await visitor.newPage(), "visitor");
let passed = false;

try {
  step(`First visit: the 18+ gate (${SITE ? `on ${siteHost}` : "site at /site"})`);
  await page.goto(at("/"));
  await page.getByRole("dialog").getByRole("button", { name: "I'm 18 or older" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  ok("confirmed 18+ — the gate is gone");
  // Production sets the answer as a Secure cookie, which a browser drops on a plain-http test domain; remember it here.
  if (SITE && !/^https:|\/\/(localhost|127\.0\.0\.1)[:/]/.test(SITE)) await visitor.addCookies([{ name: "hh_age", value: "1", url: SITE }]);

  step("Every page: 200, one h1, canonical on the site's address, no errors");
  for (const p of PAGES) {
    const res = await timed(`load ${p}`, () => page.goto(at(p)));
    const h1 = page.locator("h1");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    assert(res.status() === 200 && (await h1.count()) === 1 && canonical === at(p), `${p}: “${(await h1.innerText()).replace(/\s+/g, " ").trim()}” · canonical ${canonical}`);
    await shot(page, `desktop${p === "/" ? "-home" : p.replace("/", "-")}`);
  }

  step("Doors to the shop: Shop online, Join Rewards (tagged src=site)");
  await page.goto(at("/"));
  const shopHref = await page.getByRole("banner").getByRole("link", { name: "Shop online" }).getAttribute("href");
  const joinHref = await page.getByRole("banner").getByRole("link", { name: "Join Rewards" }).getAttribute("href");
  assert(shopHref.startsWith(BASE) && joinHref === `${BASE}/club/join?src=site`, `header: ${shopHref} · ${joinHref}`);

  if (SITE) {
    step("Host routing: shop links, www, /site on the shop, robots.txt and sitemap.xml");
    // Read raw: Next makes a redirect relative when its target is the server's own address — true here (APP_URL is
    // this server), never in production — so a browser would loop on the site's host.
    const app = (process.env.APP_URL ?? BASE).replace(/\/$/, "");
    const shopLink = await new Promise((res, rej) =>
      http.get({ host: "127.0.0.1", port: new URL(BASE).port || 80, path: "/stores?x=1", headers: { host: new URL(SITE).host } }, (r) => (r.resume(), res({ status: r.statusCode, location: r.headers.location }))).on("error", rej),
    );
    const ownAddress = new URL(app).origin === new URL(BASE).origin;
    assert(shopLink.status === 308 && shopLink.location === (ownAddress ? "/stores?x=1" : `${app}/stores?x=1`), `${SITE}/stores?x=1 → the shop (${shopLink.status} ${shopLink.location})`);
    await page.goto(`http://www.${siteHost}${new URL(SITE).port ? `:${new URL(SITE).port}` : ""}/press`);
    assert(page.url() === `${SITE}/press`, `www → ${page.url()}`);
    await page.goto(`${BASE}/site/careers`);
    assert(page.url() === `${SITE}/careers`, `${BASE}/site/careers → ${page.url()}`);
    // Fetched from a page on each host (Playwright's own HTTP client doesn't use Chromium's host mapping).
    const read = async (origin) => {
      await page.goto(`${origin}/robots.txt`);
      return page.evaluate(() => Promise.all(["/robots.txt", "/sitemap.xml"].map((u) => fetch(u).then((r) => r.text()))));
    };
    const [robots, sitemap] = await read(SITE);
    const [, shopMap] = await read(BASE);
    assert(robots.includes(`Sitemap: ${SITE}/sitemap.xml`) && !robots.includes("Disallow: /hq"), "robots.txt on the site: everything allowed, the site's sitemap");
    assert(PAGES.every((p) => sitemap.includes(`<loc>${at(p)}</loc>`)) && !sitemap.includes("/p/"), `sitemap.xml on the site: its ${PAGES.length} pages only`);
    assert(!shopMap.includes(SITE) && shopMap.includes(`${BASE}/shop`), "the shop's sitemap has no site pages");
  }

  step("Phone: menu, no sideways scroll");
  const phone = watch(await visitor.newPage(), "phone");
  await phone.setViewportSize({ width: 390, height: 844 });
  for (const p of PAGES) {
    await phone.goto(at(p));
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(wide <= 0, `${p} fits 390px`);
    await shot(phone, `phone${p === "/" ? "-home" : p.replace("/", "-")}`);
  }
  await phone.getByRole("button", { name: "Open menu" }).click();
  await phone.getByRole("dialog").getByRole("link", { name: "Franchise" }).click();
  await phone.waitForURL(at("/franchise"));
  ok("menu → Franchise");
  await phone.close();

  step("Franchise enquiry: errors first (what was typed is kept), then sent — acknowledgement and HQ emails, audited");
  const email = `e2e.franchise.${Date.now().toString(36)}@example.com`;
  cleanup.push(async () => {
    const left = await q(`select id from "FranchiseLead" where email = $1`, [email]);
    await q(`delete from "MessageLog" where id = any($1)`, [left.flatMap((l) => [`lead-ack-${l.id}`, `lead-team-${l.id}`])]);
    await q(`delete from "FranchiseLead" where email = $1`, [email]);
  });
  await page.goto(at("/franchise?src=e2e-test"));
  const form = page.getByRole("form", { name: "Franchise enquiry" });
  await form.getByLabel("Your name").fill("Nomvula Dlamini");
  await timed("enquiry · errors", async () => {
    await form.getByRole("button", { name: "Send my enquiry" }).click();
    await form.getByText("Please check the highlighted fields.").waitFor();
  });
  assert((await form.getByLabel("Your name").inputValue()) === "Nomvula Dlamini", "errors shown; the name typed is kept");
  await form.getByLabel("Email address").fill(email);
  await form.getByLabel("Mobile number").fill("082 555 0199");
  await form.getByLabel("Where would you like to open?").fill("Umhlanga");
  await form.getByLabel("Province").selectOption("KZN");
  await form.getByLabel("Capital you could put in").selectOption({ index: 2 });
  await form.getByLabel("Your retail or business experience").fill("I ran two pharmacies in Durban North for eight years, with fourteen staff.");
  await form.getByRole("radio", { name: "Yes" }).check();
  await form.getByRole("checkbox", { name: /may use these details to reply/ }).check();
  await timed("enquiry · sent", async () => {
    await form.getByRole("button", { name: "Send my enquiry" }).click();
    await page.getByRole("heading", { name: "Thank you: your enquiry is in" }).waitFor();
  });
  const lead = await one(`select id, number, status, source, province, pharmacist, phone from "FranchiseLead" where email = $1`, [email]);
  assert(lead?.status === "NEW" && lead.source === "e2e-test" && lead.province === "KZN" && lead.pharmacist && lead.phone === "+27825550199" && (await page.getByText(lead.number).count()) > 0, `${lead?.number} received (source e2e-test, phone +27825550199) and shown on the thank-you`);
  const mails = await q(`select id, "to" from "MessageLog" where id = any($1)`, [[`lead-ack-${lead.id}`, `lead-team-${lead.id}`]]);
  assert(mails.length === 2 && mails.some((m) => m.to === email), `acknowledgement to the enquirer and the team's email (to ${mails.find((m) => m.to !== email)?.to})`);
  assert((await one(`select count(*)::int n from "AuditLog" where action = 'lead.create' and "entityId" = $1`, [lead.id])).n === 1, "audited (lead.create)");
  await shot(page, "enquiry-sent");

  step("HQ works the lead: contacted → disclosure sent (earliest signing +14 days, signing locked) → CSV → deleted");
  const hq = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const hp = watch(await hq.newPage(), "hq");
  await hp.goto(`${BASE}/api/auth/demo?email=hq@herbalholland.co.za&next=/hq/franchise`);
  await hp.getByRole("link", { name: lead.number }).waitFor();
  assert(await hp.getByRole("link", { name: "Franchise leads" }).count(), `${lead.number} in HQ → Franchise leads`);
  await hp.getByRole("link", { name: lead.number }).click();
  const move = async (label, to, extra) => {
    await hp.getByRole("button", { name: label, exact: true }).click();
    const g = hp.getByRole("group", { name: `Move ${lead.number} to “${to}”` });
    await extra?.(g);
    await timed(`lead → ${to}`, async () => {
      await g.getByRole("button", { name: `Move to ${to}` }).click();
      await hp.getByRole("status").filter({ hasText: `Moved to “${to}”` }).waitFor();
    });
  };
  await move("Contacted", "Contacted", (g) => g.getByLabel("Note (optional, added to the notes)").fill("Called — keen on Umhlanga, has a site in mind."));
  await move("Disclosure sent", "Disclosure sent");
  const sign = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric" });
  const lead2 = await one(`select status, notes, "disclosureSentAt" from "FranchiseLead" where id = $1`, [lead.id]);
  assert(lead2.status === "DISCLOSURE_SENT" && lead2.disclosureSentAt && /keen on Umhlanga/.test(lead2.notes), "disclosure date recorded; the note is in the notes");
  assert((await hp.getByRole("note").filter({ hasText: "isn't available yet" }).count()) === 1 && (await hp.getByText("Earliest signing:").count()) === 1, `signing locked until the earliest signing day (≈ ${sign})`);
  await hp.goto(`${BASE}/hq/franchise?status=all`);
  const [csv] = await Promise.all([hp.waitForEvent("download"), hp.getByRole("link", { name: "Export CSV" }).click()]);
  const text = await (await csv.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  assert(text.includes(lead.number) && (await one(`select count(*)::int n from "AuditLog" where action = 'lead.export' and at >= now() - interval '5 minutes'`)).n >= 1, `${csv.suggestedFilename()} lists ${lead.number} (export audited)`);
  await hp.goto(`${BASE}/hq/franchise/${lead.id}`);
  await hp.getByRole("button", { name: "Delete enquiry" }).click();
  const del = hp.getByRole("group", { name: `Delete ${lead.number} for good?` });
  await del.getByLabel(/to confirm/).fill("DELETE");
  await timed("lead · delete", async () => {
    await del.getByRole("button", { name: "Delete for good" }).click();
    await hp.getByRole("status").filter({ hasText: `${lead.number} is deleted` }).waitFor();
  });
  const erased = await q(`select "to" from "MessageLog" where id = any($1)`, [[`lead-ack-${lead.id}`, `lead-team-${lead.id}`]]);
  assert(!(await one(`select 1 from "FranchiseLead" where id = $1`, [lead.id])) && erased.every((m) => m.to === "[erased]"), "deleted (POPIA request): the lead is gone and its emails are erased");

  step("An area manager can't see franchise leads");
  const area = await browser.newContext();
  const ap = watch(await area.newPage(), "area manager");
  await ap.goto(`${BASE}/api/auth/demo?email=area.gpn@herbalholland.co.za&next=/hq`);
  await ap.getByRole("heading", { level: 1 }).first().waitFor();
  const navLink = await ap.getByRole("link", { name: "Franchise leads" }).count();
  await ap.goto(`${BASE}/hq/franchise`);
  assert(navLink === 0 && /\/login\?denied=1/.test(ap.url()), "no nav link, and the page sends them to sign-in (denied)");
  await area.close();
  await hq.close();

  passed = true;
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n").slice(0, 24).join("\n    "));
  await shot(page, "FAILED");
  process.exitCode = 1;
} finally {
  for (const c of cleanup.reverse()) await c().catch((e) => console.log(`  (cleanup failed: ${e.message.split("\n")[0]})`));
  if (timings.length) {
    console.log("\nTimings");
    for (const t of timings) console.log(`  ${t.label.padEnd(40)} ${String(t.ms).padStart(6)} ms`);
  }
  if (problems.length) {
    console.log("\nPage errors:\n" + problems.join("\n"));
    process.exitCode = 1;
  } else if (passed) console.log("\nALL STEPS PASSED");
  await browser.close();
  await db.end();
}
