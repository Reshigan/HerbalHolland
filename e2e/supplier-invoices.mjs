// End-to-end test of Finance → Supplier invoices in the store back office (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/supplier-invoices.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// The PTA01 manager: a file that isn't a JPEG, PNG or PDF is refused, and so is a due date before the invoice date,
// with nothing saved; a real invoice is captured with its photo, VAT worked out, the ledger queued and the capture
// audited; the same number from the same supplier (in other case) is refused; a query needs a reason, then queries
// and audits; reopen makes it due again; mark paid records who and when, and a paid invoice can't be queried; the
// photo is served back to staff.
// Re-runnable: the test invoices, their files, queue rows and audit rows are deleted at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-supplier-invoices";
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
const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
const daysFromNow = (k) => dayKey(new Date(Date.now() + k * 86_400_000));

const CODE = "PTA01";
const MANAGER = "manager.pta01@herbalholland.com";
const PATH = `/store/${CODE}/finance/supplier-invoices`;
const store = await one(`SELECT id FROM "Store" WHERE code = $1`, [CODE]);
if (!store) fail(`no ${CODE}: seed the demo data`);
const manager = await one(`SELECT id FROM "User" WHERE email = $1`, [MANAGER]);
const run = Date.now().toString(36);
const SUPPLIER = `E2E Supplier ${run}`;
const NUMBER = `INV-${run}`.toUpperCase();
// A 1×1 PNG, and text bytes dressed up as one.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const FAKE = Buffer.from("this is not an image at all, just words pretending to be a photo");

const invoices = () => q(`SELECT * FROM "SupplierInvoice" WHERE "supplierName" = $1`, [SUPPLIER]);
const audits = async (action, id) => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = $1 AND "entityId" = $2`, [action, id])).n);
const createAudits = async () => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = 'supplier_invoice.create' AND "storeId" = $1`, [store.id]).catch(() => one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = 'supplier_invoice.create'`))).n);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
page.setDefaultNavigationTimeout(120_000);

const dialog = () => page.getByRole("dialog");
async function openForm() {
  await page.goto(`${BASE}${PATH}`);
  await hydrated(page.getByRole("button", { name: "Add invoice" }));
  await page.getByRole("button", { name: "Add invoice" }).click();
  await hydrated(dialog().getByRole("button", { name: "Capture invoice" }));
}
async function fill({ supplier = SUPPLIER, number = NUMBER, invoiceDate = dayKey(), dueDate = daysFromNow(30), total = "1150.00", file = { name: "invoice.png", mimeType: "image/png", buffer: PNG } } = {}) {
  const d = dialog();
  await d.getByLabel("Supplier", { exact: true }).fill(supplier);
  await d.getByLabel("Invoice number", { exact: true }).fill(number);
  await d.getByLabel("Invoice date", { exact: true }).fill(invoiceDate);
  await d.getByLabel("Due date", { exact: true }).fill(dueDate);
  await d.getByLabel("Total incl. VAT", { exact: true }).fill(total);
  const vat = d.getByRole("checkbox", { name: /Tax invoice/ });
  if (!(await vat.isChecked())) await vat.check();
  const account = d.getByLabel("Charged to", { exact: true });
  const first = await account.locator("option:not([disabled])").first().getAttribute("value");
  await account.selectOption(first);
  await d.getByLabel("Photo or PDF of the invoice", { exact: true }).setInputFiles(file);
}
const submit = () => dialog().getByRole("button", { name: "Capture invoice" }).click();
const refused = (text) => dialog().getByRole("alert").filter({ hasText: text }).first().waitFor();
const row = () => page.getByRole("row").filter({ hasText: NUMBER });
async function confirm(trigger, title, setup, button) {
  await page.goto(`${BASE}${PATH}`);
  const btn = row().getByRole("button", { name: trigger, exact: true });
  await hydrated(btn);
  await btn.click();
  const panel = page.getByRole("group", { name: title });
  await panel.waitFor();
  if (setup) await setup(panel);
  await panel.getByRole("button", { name: button }).click();
  return panel;
}

let inv;
try {
  step("The manager opens Supplier invoices");
  await page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(MANAGER)}&next=${encodeURIComponent(PATH)}`);
  await page.waitForURL((u) => u.pathname === PATH, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Supplier invoices", level: 1 }).waitFor();
  ok("signed in as the PTA01 manager");
  const createsBefore = await createAudits();

  step("A file that isn't a JPEG, PNG or PDF is refused; nothing is saved");
  await openForm();
  await fill({ file: { name: "invoice.png", mimeType: "image/png", buffer: FAKE } });
  await submit();
  await refused("The invoice must be a JPEG or PNG photo, or a PDF");
  assert((await invoices()).length === 0, "no invoice row");
  assert((await createAudits()) === createsBefore, "no audit row");
  await shot(page, "wrong-file");

  step("A due date before the invoice date is refused; nothing is saved");
  await fill({ dueDate: daysFromNow(-3) });
  await submit();
  await refused(/due/i);
  assert((await invoices()).length === 0, "no invoice row");
  assert((await createAudits()) === createsBefore, "no audit row");
  await shot(page, "due-before-invoice");

  step("A real invoice is captured with its photo, VAT, ledger queue and audit");
  await fill();
  await submit();
  await dialog().getByRole("status").filter({ hasText: `Captured invoice ${NUMBER} from ${SUPPLIER}` }).waitFor();
  ok("success notice");
  inv = (await until(async () => (await invoices())[0]));
  assert(inv && inv.status === "DUE", "row is DUE");
  assert(Number(inv.totalCents) === 115000 && Number(inv.vatCents) === 15000, `R1,150.00 with R150.00 VAT (${inv.totalCents}/${inv.vatCents})`);
  assert(inv.storeId === store.id && inv.createdById === manager.id, "this store, captured by the manager");
  const upload = await one(`SELECT * FROM "Upload" WHERE id = $1`, [inv.uploadId]);
  assert(upload && upload.contentType === "image/png" && Number(upload.sizeBytes) === PNG.length && upload.key.startsWith(`supplier-invoices/${CODE}/`), `photo stored (${upload?.key})`);
  assert(await until(async () => (await audits("supplier_invoice.create", inv.id)) === 1), "supplier_invoice.create audited");
  assert(await one(`SELECT 1 AS x FROM "LedgerQueue" WHERE source = 'supplier-invoice' AND "sourceId" = $1`, [inv.id]), "ledger posting queued");
  await shot(page, "captured");

  step("The same number from the same supplier, in other case, is refused");
  await page.keyboard.press("Escape");
  await openForm();
  await fill({ supplier: SUPPLIER.toLowerCase(), number: NUMBER.toLowerCase() });
  await submit();
  await refused("is already captured");
  assert((await q(`SELECT id FROM "SupplierInvoice" WHERE lower("supplierName") = lower($1)`, [SUPPLIER])).length === 1, "still one invoice");
  await shot(page, "duplicate");

  step("A query needs a reason; then it's queried and audited");
  let panel = await confirm("Query", `Query ${NUMBER}?`, (p) => p.getByLabel("What doesn't match?", { exact: true }).fill("no"), "Query invoice");
  await panel.getByRole("alert").filter({ hasText: "Say what's wrong with the invoice" }).first().waitFor();
  assert((await one(`SELECT status FROM "SupplierInvoice" WHERE id = $1`, [inv.id])).status === "DUE", "still DUE");
  await panel.getByLabel("What doesn't match?", { exact: true }).fill("Short delivery: 2 cartons missing");
  await panel.getByRole("button", { name: "Query invoice" }).click();
  const queried = await until(async () => { const r = await one(`SELECT * FROM "SupplierInvoice" WHERE id = $1`, [inv.id]); return r.status === "QUERIED" && r; });
  assert(queried && queried.note === "Short delivery: 2 cartons missing", "QUERIED with the reason");
  assert(await until(async () => (await audits("supplier_invoice.query", inv.id)) === 1), "supplier_invoice.query audited");
  await shot(page, "queried");

  step("Reopen makes it due again");
  await confirm("Reopen", `Reopen ${NUMBER}?`, null, "It's due again");
  assert(await until(async () => (await one(`SELECT status FROM "SupplierInvoice" WHERE id = $1`, [inv.id])).status === "DUE"), "DUE again");
  assert(await until(async () => (await audits("supplier_invoice.reopen", inv.id)) === 1), "supplier_invoice.reopen audited");

  step("Mark paid records who and when; a paid invoice can't be queried");
  await confirm("Mark paid", `Mark ${NUMBER} as paid?`, (p) => p.getByLabel("Note (optional)", { exact: true }).fill("EFT e2e"), "Mark paid");
  const paid = await until(async () => { const r = await one(`SELECT * FROM "SupplierInvoice" WHERE id = $1`, [inv.id]); return r.status === "PAID" && r; });
  assert(paid && paid.paidAt && paid.paidById === manager.id, "PAID, by the manager, with a date");
  assert(await until(async () => (await audits("supplier_invoice.pay", inv.id)) === 1), "supplier_invoice.pay audited");
  await page.goto(`${BASE}${PATH}`);
  await row().first().waitFor();
  assert(!(await row().getByRole("button", { name: "Query", exact: true }).count()) && !(await row().getByRole("button", { name: "Mark paid", exact: true }).count()), "no Query or Mark paid on a paid invoice");
  await shot(page, "paid");

  step("The photo is served back to staff");
  // Fetched in the page so it carries the browser's session (the secure cookie isn't sent by page.request over http).
  const res = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get("content-type") ?? "", url: r.url, bytes: [...new Uint8Array(await r.arrayBuffer())] }; }, `${BASE}${PATH}/${inv.id}/file`);
  assert(res.status === 200 && res.type.startsWith("image/png"), `200 ${res.type} from ${res.url}`);
  const body = Buffer.from(res.bytes);
  assert(body.equals(PNG), "the same bytes come back");
  assert(await until(async () => (await audits("supplier_invoice.file_view", inv.id)) === 1), "the view is audited");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {

  const extra = await q(`SELECT * FROM "SupplierInvoice" WHERE lower("supplierName") = lower($1)`, [SUPPLIER]).catch(() => []);
  for (const r of extra) {
    await db.query(`DELETE FROM "LedgerQueue" WHERE "sourceId" = $1`, [r.id]).catch(() => undefined);
    await db.query(`DELETE FROM "AuditLog" WHERE "entityId" = $1`, [r.id]).catch(() => undefined);
    await db.query(`DELETE FROM "SupplierInvoice" WHERE id = $1`, [r.id]).catch((e) => console.error(`  ✗ cleanup: ${e.message}`));
    await db.query(`DELETE FROM "Upload" WHERE id = $1`, [r.uploadId]).catch(() => undefined);
  }
  console.log(`  ↺ ${extra.length} test invoice row(s) removed`);
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
