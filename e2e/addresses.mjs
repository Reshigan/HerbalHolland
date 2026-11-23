// End-to-end test of a member's saved delivery addresses (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/addresses.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Signed out, the page sends you to sign in and back. A member with no saved addresses: a bad postal code and a missing
// street are refused with nothing saved; the first address becomes the default; a second one ticked as default takes over;
// the star moves the default back; unticking "default" on the default address keeps it (only another address can take
// over); an edit is saved; at five addresses the add form goes away; removing the default hands it to another address.
// Re-runnable: the member's addresses are deleted at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-addresses";
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
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
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

// A member with a phone and no saved addresses yet.
const member = await one(`SELECT c.id, c.phone FROM "Customer" c WHERE c.phone IS NOT NULL AND c."memberNo" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Address" a WHERE a."customerId" = c.id) ORDER BY c."memberNo" LIMIT 1`);
if (!member) fail("no member without saved addresses: seed the demo data");
const rows = () => q(`SELECT id, label, line, "postalCode", "isDefault", notes FROM "Address" WHERE "customerId" = $1 ORDER BY "createdAt"`, [member.id]);
const defaults = async () => (await rows()).filter((a) => Number(a.isDefault)).map((a) => a.line);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
page.setDefaultNavigationTimeout(120_000);

const addPanel = () => page.locator("div").filter({ has: page.getByRole("heading", { name: "Add an address" }) }).last();
async function addAddress({ label = "Home", line, suburb = "Hatfield", city = "Pretoria", province = "GP", postal = "0083", notes = "", makeDefault = false }) {
  const f = addPanel().locator("form");
  await hydrated(f.getByRole("button", { name: "Add address" }));
  await f.getByLabel("Label").selectOption(label);
  await f.getByLabel("Street address").fill(line);
  await f.getByLabel("Suburb").fill(suburb);
  await f.getByLabel("Town or city").fill(city);
  await f.getByLabel("Province").selectOption(province);
  await f.getByLabel("Postal code").fill(postal);
  await f.getByLabel("Delivery notes (optional)").fill(notes);
  await f.getByLabel("Use as my default delivery address").setChecked(makeDefault);
  const before = (await rows()).length;
  await f.getByRole("button", { name: "Add address" }).click();
  assert(await until(async () => (await rows()).length === before + 1), `saved: ${label}, ${line}`);
  await page.getByText(line).first().waitFor();
}
// The card of a saved address, by its street line.
const card = (line) => page.locator("div.p-5").filter({ hasText: line }).first();

try {
  step("Signed out, the page sends you to sign in and back");
  await page.goto(`${BASE}/club/addresses`);
  await page.waitForURL((u) => u.pathname === "/club/join", { timeout: 30_000 });
  assert(new URL(page.url()).searchParams.get("next") === "/club/addresses", "redirected to /club/join with next=/club/addresses");
  await hydrated(page.getByLabel("Mobile number"));
  await page.getByLabel("Mobile number").fill(`0${member.phone.slice(3)}`);
  await page.getByRole("button", { name: /Send my code/ }).click();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/club/addresses", { timeout: 60_000 });
  await page.getByText("No saved addresses yet").waitFor();
  ok("signed in, back on the page, empty state shown");
  await shot(page, "empty");

  step("A bad postal code and a missing street are refused; nothing is saved");
  {
    const f = addPanel().locator("form");
    await hydrated(f.getByRole("button", { name: "Add address" }));
    await f.evaluate((el) => { el.noValidate = true; }); // test the server's checks, not just the browser's
    await f.getByLabel("Street address").fill("1");
    await f.getByLabel("Suburb").fill("Hatfield");
    await f.getByLabel("Town or city").fill("Pretoria");
    await f.getByLabel("Province").selectOption("GP");
    await f.getByLabel("Postal code").fill("83");
    await f.getByRole("button", { name: "Add address" }).click();
    await f.getByText("4-digit postal code").waitFor();
    await f.getByText("Enter the street address").waitFor();
    await f.getByText("Check the address").waitFor();
    ok("refused with field errors: street, postal code");
    assert(await f.getByLabel("Suburb").inputValue() === "Hatfield", "the typed values come back");
    assert((await rows()).length === 0, "nothing saved");
    await shot(page, "refused");
  }

  step("The first address becomes the default; a second ticked as default takes over");
  await page.reload();
  await addAddress({ label: "Home", line: "14 Jacaranda Street", notes: "Gate code at the intercom" });
  assert(JSON.stringify(await defaults()) === JSON.stringify(["14 Jacaranda Street"]), "the first address is the default");
  await addAddress({ label: "Work", line: "1 Church Square", suburb: "Pretoria CBD", postal: "0002", makeDefault: true });
  assert(JSON.stringify(await defaults()) === JSON.stringify(["1 Church Square"]), "the second, ticked, is now the only default");
  await card("1 Church Square").getByText("Default", { exact: true }).waitFor();
  ok("the Default tag moved on screen");
  await shot(page, "two");

  step("The star makes an address the default");
  await hydrated(page.getByRole("button", { name: "Make Home the default address" }));
  await page.getByRole("button", { name: "Make Home the default address" }).click();
  assert(await until(async () => JSON.stringify(await defaults()) === JSON.stringify(["14 Jacaranda Street"])), "Home is the only default again");
  await page.getByRole("button", { name: "Make Work the default address" }).waitFor();
  ok("Work now has the star, Home doesn't");

  step("Editing: unticking default on the default keeps it; the edit is saved");
  {
    const c = card("14 Jacaranda Street");
    await c.getByText("Edit", { exact: true }).click();
    const f = c.locator("form").filter({ has: page.getByRole("button", { name: "Save changes" }) });
    await hydrated(f.getByRole("button", { name: "Save changes" }));
    await f.getByLabel("Street address").fill("16 Jacaranda Street");
    await f.getByLabel("Use as my default delivery address").setChecked(false);
    await f.getByRole("button", { name: "Save changes" }).click();
    assert(await until(async () => (await rows()).some((a) => a.line === "16 Jacaranda Street")), "the new street is saved");
    const list = await rows();
    assert(list.length === 2, "edited in place, not added");
    assert(JSON.stringify(await defaults()) === JSON.stringify(["16 Jacaranda Street"]), "still the default: the account is never left without one");
    assert(list.find((a) => a.line === "16 Jacaranda Street").notes === "Gate code at the intercom", "the notes are kept");
  }

  step("At five addresses the add form goes away");
  await page.reload();
  for (let i = 3; i <= 5; i++) await addAddress({ label: "Other", line: `${i} Test Road`, suburb: "Sea Point", city: "Cape Town", province: "WC", postal: "8005" });
  await page.reload();
  await page.getByText("5 Test Road").first().waitFor();
  assert(!(await page.getByRole("heading", { name: "Add an address" }).isVisible()), "no add form at five");
  await shot(page, "five");

  step("Removing the default hands it to another address");
  await hydrated(page.getByRole("button", { name: "Remove Home address" }));
  await page.getByRole("button", { name: "Remove Home address" }).click();
  assert(await until(async () => (await rows()).length === 4), "four left");
  // The delete and the hand-over are two writes (D1 has no transactions), so wait for the second.
  const d = (await until(async () => ((await defaults()).length === 1 ? defaults() : null))) ?? (await defaults());
  assert(d.length === 1 && d[0] !== "16 Jacaranda Street", `exactly one default remains (${d[0]})`);
  await page.getByRole("heading", { name: "Add an address" }).waitFor();
  ok("the add form is back under five");
  await shot(page, "removed");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {
  await db.query(`DELETE FROM "Address" WHERE "customerId" = $1`, [member.id]).then(() => console.log("  ↺ addresses removed"), (e) => console.error(`  ✗ cleanup: ${e.message}`));
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
