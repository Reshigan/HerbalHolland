// End-to-end test of the books (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> [CRON_SECRET=…] node e2e/accounting.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Mokoena Retail's owner opens the books from the store sidebar, and the trial balance agrees with the database and
// downloads as CSV. Their accountant drafts a manual journal, which the owner approves and then reverses. The accountant
// adds a bank account if there isn't one and imports a statement: the cash deposits on it match themselves to their
// postings, and the bank charge is allocated. The owner opens VAT and closes last month, then reopens it. HQ's admin
// records a payment against a store's statement and deletes it; with CRON_SECRET set, the queue runs and both companies'
// books are checked. Last, who can't see what: the accountant gets no HQ books and no store, and the area manager reads
// without editing. Every action is timed. Re-runnable: what it creates carries a run suffix, and the month and the
// payment are put back.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CRON = process.env.CRON_SECRET;
const out = process.argv[2] ?? "test-results/e2e-accounting";
mkdirSync(out, { recursive: true });
const db = createDb(); // DATABASE_FILE, or the local D1 file (e2e/_db.mjs)
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const OWNER = "thabo@mokoenaretail.co.za";
const ACCOUNTANT = "books@mokoenaretail.co.za";
const HQ = "hq@herbalholland.com";
const AREA = "area.gpn@herbalholland.com";
const run = Date.now().toString(36).slice(-5).toUpperCase();

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`[${who}] pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  return { ctx, page };
}
const signIn = (page, email, next) => page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor();
  for (let i = 0; i < 600; i++) {
    if (await el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never hydrated: ${el}`);
}
async function visit(p, path, ready) {
  await p.goto(`${BASE}${path}`);
  await hydrated(ready);
}

let n = 0;
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
const ok = (msg) => console.log("  ✓", msg);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
  ok(msg);
};
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
const status = (scope, text) => scope.getByRole("status").filter({ hasText: text }).first();
const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
const monthName = (m) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00Z`));
const rand = (cents) => (cents / 100).toFixed(2);
const prevMonth = (m) => (m.endsWith("-01") ? `${+m.slice(0, 4) - 1}-12` : `${m.slice(0, 5)}${String(+m.slice(5) - 1).padStart(2, "0")}`);
const csvRows = (text) => text.replace(/^﻿/, "").trim().split(/\r?\n/).map((l) => l.split(","));

const timings = [];
const isAction = (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"];
async function act(page, label, trigger, done) {
  const resp = page.waitForResponse(isAction, { timeout: 90_000 });
  resp.catch(() => undefined);
  const t0 = performance.now();
  await trigger();
  await resp;
  await done();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  console.log(`    ⏱ ${label}: ${ms} ms`);
}
async function runQueue() {
  const r = await fetch(`${BASE}/api/cron/frequent`, { method: "POST", headers: { authorization: `Bearer ${CRON}` } });
  if (!r.ok) throw new Error(`the frequent job answered ${r.status}`);
  return (await r.json()).ledger;
}

const company = await one(`select c.id, c.name from "Company" c join "User" u on u."companyId" = c.id where u.email = $1`, [OWNER]);
const hqCo = await one(`select id from "Company" where kind = 'FRANCHISOR' order by "createdAt" limit 1`);
const users = Object.fromEntries((await q(`select email, id from "User" where email = any($1)`, [[OWNER, ACCOUNTANT, HQ]])).map((u) => [u.email, u.id]));
const store = await one(`select id, code, name from "Store" where "companyId" = $1 and status = 'ACTIVE' and kind = 'RETAIL' order by code limit 1`, [company.id]);
const today = dayKey();
const lastMonth = dayKey(new Date(new Date(`${today.slice(0, 7)}-01T12:00:00+02:00`).getTime() - 5 * 86_400_000)).slice(0, 7);
const books = `/books/${company.id}`;
const lockedBefore = (await one(`select "booksLockedThrough" from "Company" where id = $1`, [company.id])).booksLockedThrough;
const account = async (key) => (await one(`select id, code, name from "LedgerAccount" where "companyId" = $1 and key = $2`, [company.id, key]));
const balance = async (companyId, key, period) =>
  Number((await one(`select coalesce(sum(b."debitCents" - b."creditCents"), 0)::bigint as v from "LedgerBalance" b join "LedgerAccount" a on a.id = b."accountId" where b."companyId" = $1 and a.key = $2 ${period ? "and b.period = $3" : ""}`, period ? [companyId, key, period] : [companyId, key])).v);
const started = new Date();
const sessions = [];
let passed = false;
let payment = null;

try {
  console.log(`Books journey · ${company.name} · run ${run}${CRON ? "" : " · no CRON_SECRET: the queue isn't run, so automatic postings aren't checked"}`);

  // ── The owner: the books from the store, the trial balance ──
  step("Owner opens the books from the store sidebar");
  const owner = await session("owner");
  sessions.push(owner);
  const op = owner.page;
  await signIn(op, OWNER, `/store/${store.code}`);
  await hydrated(op.getByRole("link", { name: "Books", exact: true }));
  await op.getByRole("link", { name: "Books", exact: true }).first().click();
  await op.waitForURL(`**${books}`);
  await op.getByRole("heading", { name: company.name }).first().waitFor();
  assert(true, `Books → ${books}: ${company.name}`);
  const tb = await one(`select sum("debitCents") as d, sum("creditCents") as c from "LedgerBalance" where "companyId" = $1`, [company.id]);
  assert(Number(tb.d) > 0 && Number(tb.d) === Number(tb.c), `the books balance: debits = credits = R${rand(Number(tb.d))}`);
  await shot(op, "overview");

  step("Trial balance on screen and as CSV");
  await visit(op, `${books}/reports/trial-balance`, op.getByRole("link", { name: "Download CSV" }));
  assert((await op.getByText("These books don't balance").count()) === 0, "no imbalance warning");
  const [dl] = await Promise.all([op.waitForEvent("download"), op.getByRole("link", { name: "Download CSV" }).click()]);
  const rows = csvRows(readFileSync(await dl.path(), "utf8"));
  assert(rows.length > 5 && /code/i.test(rows[0].join(",")), `${dl.suggestedFilename()}: ${rows.length - 1} rows under a header`);
  for (const r of ["income", "balance-sheet", "cash-flow", "ledger", "ageing"]) {
    const res = await op.goto(`${BASE}${books}/reports/${r}`);
    assert(res.status() === 200, `reports/${r} opens`);
  }
  await shot(op, "trial-balance");

  // ── The accountant drafts, the owner approves and reverses ──
  step("Accountant saves a manual journal as a draft");
  const accountant = await session("accountant");
  sessions.push(accountant);
  const ap = accountant.page;
  await signIn(ap, ACCOUNTANT); // their home: the company's books
  await ap.waitForURL(`**${books}`);
  assert(true, "the accountant lands on their company's books");
  const rent = await account("exp.RENT");
  const bank = await account("bank");
  const rentBefore = await balance(company.id, "exp.RENT", today.slice(0, 7));
  await visit(ap, `${books}/journals/new`, ap.getByLabel("Line 1: debit"));
  await ap.getByLabel("Date", { exact: true }).fill(today);
  await ap.getByLabel("What it's for").fill(`E2E rent ${run}`);
  await ap.getByLabel("Line 1: account").selectOption({ label: `${rent.code} ${rent.name}` });
  if (await ap.getByLabel("Line 1: store").count()) await ap.getByLabel("Line 1: store").selectOption({ label: store.name });
  await ap.getByLabel("Line 1: debit").fill("1500.00");
  await ap.getByLabel("Line 2: account").selectOption({ label: `${bank.code} ${bank.name}` });
  await ap.getByLabel("Line 2: credit").fill("1500.00");
  await ap.getByText("✓ Balanced").waitFor();
  assert((await ap.getByRole("button", { name: "Post journal" }).count()) === 0, "an accountant can't post, only save drafts");
  await act(ap, "save draft", () => ap.getByRole("button", { name: "Save as draft" }).click(), () => status(ap, "is saved as a draft").waitFor());
  const draft = await one(`select id, number, status, "createdById" from "Journal" where "companyId" = $1 and memo = $2`, [company.id, `E2E rent ${run}`]);
  assert(draft?.status === "DRAFT" && draft.createdById === users[ACCOUNTANT], `journal ${draft?.number} waits as a draft`);
  assert((await balance(company.id, "exp.RENT", today.slice(0, 7))) === rentBefore, "a draft changes no balance");
  await shot(ap, "draft");

  step("Owner approves the draft, then reverses it");
  await visit(op, `${books}/journals/${draft.id}`, op.getByRole("button", { name: "Approve and post" }));
  await act(op, "approve journal", () => op.getByRole("button", { name: "Approve and post" }).click(), () => status(op, "is approved and posted").waitFor());
  const posted = await one(`select status, "approvedById" from "Journal" where id = $1`, [draft.id]);
  assert(posted.status === "POSTED" && posted.approvedById === users[OWNER], "posted, approved by the owner");
  assert((await balance(company.id, "exp.RENT", today.slice(0, 7))) === rentBefore + 150_000, "rent is R1,500.00 higher this month");
  await hydrated(op.getByRole("button", { name: "Reverse" }));
  await op.getByRole("button", { name: "Reverse" }).click();
  await act(op, "reverse journal", () => op.getByRole("group", { name: `Reverse journal ${draft.number}?` }).getByRole("button", { name: "Post the reversal" }).click(), () => status(op, "reverses it").waitFor());
  const reversal = await one(`select number from "Journal" where "reversalOfId" = $1`, [draft.id]);
  assert(reversal && (await balance(company.id, "exp.RENT", today.slice(0, 7))) === rentBefore, `journal ${reversal?.number} reverses it: rent back where it was`);
  assert(Number((await one(`select count(*) as count from "AuditLog" where action in ('ledger.journal_draft', 'ledger.journal_approve', 'ledger.journal_reverse') and "entityId" in ($1, (select id from "Journal" where "reversalOfId" = $1))`, [draft.id])).count) >= 3, "drafted, approved and reversed (audited)");

  // ── Banking: a statement imported, deposits matched, the fee allocated ──
  step("Accountant imports a bank statement");
  let acct = await one(`select id, name from "BankAccount" where "companyId" = $1 and active order by "createdAt" limit 1`, [company.id]);
  await visit(ap, `${books}/bank`, ap.getByRole("heading", { name: "Banking" }));
  if (!acct) {
    await hydrated(ap.getByRole("button", { name: "Add bank account" }));
    await ap.getByRole("button", { name: "Add bank account" }).click();
    const dlg = ap.getByRole("dialog", { name: "Add a bank account" });
    await dlg.getByLabel("Bank", { exact: true }).selectOption("FNB");
    await dlg.getByLabel("Name", { exact: true }).fill("Business cheque");
    await dlg.getByLabel("Account number").fill("62012345678");
    await act(ap, "add bank account", () => dlg.getByRole("button", { name: "Add bank account" }).click(), () => status(ap, "Added Business cheque").waitFor());
    acct = await one(`select id, name from "BankAccount" where "companyId" = $1 and active order by "createdAt" limit 1`, [company.id]);
    assert(acct, "bank account added: it carries the books' Bank account");
  } else ok(`bank account ${acct.name} already there`);
  // Two postings on the bank that no statement line has matched yet, each the only one of its amount near its day (so
  // each fits exactly one, and alone in its posting: an earlier run's payment and its reversal net to nothing). The demo's
  // statements match nearly everything; if two aren't left, two seeded lines are
  // set aside (ignored) so their postings are free again.
  const candidates = () =>
    q(
      `with p as (
         select j.id, j.number, j.date, sum(l."amountCents")::bigint as cents from "Journal" j join "JournalLine" l on l."journalId" = j.id
         where j."companyId" = $1 and l."accountId" = $2 and j.status = 'POSTED' and j.source in ('deposit', 'store-day', 'expense', 'statement-payment')
           and not exists (select 1 from "Journal" o where o."companyId" = j."companyId" and o.source = j.source and o."sourceId" = j."sourceId" and o.id <> j.id)
         group by j.id having sum(l."amountCents") <> 0)
       select p.id, p.number, to_char(p.date, 'YYYY-MM-DD') as day, p.cents from p
       where not exists (select 1 from "BankLine" b where b."journalId" = p.id and b.status in ('MATCHED', 'ALLOCATED'))
         and not exists (select 1 from p o where o.id <> p.id and o.cents = p.cents and abs(julianday(o.date) - julianday(p.date)) <= 7)
       order by p.date desc limit 2`,
      [company.id, bank.id],
    );
  let deposits = await candidates();
  if (deposits.length < 2) {
    await db.query(
      `update "BankLine" set status = 'IGNORED', "journalId" = null where id in (
         select b.id from "BankLine" b join "Journal" j on j.id = b."journalId" where b."companyId" = $1 and b.status = 'MATCHED' and j.source = 'deposit' order by b.date desc limit 2)`,
      [company.id],
    );
    deposits = await candidates();
  }
  assert(deposits.length === 2, `two postings no statement line has matched yet: journals ${deposits.map((d) => d.number).join(" and ")}`);
  const lines = [
    ...deposits.map((d) => ({ day: d.day, text: `${Number(d.cents) > 0 ? "Receipt" : "Payment"} ${store.code} ${run}`, cents: Number(d.cents) })),
    { day: today, text: `Monthly account fee ${run}`, cents: -8_500 },
  ].sort((a, b) => a.day.localeCompare(b.day));
  let bal = 10_000_000;
  const csv = ["Date,Description,Amount,Balance", ...lines.map((l) => `${l.day},${l.text},${rand(l.cents)},${rand((bal += l.cents))}`)].join("\n");
  await visit(ap, `${books}/bank`, ap.getByLabel("Statement file"));
  await ap.getByLabel("Bank account", { exact: true }).selectOption(acct.id);
  await ap.getByLabel("Format").selectOption("NEDBANK");
  await ap.getByLabel("Statement file").setInputFiles({ name: `statement-${run}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await act(ap, "import statement", () => ap.getByRole("button", { name: "Import statement" }).click(), () => status(ap, "matched automatically").waitFor());
  const imported = await q(`select id, status, "journalId", "amountCents" from "BankLine" where "bankAccountId" = $1 and description like $2`, [acct.id, `%${run}`]);
  const matched = imported.filter((l) => l.status === "MATCHED");
  assert(imported.length === 3 && matched.length === 2 && matched.every((l) => deposits.some((d) => d.id === l.journalId)), "3 lines in: both matched to their own postings by themselves");
  await shot(ap, "statement-imported");

  step("Accountant allocates the bank charge");
  const fee = imported.find((l) => l.status === "UNMATCHED");
  const charges = await account("exp.BANK_FEES");
  await visit(ap, `${books}/bank/${acct.id}?line=${fee.id}`, ap.getByRole("form", { name: "Allocate this line" }).getByLabel("Account"));
  await ap.getByRole("form", { name: "Allocate this line" }).getByLabel("Account").selectOption({ label: `${charges.code} · ${charges.name}` });
  await act(ap, "allocate a line", () => ap.getByRole("form", { name: "Allocate this line" }).getByRole("button", { name: "Allocate" }).click(), () => status(ap, "Allocated to").waitFor());
  const allocated = await one(`select l.status, j.source, j.number from "BankLine" l join "Journal" j on j.id = l."journalId" where l.id = $1`, [fee.id]);
  assert(allocated?.status === "ALLOCATED" && allocated.source === "bank", `allocated to bank charges: journal ${allocated?.number}`);
  const rec = await ap.goto(`${BASE}${books}/bank/${acct.id}/reconcile`);
  assert(rec.status() === 200, "the reconciliation opens");
  await shot(ap, "reconcile");

  // ── VAT and month end ──
  step("Owner opens VAT, closes last month and reopens it");
  const vat = await op.goto(`${BASE}${books}/vat`);
  assert(vat.status() === 200 && (await op.getByRole("heading", { name: "VAT" }).count()) > 0, "the VAT201 working opens");
  if (lockedBefore && lockedBefore >= lastMonth) ok(`${monthName(lastMonth)} is already closed: not closing it again`);
  else {
    await visit(op, `${books}/close?month=${lastMonth}`, op.getByRole("button", { name: `Close ${monthName(lastMonth)}` }));
    await op.getByRole("button", { name: `Close ${monthName(lastMonth)}` }).click();
    await act(op, "close the month", () => op.getByRole("group", { name: `Close the books through ${monthName(lastMonth)}?` }).getByRole("button", { name: /^Close (anyway|the month)$/ }).click(), () => status(op, "The books are closed through").waitFor());
    assert((await one(`select "booksLockedThrough" as l from "Company" where id = $1`, [company.id])).l === lastMonth, `closed through ${monthName(lastMonth)}`);
    await shot(op, "month-closed");
    await hydrated(op.getByRole("button", { name: `Reopen ${monthName(lastMonth)}` }));
    await op.getByRole("button", { name: `Reopen ${monthName(lastMonth)}` }).click();
    await act(op, "reopen the month", () => op.getByRole("group", { name: `Reopen ${monthName(lastMonth)}?` }).getByRole("button", { name: "Reopen", exact: true }).click(), () => status(op, "is open again").waitFor());
    assert((await one(`select "booksLockedThrough" as l from "Company" where id = $1`, [company.id])).l === prevMonth(lastMonth), `open again; months reopen one at a time, so ${monthName(prevMonth(lastMonth))} stays closed`);
    assert(Number((await one(`select count(*) as count from "AuditLog" where action in ('ledger.close', 'ledger.reopen') and "entityId" = $1 and at >= $2`, [company.id, started])).count) >= 2, "closing and reopening are audited");
  }

  // ── HQ: a statement payment, in both companies' books ──
  step("HQ records a payment against the store's statement, then deletes it");
  const hq = await session("hq");
  sessions.push(hq);
  const hp = hq.page;
  await signIn(hp, HQ, `/hq/statements?month=${lastMonth}&store=${store.code}`);
  await hydrated(hp.getByRole("button", { name: "Record payment" }));
  await hp.getByLabel("Who paid").selectOption("STORE_PAID");
  await hp.getByLabel("Amount (R)").fill("1.00");
  await hp.getByLabel("Bank reference").fill(`E2E ${run}`);
  await act(hp, "record statement payment", () => hp.getByRole("button", { name: "Record payment" }).click(), () => status(hp, "R1.00 paid to HQ").waitFor());
  payment = await one(`select id from "StatementPayment" where reference = $1`, [`E2E ${run}`]);
  assert(payment, "payment recorded (audited)");
  if (CRON) {
    const hqBefore = await balance(hqCo.id, "franchisees");
    const ledger = await runQueue();
    const js = await q(`select "companyId" from "Journal" where source = 'statement-payment' and "sourceId" = $1`, [payment.id]);
    assert(js.length === 2 && js.some((j) => j.companyId === company.id) && js.some((j) => j.companyId === hqCo.id), `the queue posted it in both books (${ledger.posted} posted)`);
    assert((await balance(hqCo.id, "franchisees")) === hqBefore - 100, "HQ is owed R1.00 less by the franchisee");
  }
  await hp.getByRole("row").filter({ hasText: `E2E ${run}` }).getByRole("button", { name: "Delete" }).click();
  await act(hp, "delete statement payment", () => hp.getByRole("group", { name: `Delete the R1.00 payment (E2E ${run})?` }).getByRole("button", { name: "Delete payment" }).click(), () => hp.getByRole("row").filter({ hasText: `E2E ${run}` }).waitFor({ state: "detached" }));
  assert(!(await one(`select id from "StatementPayment" where id = $1`, [payment.id])), "deleted");
  if (CRON) {
    await runQueue();
    const net = await one(`select coalesce(sum(l."amountCents"), 0)::int as v, count(distinct j.id)::int as n from "JournalLine" l join "Journal" j on j.id = l."journalId" join "LedgerAccount" a on a.id = l."accountId" where j.source = 'statement-payment' and j."sourceId" = $1 and a.key in ('hq', 'franchisees')`, [payment.id]);
    assert(net.n === 4 && net.v === 0, "its postings are reversed in both books");
  }
  payment = null;

  // ── Who sees what ──
  step("Access: the accountant sees no HQ books and no store; the area manager reads without editing");
  assert((await ap.goto(`${BASE}/books/${hqCo.id}`)).status() === 404, "accountant → HQ's books: not found");
  const storeRes = await ap.goto(`${BASE}/store/${store.code}`);
  assert(storeRes.status() === 404 || !ap.url().includes(`/store/${store.code}`), "accountant → the store's back office: no way in");
  const area = await session("area");
  sessions.push(area);
  const rp = area.page;
  await signIn(rp, AREA, books);
  await rp.getByRole("heading", { name: company.name }).first().waitFor();
  const jr = await rp.goto(`${BASE}${books}/journals`);
  assert(jr.status() === 200 && (await rp.getByRole("link", { name: "New journal" }).count()) === 0, "area manager: reads the journals, can't add one");

  passed = true;
} catch (e) {
  console.log(`\n✗ FAILED during “${current}”:`, e.message.split("\n")[0]);
  for (const s of sessions) await shot(s.page, "FAILED");
  process.exitCode = 1;
} finally {
  if (payment) await db.query(`delete from "StatementPayment" where id = $1`, [payment.id]).catch(() => undefined);
  await db.query(`update "Company" set "booksLockedThrough" = $2 where id = $1`, [company.id, lockedBefore]).catch(() => undefined);
  if (timings.length) {
    const w = Math.max(...timings.map((t) => t.label.length));
    const sorted = timings.map((t) => t.ms).sort((a, b) => a - b);
    console.log("\nAction timings (click → visible result)");
    for (const t of timings) console.log(`  ${t.label.padEnd(w)}  ${String(t.ms).padStart(6)} ms${t.ms > 1500 ? "  ⚠ over 1500 ms" : ""}`);
    console.log(`  ${timings.length} actions · median ${sorted[Math.floor(sorted.length / 2)]} ms · slowest ${sorted.at(-1)} ms · ${timings.filter((t) => t.ms > 1500).length} over 1500 ms`);
  }
  if (problems.length) {
    console.log("\nPage errors:\n" + problems.join("\n"));
    if (passed) console.log("\n✗ FAILED: page errors");
    process.exitCode = 1;
  } else if (passed) console.log("\nALL STEPS PASSED");
  await browser.close();
  await db.end();
}
