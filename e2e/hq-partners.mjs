// End-to-end test of HQ → Partners (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/hq-partners.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// The HQ admin: a partner without a name or a data-sharing agreement is refused, and so is a join page that isn't https,
// with nothing saved; a real partner is added and audited; the same link name is refused; an edit saves and audits;
// pause and resume flip it and audit each; showing the key prints it and audits the reveal; rotating the key moves the
// version on and audits it. HQ staff (not admin) see the page view-only, with no controls.
// Re-runnable: the test partners and their audit rows are deleted at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-hq-partners";
mkdirSync(out, { recursive: true });
const db = createDb();
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }).catch(() => undefined);
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor();
  for (let i = 0; i < 600; i++) {
    if (await el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`never hydrated: ${el}`);
}
async function until(fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(150);
  }
}

const PATH = "/hq/partners";
const run = Date.now().toString(36);
const NAME = `E2E Partner ${run}`;
const SLUG = `e2e-${run}`;
const RENAMED = `${NAME} Renamed`;
const partners = () => q(`SELECT * FROM "PartnerBrand" WHERE slug LIKE $1`, [`e2e-${run}%`]);
const partner = async () => (await partners())[0];
const audits = async (action, id) => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = $1 AND "entityId" = $2`, [action, id])).n);
const creates = async () => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = 'partner.create'`)).n);

async function newPage(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}&next=${PATH}`);
  return page;
}

const page = await newPage("hq@herbalholland.com");
const addCard = () => page.locator("div", { has: page.getByRole("heading", { name: "Add a partner", exact: true }) }).filter({ has: page.getByRole("button", { name: "Add partner" }) }).last();
const card = (name) => page.locator("div", { has: page.getByRole("heading", { name, exact: true }) }).filter({ has: page.getByRole("button", { name: "Show key" }) }).last();
async function add({ name, agreement, joinUrl = "", slug = "" }) {
  await page.goto(`${BASE}${PATH}`);
  await hydrated(page.getByRole("button", { name: "Add partner" }));
  const f = addCard();
  await f.getByLabel("Name", { exact: true }).fill(name);
  await f.getByLabel("Data-sharing agreement").fill(agreement);
  await f.getByLabel("Their join page").fill(joinUrl);
  await f.getByLabel("Link name").fill(slug);
  await f.getByRole("button", { name: "Add partner" }).click();
  return f;
}
async function refused(f, text) {
  await f.getByText(text).first().waitFor();
  ok(`refused: “${text}”`);
}

try {
  step("A partner needs a name, an agreement, and an https join page");
  const before = await creates();
  await refused(await add({ name: "   ", agreement: "DSA-1", slug: SLUG }), "Enter the partner's name.");
  await refused(await add({ name: NAME, agreement: "   ", slug: SLUG }), "Record the data-sharing agreement first.");
  await refused(await add({ name: NAME, agreement: "DSA-1", joinUrl: "http://example.com/join", slug: SLUG }), "The join page must be an https link.");
  assert(!(await partners()).length && (await creates()) === before, "nothing saved, nothing audited");
  await shot(page, "refused");

  step("Add a partner");
  const f = await add({ name: NAME, agreement: "DSA-2026-11 signed 23 Nov 2026", joinUrl: "https://example.com/join", slug: SLUG });
  await f.getByText("Partner added").first().waitFor();
  const p = await until(partner);
  assert(p && p.slug === SLUG && p.name === NAME && p.joinUrl === "https://example.com/join" && Number(p.active) === 1, `saved as ${p?.slug}, active, with its join page`);
  assert(await until(async () => (await audits("partner.create", p.id)) === 1), "the add is audited");
  await page.goto(`${BASE}${PATH}`);
  await card(NAME).waitFor();
  assert(await card(NAME).getByText(`/club/join?partner=${SLUG}`).count(), "its card shows the join link");
  await shot(page, "added");

  step("The same link name is refused");
  await refused(await add({ name: `${NAME} Twin`, agreement: "DSA-3", slug: SLUG }), "Another partner already uses that link name.");
  assert((await partners()).length === 1, "still one partner");

  step("Edit the partner");
  await page.goto(`${BASE}${PATH}`);
  await hydrated(card(NAME).getByRole("button", { name: "Show key" }));
  const c = card(NAME);
  await c.getByText("Edit", { exact: true }).click();
  await c.getByLabel("Name", { exact: true }).fill(RENAMED);
  await c.getByLabel("Their join page").fill("");
  await c.getByRole("button", { name: "Save", exact: true }).click();
  assert(await until(async () => (await partner()).name === RENAMED), "renamed in the DB");
  const edited = await partner();
  assert(edited.joinUrl === null && edited.slug === SLUG, "join page cleared, link name unchanged");
  assert(await until(async () => (await audits("partner.update", p.id)) === 1), "the edit is audited");

  step("Pause and resume");
  await page.goto(`${BASE}${PATH}`);
  await hydrated(card(RENAMED).getByRole("button", { name: "Pause" }));
  await card(RENAMED).getByRole("button", { name: "Pause" }).click();
  assert(await until(async () => Number((await partner()).active) === 0), "paused in the DB");
  assert(await until(async () => (await audits("partner.pause", p.id)) === 1), "the pause is audited");
  await card(RENAMED).getByText("Paused", { exact: true }).waitFor();
  ok("the card shows Paused");
  await hydrated(card(RENAMED).getByRole("button", { name: "Resume" }));
  await card(RENAMED).getByRole("button", { name: "Resume" }).click();
  assert(await until(async () => Number((await partner()).active) === 1), "resumed in the DB");
  assert(await until(async () => (await audits("partner.resume", p.id)) === 1), "the resume is audited");

  step("Show the key");
  await page.goto(`${BASE}${PATH}`);
  await hydrated(card(RENAMED).getByRole("button", { name: "Show key" }));
  await card(RENAMED).getByRole("button", { name: "Show key" }).click();
  const keyText = await card(RENAMED).getByText(`Key for ${RENAMED}:`).first().textContent();
  const key1 = keyText.match(/([0-9a-f]{32,})/)?.[1];
  assert(key1, `a hex key is shown (${key1?.length} chars)`);
  assert(await until(async () => (await audits("partner.key_reveal", p.id)) === 1), "the reveal is audited");
  await shot(page, "key");

  step("Rotate the key");
  await page.goto(`${BASE}${PATH}`);
  await hydrated(card(RENAMED).getByRole("button", { name: "Rotate key" }));
  const v0 = Number((await partner()).keyVersion);
  await card(RENAMED).getByRole("button", { name: "Rotate key" }).click();
  await page.getByText(`Rotate the key for ${RENAMED}?`).waitFor();
  await page.getByRole("button", { name: "Rotate key" }).last().click();
  assert(await until(async () => Number((await partner()).keyVersion) === v0 + 1), `key version ${v0} → ${v0 + 1}`);
  assert(await until(async () => (await audits("partner.key_rotate", p.id)) === 1), "the rotation is audited");
  await page.goto(`${BASE}${PATH}`);
  await hydrated(card(RENAMED).getByRole("button", { name: "Show key" }));
  await card(RENAMED).getByRole("button", { name: "Show key" }).click();
  const key2 = (await card(RENAMED).getByText(`Key for ${RENAMED}:`).first().textContent()).match(/([0-9a-f]{32,})/)?.[1];
  assert(key2 && key2 !== key1, "the new key differs from the old one");

  step("HQ staff see it view-only");
  const staff = await newPage("merch@herbalholland.com");
  await staff.getByText("View only: partners are set by the HQ administrator.").waitFor();
  assert(await staff.getByRole("heading", { name: RENAMED, exact: true }).count(), "the partner is listed");
  for (const b of ["Pause", "Resume", "Rotate key", "Show key", "Add partner"]) assert(!(await staff.getByRole("button", { name: b, exact: true }).count()), `no ${b} button`);
  await shot(staff, "view-only");
  await staff.context().close();

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {
  const extra = await partners().catch(() => []);
  for (const r of extra) {
    await db.query(`DELETE FROM "AuditLog" WHERE "entityId" = $1`, [r.id]).catch(() => undefined);
    await db.query(`DELETE FROM "PartnerLink" WHERE "partnerId" = $1`, [r.id]).catch(() => undefined);
    await db.query(`DELETE FROM "PartnerBrand" WHERE id = $1`, [r.id]).catch((e) => console.error(`  ✗ cleanup: ${e.message}`));
  }
  console.log(`  ↺ ${extra.length} test partner row(s) removed`);
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
