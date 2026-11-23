// End-to-end test of HQ → Franchise leads, one lead's page (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/hq-franchise.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// A test lead is moved on with a note (status, notes line and audit checked); "Disclosure sent" without a date is
// refused, then saved with today's date and signing stays locked; the owner is assigned, re-assigned (no change) and
// cleared; notes save once and an unchanged save is refused; the disclosure date can't be cleared at that status or set in
// the future, and moves to yesterday; HQ staff can't delete; the admin deletes only after typing DELETE, and the row is gone
// with a lead.delete audit.
// Re-runnable: the test lead and its audit rows are deleted at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-hq-franchise";
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

const run = Date.now().toString(36);
const ID = `e2e-${run}`;
const NUMBER = `FL-E2E${run}`.toUpperCase();
const PATH = `/hq/franchise/${ID}`;
const sast = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
const TODAY = sast(new Date());
const YESTERDAY = sast(new Date(Date.now() - 86_400_000));
const TOMORROW = sast(new Date(Date.now() + 86_400_000));
const lead = () => one(`SELECT * FROM "FranchiseLead" WHERE id = $1`, [ID]);
const audits = async (action) => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = $1 AND "entityId" = $2`, [action, ID])).n);

const now = new Date().toISOString().replace("Z", "+00:00");
await db.query(
  `INSERT INTO "FranchiseLead" (id, number, name, email, phone, area, province, experience, capital, pharmacist, status, "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, '+27820000000', 'Ballito', 'KZN', 'Ran a pharmacy franchise for eight years.', '1.5-3m', 0, 'NEW', $5, $5)`,
  [ID, NUMBER, `E2E Lead ${run}`, `${ID}@example.com`, now],
);

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
const open = async () => {
  await page.goto(`${BASE}${PATH}`);
  await hydrated(page.getByRole("button", { name: "Save notes" }));
};
const panel = (label) => page.getByRole("group", { name: `Move ${NUMBER} to “${label}”` });
async function move(trigger, label, fill) {
  await open();
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const p = panel(label);
  await p.waitFor();
  await fill?.(p);
  await p.getByRole("button", { name: `Move to ${label}` }).click();
}
const sees = (text) => page.getByText(text).first().waitFor();

try {
  step("Move the new lead on to Contacted with a note");
  await page.getByRole("heading", { name: `E2E Lead ${run}` }).first().waitFor();
  await move("Contacted", "Contacted", (p) => p.getByLabel("Note (optional, added to the notes)").fill(`Called them ${run}`));
  await sees("Moved to “Contacted” and your note is in the notes");
  let l = await until(async () => ((await lead()).status === "CONTACTED" ? lead() : null));
  assert(l, "status is CONTACTED");
  assert(l.notes?.includes(`New → Contacted: Called them ${run}`), "the note is a dated line in the notes");
  assert((await audits("lead.update")) === 1, "one lead.update audit");
  await shot(page, "contacted");

  step("Disclosure sent: no date is refused, today's date moves it");
  await move("Disclosure sent", "Disclosure sent", async (p) => {
    const d = p.getByLabel("Disclosure document sent on");
    await d.evaluate((e) => e.removeAttribute("required"));
    await d.fill("");
  });
  await sees("Add the day the disclosure document was sent.");
  assert((await lead()).status === "CONTACTED", "still Contacted, nothing saved");
  await move("Disclosure sent", "Disclosure sent", (p) => p.getByLabel("Disclosure document sent on").fill(TODAY));
  await sees("The earliest signing day is");
  l = await lead();
  assert(l.status === "DISCLOSURE_SENT" && l.disclosureSentAt, "status DISCLOSURE_SENT with the sent date");
  await open();
  assert(await page.getByText("Signed isn't available yet.").count(), "signing is locked for 14 days");
  assert(!(await page.getByRole("button", { name: "Signed", exact: true }).count()), "no Signed button");
  await shot(page, "disclosure-sent");

  step("Owner: assign, assign again (no change), unassign");
  const hq = await one(`SELECT id FROM "User" WHERE email = 'hq@herbalholland.com'`);
  const owner = page.getByLabel("Owner", { exact: true });
  await owner.selectOption(hq.id);
  await page.getByRole("button", { name: "Assign" }).click();
  await sees("Assigned. It's in their hands now.");
  assert((await lead()).ownerId === hq.id, "ownerId is the HQ admin");
  await open();
  await page.getByRole("button", { name: "Assign" }).click();
  await sees("No change: it was already assigned that way.");
  await open();
  await owner.selectOption("");
  await page.getByRole("button", { name: "Assign" }).click();
  await sees("Unassigned.");
  assert((await lead()).ownerId === null, "ownerId cleared");

  step("Notes: save, then an unchanged save is refused");
  await open();
  const notes = page.locator("#lead-notes");
  await notes.fill(`${await notes.inputValue()}\n\nFollow up next week ${run}`);
  await page.getByRole("button", { name: "Save notes" }).click();
  await sees("Notes saved.");
  assert((await lead()).notes.includes(`Follow up next week ${run}`), "notes saved in the DB");
  await open();
  await page.getByRole("button", { name: "Save notes" }).click();
  await sees("No changes to save.");

  step("Disclosure date: can't clear it at this status, can't be in the future, moves to yesterday");
  const sent = () => page.locator("#lead-sent-on");
  const save = () => page.getByRole("button", { name: "Save date" }).click();
  await open();
  await sent().evaluate((e) => e.removeAttribute("required"));
  await sent().fill("");
  await save();
  await sees("A lead at “Disclosure sent” needs the day the document went out.");
  await open();
  await sent().evaluate((e) => e.removeAttribute("max"));
  await sent().fill(TOMORROW);
  await save();
  await sees("The disclosure date can't be in the future.");
  const before = (await lead()).disclosureSentAt;
  await open();
  await sent().fill(YESTERDAY);
  await save();
  await sees("Saved: sent on");
  assert((await lead()).disclosureSentAt !== before, "the sent date moved");
  await shot(page, "date-moved");

  step("HQ staff can't delete");
  const staff = await newPage("merch@herbalholland.com");
  await staff.getByText("Deleting an enquiry at the person's request (POPIA) is done by the HQ administrator.").waitFor();
  assert(!(await staff.getByRole("button", { name: "Delete enquiry" }).count()), "no Delete enquiry button");
  await staff.context().close();

  step("Admin deletes only after typing DELETE");
  await open();
  await page.getByRole("button", { name: "Delete enquiry" }).click();
  const del = page.getByRole("group", { name: `Delete ${NUMBER} for good?` });
  await del.waitFor();
  const go = del.getByRole("button", { name: "Delete for good" });
  assert(await go.isDisabled(), "Delete for good is disabled before the phrase");
  await del.locator("#confirm-phrase").fill("DELET");
  assert(await go.isDisabled(), "a wrong phrase keeps it disabled");
  await del.locator("#confirm-phrase").fill("DELETE");
  await go.click();
  await page.waitForURL(/\/hq\/franchise\?status=all/);
  await sees(`${NUMBER} is deleted`);
  assert(!(await lead()), "the lead row is gone");
  assert((await audits("lead.delete")) === 1, "a lead.delete audit");
  await shot(page, "deleted");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {
  await db.query(`DELETE FROM "AuditLog" WHERE "entityId" = $1`, [ID]).catch(() => undefined);
  await db.query(`DELETE FROM "FranchiseLead" WHERE id = $1`, [ID]).catch((e) => console.error(`  ✗ cleanup: ${e.message}`));
  console.log("  ↺ test lead removed");
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
