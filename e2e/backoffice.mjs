// End-to-end test of the store back office (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://…/hh_dev node e2e/backoffice.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Signs in as the PTA01 manager and drives every back-office server action through the UI:
// sidebar Menu board link → members (join with the deals question + interests, consent, age check) →
// patient register (add/revoke an authorisation, register CSV) → events → expenses → inventory (CSV
// export, stock levels) → adjustments → batches (recall write-off) → stock takes (start, save, approve,
// cancel) → purchasing (builder draft → submit → HQ approves and ships → received one short; a second
// order cancelled) → network trading (buy another store's listing → they accept and ship → receive; list
// and close our own) → online orders (collect handover, courier with merch shipped, cancel) → a trade (business
// account) click & collect order: pick → ready → hand over with ID + collection code → marketing
// (promotion create/edit/end; campaigns to a tier and to an "Into …" interest audience, CPA send window,
// cancel) → pricing (shelf price, category bulk change) → settings (hours, till revoke) → statement email →
// team (add, PIN, own member card, deactivate/reactivate) → banking (deposit with its slip) → an alert about the
// manager hidden from them → HQ updates → scope check, then the owner's consolidated view, store switching, dispenser
// rights, checking the deposit (slip, query, verify), working the alert, and approving commission. Every action is timed from the submit click to its visible result
// (table at the end). Re-runnable: everything it creates carries a run suffix and is cleaned up or reversed
// at the end; the new member and the sales, deliveries and messages it posts stay, like real trading records.
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-backoffice";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const CODE = "PTA01";
const MANAGER = "manager.pta01@herbalholland.co.za";
const OWNER = "thabo@mokoenaretail.co.za";
const HQ = "hq@herbalholland.co.za";
const run = Date.now().toString(36).slice(-5).toUpperCase(); // suffix on everything this run creates

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`[${who}] pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000); // a dev server compiles a route on its first visit (can take a minute)
  return { ctx, page };
}
const signIn = (page, email, next) => page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
// Controlled inputs and client forms only work once React has hydrated them (a value typed earlier is lost), so after
// a full page load wait until React has attached its props to the first element the test touches.
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
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const status = (scope, text) => scope.getByRole("status").filter({ hasText: text }).first();
const alert = (scope, text) => scope.getByRole("alert").filter({ hasText: text }).first();
const row = (scope, text) => scope.getByRole("row").filter({ hasText: text });
const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
const daysFromNow = (n) => dayKey(new Date(Date.now() + n * 86_400_000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls until fn returns something truthy (or gives up and returns null) — for emails sent after an action returns. */
async function until(fn, ms = 20_000, every = 150) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

// ── Timing: click → visible result. For a server-action form we also wait for the action's
// response, so a notice with the same text left over from an earlier submit can't stop the clock.
const timings = [];
const isAction = (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"];
async function act(page, label, trigger, done, { action = true } = {}) {
  const resp = action ? page.waitForResponse(isAction, { timeout: 90_000 }) : null;
  resp?.catch(() => undefined);
  const t0 = performance.now();
  await trigger();
  if (resp) await resp;
  await done();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  console.log(`    ⏱ ${label}: ${ms} ms`);
  return ms;
}

// ── Test data helpers ──
const luhnOk = (d) => { let t = 0; for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; } t += x; } return t % 10 === 0; };
function saId(yymmdd) {
  const base = `${yymmdd}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}08`;
  return [...Array(10).keys()].map((z) => base + z).find(luhnOk);
}
function parseCsv(text) {
  const rows = [];
  let cells = [], cell = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") cells.push(cell), (cell = "");
    else if (ch === "\n") cells.push(cell), rows.push(cells), (cells = []), (cell = "");
    else if (ch !== "\r") cell += ch;
  }
  if (cell || cells.length) cells.push(cell), rows.push(cells);
  return rows;
}
const audits = async (action, actorId, since) => (await one(`select count(*)::int n from "AuditLog" where action = $1 and "actorId" = $2 and at >= $3`, [action, actorId, since])).n;

// Cleanup runs in reverse, whatever happened; each entry restores or removes something this run made.
const cleanup = [];
const later = (label, fn) => cleanup.push({ label, fn });

const mgr = await session("manager");
const page = mgr.page;
let hq = null, owner = null, seller = null;
let passed = false;
let t0 = new Date();

try {
  const store = await one(
    `select s.id, s.code, s.name, s.slug, s."companyId", s."dcId", s."regionId", s.phone, s.email, s.whatsapp, s.hours, s."clickCollect", s."sameDay",
            c.email as "companyEmail", c."vatNumber", dc.name as "dcName"
     from "Store" s join "Company" c on c.id = s."companyId" left join "Store" dc on dc.id = s."dcId" where s.code = $1`,
    [CODE],
  );
  const me = await one(`select id, name from "User" where email = $1`, [MANAGER]);
  const RELEASED = (storeParam) => `(select coalesce(sum(sl."onHand"), 0) from "StockLevel" sl join "Batch" b on b.id = sl."batchId" where sl."storeId" = ${storeParam} and sl."variantId" = v.id and b.status = 'RELEASED')::int`;
  const ranged = (where, params = [], order = "p.name, v.sku") =>
    one(
      `select v.id, v.sku, v.name as variant, p.name as product, p.name || ' · ' || v.name as label, v."priceCents", v."wholesaleCents", c.slug as cat, c.name as "catName",
              sv."reorderPoint", sv."parLevel", sv."priceCents" as shelf, ${RELEASED("$1")} as "onHand"
       from "Variant" v join "Product" p on p.id = v."productId" join "Category" c on c.id = p."categoryId"
       join "StoreVariant" sv on sv."variantId" = v.id and sv."storeId" = $1
       where v.active and p.status = 'ACTIVE' and v."podSku" is null and ${where} order by ${order} limit 1`,
      [store.id, ...params],
    );

  // ───────────────────────────────────────────────────────────────────────────
  step(`Sign in as the ${CODE} manager → store overview; the Menu board link opens the TV menu`);
  await signIn(page, MANAGER, `/store/${CODE}`);
  await page.waitForURL(`${BASE}/store/${CODE}`);
  await page.getByRole("heading", { level: 1, name: new RegExp(`, ${esc(me.name.split(" ")[0])}$`) }).waitFor();
  ok(`${me.name} lands on the ${store.name} overview`);
  const menuLink = page.getByRole("link", { name: "Menu board" });
  assert((await menuLink.getAttribute("href")) === `/menu/${store.slug}` && (await menuLink.getAttribute("target")) === "_blank", `sidebar “Menu board” → /menu/${store.slug} in a new tab`);
  const [tv] = await Promise.all([mgr.ctx.waitForEvent("page"), menuLink.click()]);
  await tv.waitForLoadState("domcontentloaded");
  await tv.getByText(store.name).first().waitFor();
  assert(new URL(tv.url()).pathname === `/menu/${store.slug}`, `menu board for ${store.name} renders`);
  await shot(tv, "menu-board");
  await tv.close();

  // ───────────────────────────────────────────────────────────────────────────
  step("Today: the manager's prioritised list on the overview matches the store's open work");
  const todayCard = page.getByTestId("today-list");
  await todayCard.waitFor();
  const todayRows = todayCard.getByRole("listitem");
  const todayCount = await todayRows.count();
  const openOrders = (await one(`select count(*)::int n from "Order" where "storeId" = $1 and status in ('PLACED', 'PICKING', 'READY')`, [store.id])).n;
  const pendingAcks = (
    await one(
      `select count(*)::int n from "Announcement" a where a."requiresAck" and a.audience in ('ALL', 'format:' || (select format from "Store" where id = $1), 'region:' || (select r.code from "Region" r join "Store" s on s."regionId" = r.id where s.id = $1))
         and not exists (select 1 from "AnnouncementAck" k where k."announcementId" = a.id and k."storeId" = $1)`,
      [store.id],
    )
  ).n;
  if (todayCount === 0) assert(await todayCard.getByText("All clear").isVisible(), "nothing to do: the list says All clear");
  else {
    const text = await todayCard.innerText();
    const orderRow = todayRows.filter({ hasText: /online orders? to fulfil/ });
    assert((await orderRow.count()) === (openOrders ? 1 : 0), openOrders ? `${openOrders} open online orders → one row (${(await orderRow.innerText()).split("\n")[0]})` : "no open orders → no orders row");
    if (openOrders) assert((await orderRow.getAttribute("href")) === null && (await orderRow.locator("a").getAttribute("href")) === `/store/${CODE}/orders`, "the orders row links to Online orders");
    assert(((await todayRows.filter({ hasText: /HQ updates? to acknowledge/ }).count()) === 1) === pendingAcks > 0, pendingAcks ? `${pendingAcks} HQ updates to acknowledge → one row` : "no updates → no HQ row");
    const labels = (text.match(/\b(NOW|TODAY|SOON)\b/g) ?? []).map((l) => ["NOW", "TODAY", "SOON"].indexOf(l));
    assert(labels.length === todayCount && labels.every((l, i) => i === 0 || l >= labels[i - 1]), `${todayCount} rows, most urgent first (${labels.map((l) => ["now", "today", "soon"][l]).join(" › ")})`);
  }
  await shot(page, "today-list");

  // ───────────────────────────────────────────────────────────────────────────
  step("Members: enrol a walk-in adult (deals question + interests, key terms)");
  await visit(page, `/store/${CODE}/customers`, page.getByRole("button", { name: "Add member" }));
  await page.getByRole("button", { name: "Add member" }).click();
  const addDlg = page.getByRole("dialog", { name: "Add a member" });
  const phone = `07${Math.floor(10000000 + Math.random() * 89999999)}`;
  const phoneE164 = `+27${phone.slice(1)}`;
  const memberEmail = `e2e.backoffice.${run.toLowerCase()}@example.co.za`;
  const memberName = `E2E Member ${run}`;
  await addDlg.getByLabel("First name").fill("E2E");
  await addDlg.getByLabel("Last name").fill(`Member ${run}`);
  await addDlg.getByLabel("Mobile number").fill(phone);
  await addDlg.getByLabel("Email (optional)").fill(memberEmail);
  await addDlg.getByLabel(/seen an ID document/).check();
  await addDlg.getByLabel(/^Date of birth/).fill("1991-04-12");
  await addDlg.getByLabel(/has read the key terms/).check();
  await act(page, "addMember · deals question unanswered", () => addDlg.getByRole("button", { name: "Enrol member" }).click(), () => alert(addDlg, "Ask whether they want member deals").waitFor());
  ok("the deals question has to be asked — the answer is the consent record");
  await addDlg.getByLabel("Yes, send deals").check();
  await addDlg.getByLabel("CBD & wellness").check();
  await addDlg.getByLabel("Events & drops").check();
  await shot(page, "add-member");
  await act(page, "addMember", () => addDlg.getByRole("button", { name: "Enrol member" }).click(), () => page.waitForURL(/\/customers\/[^/?]+$/));
  await page.getByRole("heading", { level: 1, name: new RegExp(memberName) }).waitFor();
  const member = await one(
    `select id, "memberNo", "homeStoreId", "consentSms", "consentEmail", "consentWhatsapp", interests::text[] as interests, "ageCheck", source, "termsVersion", "termsAcceptedAt", to_char(dob, 'YYYY-MM-DD') as dob
     from "Customer" where phone = $1`,
    [phoneE164],
  );
  assert(member?.homeStoreId === store.id && member.source === "ADMIN" && member.termsVersion && member.termsAcceptedAt, `member ${member?.memberNo} joined at ${store.name}, terms ${member?.termsVersion} accepted`);
  assert(member.consentSms && member.consentEmail && !member.consentWhatsapp && member.interests.includes("CBD") && member.interests.includes("EVENTS"), "said yes to deals (SMS + email), into CBD and events");
  const asked = await one(`select wording from "ConsentEvent" where "customerId" = $1 and channel = 'SMS' and granted`, [member.id]);
  assert(/^Asked in store/.test(asked?.wording ?? ""), "the question asked is on the consent ledger");
  assert(member.ageCheck === "ID_SIGHTED" && member.dob === "1991-04-12", "ID sighted, date of birth from the document recorded");

  step("Members: consent changes (SMS off, then on again) and an SA ID age check");
  await act(page, "changeConsent · SMS off", () => page.getByTitle("Record opt-out of SMS").click(), () => status(page, "SMS marketing switched off").waitFor());
  let c = await one(`select "consentSms" from "Customer" where id = $1`, [member.id]);
  let ev = await one(`select granted, source from "ConsentEvent" where "customerId" = $1 and channel = 'SMS' order by "createdAt" desc limit 1`, [member.id]);
  assert(!c.consentSms && ev.granted === false && ev.source === "ADMIN", "SMS opt-out recorded (consent ledger: withdrawn, admin)");
  await act(page, "changeConsent · SMS on", () => page.getByTitle("Record opt-in to SMS").click(), () => status(page, "SMS marketing switched on").waitFor());
  c = await one(`select "consentSms" from "Customer" where id = $1`, [member.id]);
  assert(c.consentSms, "SMS opt-in recorded again");
  const ageForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Record age check" }) });
  const goodId = saId("910412");
  const badId = goodId.slice(0, 12) + ((+goodId[12] + 1) % 10);
  await ageForm.getByLabel("Record a check").selectOption("ID_NUMBER");
  await ageForm.getByLabel(/^SA ID number/).fill(badId);
  await act(page, "checkAge · bad check digit", () => ageForm.getByRole("button", { name: "Record age check" }).click(), () => alert(ageForm, "Check digit does not match").waitFor());
  ok("a mistyped ID number is caught");
  await ageForm.getByLabel(/^SA ID number/).fill(goodId);
  await act(page, "checkAge", () => ageForm.getByRole("button", { name: "Record age check" }).click(), () => status(ageForm, "ID number validated").waitFor());
  c = await one(`select "ageCheck", "idLast4" from "Customer" where id = $1`, [member.id]);
  assert(c.ageCheck === "ID_NUMBER" && c.idLast4 === goodId.slice(-4), `age check by SA ID number recorded (••••${c.idLast4})`);
  await shot(page, "member");

  // ───────────────────────────────────────────────────────────────────────────
  step("Patient register: add a SAHPRA authorisation from the member page, then revoke it");
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await page.waitForURL(/\/patients\?member=/);
  const authDlg = page.getByRole("dialog", { name: "Add an authorisation" });
  assert((await authDlg.getByLabel("Member number or mobile").inputValue()) === member.memberNo, "the drawer opens with the member number filled in");
  const authNo = `S21/2026/E2E${run}`;
  await authDlg.getByLabel("SAHPRA authorisation number").fill(authNo);
  await authDlg.getByLabel("Prescriber", { exact: true }).fill("Dr N. Dube");
  await authDlg.getByLabel("HPCSA reg. no.").fill("MP0123456");
  await authDlg.getByLabel("Valid to").fill(daysFromNow(180));
  later("revoke the test authorisation", () => q(`update "PatientAuth" set status = 'REVOKED' where "authNumber" = $1 and status = 'ACTIVE'`, [authNo]));
  await act(page, "addAuthorisation", () => authDlg.getByRole("button", { name: "Add authorisation" }).click(), () => status(authDlg, `Authorisation ${authNo} added`).waitFor());
  const auth = await one(`select id, status, "monthlyLimitGrams", "prescriberRegNo" from "PatientAuth" where "customerId" = $1 and "authNumber" = $2`, [member.id, authNo]);
  assert(auth?.status === "ACTIVE" && auth.monthlyLimitGrams === 30 && auth.prescriberRegNo === "MP0123456", `authorisation ${authNo} on file (30 g / month)`);
  await authDlg.getByRole("button", { name: "Close" }).click();
  await page.getByRole("searchbox").fill(member.memberNo);
  await page.getByRole("searchbox").press("Enter");
  await page.waitForURL(/[?&]q=/); // the search box is a plain GET form: a full page load
  await hydrated(row(page, authNo).getByRole("button", { name: "Revoke" }));
  await row(page, authNo).getByRole("button", { name: "Revoke" }).click();
  const revoke = page.getByRole("group", { name: `Revoke ${authNo}?` });
  await revoke.getByLabel("Reason").fill("E2E: prescriber withdrew it");
  await shot(page, "revoke-authorisation");
  await act(page, "revokeAuthorisation", () => revoke.getByRole("button", { name: "Revoke authorisation" }).click(), () => row(page, authNo).waitFor({ state: "detached" }));
  assert((await one(`select status from "PatientAuth" where id = $1`, [auth.id])).status === "REVOKED", "authorisation revoked (off the active list)");
  await page.getByRole("link", { name: "Dispensing register", exact: true }).click();
  await page.waitForURL(/tab=register/);
  t0 = new Date();
  const [reg] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  const regCsv = parseCsv(readFileSync(await reg.path(), "utf8"));
  await sleep(1500);
  const regExports = await audits("patients.register_export", me.id, t0);
  assert(regCsv[0][0] === "Date" && regCsv.at(-1)[0] === "Total" && regExports === 1, `dispensing register CSV (${regCsv.length - 2} lines), exported once per click`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Events: create a members' evening, change its capacity, delete it");
  await visit(page, `/store/${CODE}/events`, page.getByRole("button", { name: "New event" }));
  await page.getByRole("button", { name: "New event" }).click();
  const evDlg = page.getByRole("dialog", { name: "New event" });
  const evTitle = `E2E members evening ${run}`;
  await evDlg.getByLabel("Title").fill(evTitle);
  await evDlg.getByLabel("What's on").fill("Meet the team and see what's new on the shelves. Adults 18+, ID at the door.");
  await evDlg.getByLabel("Capacity").fill("30");
  later("delete the test event", () => q(`delete from "StoreEvent" where title = $1 and "storeId" = $2`, [evTitle, store.id]));
  await act(page, "saveStoreEvent · create", () => evDlg.getByRole("button", { name: "Create event" }).click(), () => status(page, `“${evTitle}” is on for`).waitFor());
  const event = await one(`select id, slug, capacity, "storeId" from "StoreEvent" where title = $1`, [evTitle]);
  assert(event?.storeId === store.id && event.capacity === 30 && page.url().includes(`/events/${event.id}`), `event /events/${event?.slug} created at ${store.name}`);
  await page.getByLabel("Capacity").fill("40");
  await act(page, "saveStoreEvent · edit", () => page.getByRole("button", { name: "Save event" }).click(), () => status(page, "Event saved.").waitFor());
  assert((await one(`select capacity from "StoreEvent" where id = $1`, [event.id])).capacity === 40, "capacity changed to 40");
  await page.getByRole("button", { name: "Delete event" }).click();
  await act(page, "deleteStoreEvent", () => page.getByRole("group", { name: `Delete “${evTitle}”?` }).getByRole("button", { name: "Delete event" }).click(), () => status(page, `“${evTitle}” deleted.`).waitFor());
  assert(!(await one(`select 1 from "StoreEvent" where id = $1`, [event.id])) && new URL(page.url()).pathname === `/store/${CODE}/events`, "event deleted, back on the events list");

  // ───────────────────────────────────────────────────────────────────────────
  step("Expenses: capture a supplier invoice (VAT claimable), then remove it");
  await visit(page, `/store/${CODE}/expenses`, page.locator("#ex-desc"));
  const exDesc = `E2E till rolls ${run}`;
  await page.locator("#ex-cat").selectOption("SUPPLIES");
  await page.locator("#ex-desc").fill(exDesc);
  await page.locator("#ex-sup").fill("Waltons Hatfield");
  await page.locator("#ex-amt").fill("345.50");
  later("delete the test expense", () => q(`delete from "Expense" where "storeId" = $1 and description = $2`, [store.id, exDesc]));
  await act(page, "addExpense", () => page.getByRole("button", { name: "Add expense" }).click(), () => status(page, `Added R345.50 — ${exDesc}`).waitFor());
  const expense = await one(`select id, "amountCents", "vatCents", category from "Expense" where "storeId" = $1 and description = $2`, [store.id, exDesc]);
  const vat = store.vatNumber ? Math.round((34550 * 15) / 115) : 0;
  assert(expense?.amountCents === 34550 && expense.vatCents === vat && expense.category === "SUPPLIES", `R345.50 expense saved (VAT R${(vat / 100).toFixed(2)})`);
  await row(page, exDesc).waitFor();
  await row(page, exDesc).getByRole("button", { name: `Remove ${exDesc}` }).click();
  await act(page, "deleteExpense", () => page.getByRole("group", { name: "Remove this expense?" }).getByRole("button", { name: "Remove" }).click(), () => row(page, exDesc).waitFor({ state: "detached" }));
  assert(!(await one(`select 1 from "Expense" where id = $1`, [expense.id])), "expense removed");

  // ───────────────────────────────────────────────────────────────────────────
  step("Inventory: CSV export (all and filtered), stock levels on an item");
  await visit(page, `/store/${CODE}/inventory`, page.locator("#inv-cat"));
  const skuCount = async () => Number((await page.locator("tfoot").textContent()).match(/([\d,]+) SKUs?/)[1].replace(/,/g, ""));
  const exportCsv = async (label) => {
    const since = new Date();
    const t0 = performance.now();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
    const rows = parseCsv(readFileSync(await dl.path(), "utf8"));
    const ms = Math.round(performance.now() - t0);
    timings.push({ label, ms });
    console.log(`    ⏱ ${label}: ${ms} ms`);
    await sleep(1500);
    return { rows, name: dl.suggestedFilename(), exports: await audits("inventory.export", me.id, since) };
  };
  let skus = await skuCount();
  let csv = await exportCsv("inventory CSV export (all)");
  let body = csv.rows.slice(1, -1);
  assert(csv.rows[0][0] === "SKU" && csv.rows.at(-1)[0] === "Total" && body.length === skus, `${csv.name}: ${body.length} SKUs, same as the list`);
  assert(csv.exports === 1, `one export per click (audit log: ${csv.exports})`);
  const catCol = csv.rows[0].indexOf("Category");
  const exportCat = body.map((r) => r[catCol]).find(Boolean);
  const exportSlug = await page.locator("#inv-cat option").filter({ hasText: exportCat }).first().getAttribute("value");
  await page.locator("#inv-cat").selectOption(exportSlug);
  await page.waitForURL(new RegExp(`cat=${exportSlug}`));
  skus = await skuCount();
  csv = await exportCsv("inventory CSV export (category)");
  body = csv.rows.slice(1, -1);
  assert(body.length === skus && body.every((r) => r[catCol] === exportCat), `filtered export: ${body.length} ${exportCat} SKUs only`);

  const lv = await ranged(`p."regClass" = 'ACCESSORY'`);
  await visit(page, `/store/${CODE}/inventory/${lv.id}`, page.locator("#reorderPoint"));
  await page.locator("#reorderPoint").fill(String(lv.reorderPoint + 1));
  await page.locator("#parLevel").fill(String(lv.reorderPoint));
  await act(page, "saveLevels · par below reorder", () => page.getByRole("button", { name: "Save levels" }).click(), () => alert(page, "Par level must be at least the reorder point").waitFor());
  later("restore stock levels", () => q(`update "StoreVariant" set "reorderPoint" = $3, "parLevel" = $4 where "storeId" = $1 and "variantId" = $2`, [store.id, lv.id, lv.reorderPoint, lv.parLevel]));
  await page.locator("#parLevel").fill(String(lv.parLevel + 3));
  await act(page, "saveLevels", () => page.getByRole("button", { name: "Save levels" }).click(), () => status(page, "Stock levels saved.").waitFor());
  let sv = await one(`select "reorderPoint", "parLevel" from "StoreVariant" where "storeId" = $1 and "variantId" = $2`, [store.id, lv.id]);
  assert(sv.reorderPoint === lv.reorderPoint + 1 && sv.parLevel === lv.parLevel + 3, `${lv.sku}: reorder ${sv.reorderPoint}, par ${sv.parLevel}`);
  await page.locator("#reorderPoint").fill(String(lv.reorderPoint));
  await page.locator("#parLevel").fill(String(lv.parLevel));
  await act(page, "saveLevels · restore", () => page.getByRole("button", { name: "Save levels" }).click(), () => status(page, "Stock levels saved.").waitFor());
  sv = await one(`select "reorderPoint", "parLevel" from "StoreVariant" where "storeId" = $1 and "variantId" = $2`, [store.id, lv.id]);
  assert(sv.reorderPoint === lv.reorderPoint && sv.parLevel === lv.parLevel, "levels restored");

  // ───────────────────────────────────────────────────────────────────────────
  step("Adjustments: write off a damaged unit, then book it back with a correction");
  const lotOf = (variantId, batchId) => one(`select "onHand" from "StockLevel" where "storeId" = $1 and "variantId" = $2 and "batchId" = $3`, [store.id, variantId, batchId]);
  const adj = await one(
    `select sl."variantId", b.id as "batchId", b.code, sl."onHand", v.sku, p.name || ' · ' || v.name as label
     from "StockLevel" sl join "Batch" b on b.id = sl."batchId" join "Variant" v on v.id = sl."variantId" join "Product" p on p.id = v."productId"
     join "StoreVariant" sv on sv."storeId" = sl."storeId" and sv."variantId" = sl."variantId"
     where sl."storeId" = $1 and b.status = 'RELEASED' and sl."onHand" >= 3 and p."regClass" in ('ACCESSORY', 'GROW', 'CBD') and v.active and p.status = 'ACTIVE'
     order by p.name, b.code limit 1`,
    [store.id],
  );
  const adjForm = page.locator("form").filter({ has: page.getByRole("button", { name: /^(Write off|Book in)/ }) });
  await visit(page, `/store/${CODE}/adjustments`, adjForm);
  const adjust = async (label, { sku, reason, batch, qty, add, note }, done) => {
    const item = adjForm.getByRole("combobox", { name: "Item" });
    if (await item.count()) {
      await item.fill(sku);
      await item.press("Enter");
    }
    await adjForm.getByText(`${sku} ·`).waitFor();
    await adjForm.getByLabel("Reason").selectOption(reason);
    if (add != null) await adjForm.getByRole("radio", { name: add ? "+ Add" : "− Remove" }).click();
    await adjForm.getByRole("radio", { name: new RegExp(esc(batch)) }).check();
    await adjForm.getByLabel("Quantity").fill(String(qty));
    if (note) await adjForm.getByLabel(/^(Note|What happened)/).fill(note);
    await act(page, label, () => adjForm.getByRole("button", { name: /^(Write off|Book in) \d+$/ }).click(), done);
  };
  later("put back the damaged unit", async () => {
    const now = (await lotOf(adj.variantId, adj.batchId)).onHand;
    if (now !== adj.onHand) await q(`update "StockLevel" set "onHand" = $4 where "storeId" = $1 and "variantId" = $2 and "batchId" = $3`, [store.id, adj.variantId, adj.batchId, adj.onHand]);
  });
  t0 = new Date();
  await adjust("postAdjustment · damaged −1", { sku: adj.sku, reason: "DAMAGED", batch: adj.code, qty: 1 }, () => status(page, `Wrote off 1 × ${adj.label} (damaged, batch ${adj.code})`).waitFor());
  let mv = await one(`select qty, reason, type from "StockMovement" where "storeId" = $1 and "batchId" = $2 and "createdAt" >= $3 order by "createdAt" desc limit 1`, [store.id, adj.batchId, t0]);
  assert(mv?.qty === -1 && mv.reason === "DAMAGED" && mv.type === "ADJUST" && (await lotOf(adj.variantId, adj.batchId)).onHand === adj.onHand - 1, `${adj.sku} batch ${adj.code}: −1 damaged on the ledger`);
  await adjust("postAdjustment · correction +1", { sku: adj.sku, reason: "CORRECTION", add: true, batch: adj.code, qty: 1, note: `E2E ${run}: reverse the damaged write-off` }, () => status(page, `Booked in 1 × ${adj.label} (correction, batch ${adj.code})`).waitFor());
  assert((await lotOf(adj.variantId, adj.batchId)).onHand === adj.onHand, "correction booked the unit back (net zero)");

  // ───────────────────────────────────────────────────────────────────────────
  step("Batches: stock found in a recalled/quarantined batch is written off as a recall return");
  const blocked = await one(
    `select b.id, b.code, b.status, v.id as "variantId", v.sku, p.name || ' · ' || v.name as label
     from "Batch" b join "Variant" v on v.id = b."variantId" join "Product" p on p.id = v."productId"
     join "StoreVariant" sv on sv."variantId" = v.id and sv."storeId" = $1
     where b.status <> 'RELEASED' and v.active
       and not exists (select 1 from "StockLevel" sl where sl."storeId" = $1 and sl."batchId" = b.id and sl."onHand" <> 0)
     order by (b.status = 'RECALLED') desc, b.code limit 1`,
    [store.id],
  );
  if (!blocked) fail(`no recalled or quarantined batch (of an item ${CODE} ranges, none of it held there) to test the write-off with`);
  later("clear the found units", () => q(`update "StockLevel" set "onHand" = 0 where "storeId" = $1 and "variantId" = $2 and "batchId" = $3`, [store.id, blocked.variantId, blocked.id]));
  await visit(page, `/store/${CODE}/adjustments?variant=${blocked.variantId}`, adjForm);
  await adjust("postAdjustment · found +2 (blocked batch)", { sku: blocked.sku, reason: "FOUND", batch: blocked.code, qty: 2 }, () => status(page, `Booked in 2 × ${blocked.label} (found, batch ${blocked.code})`).waitFor());
  assert((await lotOf(blocked.variantId, blocked.id)).onHand === 2, `2 units found in ${blocked.status.toLowerCase()} batch ${blocked.code}`);
  await visit(page, `/store/${CODE}/batches?view=blocked&q=${blocked.code}`, row(page, blocked.code).getByRole("button", { name: "Write off" }));
  await row(page, blocked.code).getByRole("button", { name: "Write off" }).click();
  const wo = page.getByRole("group", { name: `Write off all 2 units of ${blocked.code}?` });
  await wo.getByLabel(/Destroyed on site/).check();
  await act(page, "writeOffLot · destroy without witness", () => wo.getByRole("button", { name: "Write off lot" }).click(), () => alert(wo, "Destruction needs a witness").waitFor());
  ok("destruction needs a witness");
  await wo.getByRole("radio", { name: /^Return to/ }).check(); // getByLabel(regex) sees the label's raw text (leading space)
  await wo.getByLabel("Note").fill(`E2E ${run} waybill`);
  await shot(page, "write-off-lot");
  await act(page, "writeOffLot · recall return", () => wo.getByRole("button", { name: "Write off lot" }).click(), () => row(page, blocked.code).waitFor({ state: "detached" }));
  mv = await one(`select qty, reason, note from "StockMovement" where "storeId" = $1 and "batchId" = $2 order by "createdAt" desc limit 1`, [store.id, blocked.id]);
  assert(mv.qty === -2 && mv.reason === "RECALL" && /^Recall return to/.test(mv.note) && (await lotOf(blocked.variantId, blocked.id)).onHand === 0, `lot written off as a recall return to ${store.dcName}`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Stock takes: blind cycle count → save counts → approve; a second count cancelled");
  const open = await q(`select scope from "StockTake" where "storeId" = $1 and status = 'COUNTING'`, [store.id]);
  if (open.some((o) => o.scope === "FULL")) fail("a full count is open at the store — can't start a cycle count");
  const cats = await q(
    `select c.slug, c.name, count(sl.id)::int as lines from "Category" c join "Product" p on p."categoryId" = c.id join "Variant" v on v."productId" = p.id
     join "StockLevel" sl on sl."variantId" = v.id and sl."storeId" = $1 and (sl."onHand" <> 0 or exists (select 1 from "StoreVariant" sv where sv."storeId" = sl."storeId" and sv."variantId" = sl."variantId"))
     where not (c.slug = any($2::text[])) group by c.slug, c.name having count(sl.id) > 0 and bool_and(sl."onHand" >= 0) order by count(sl.id), c.slug limit 2`,
    [store.id, open.map((o) => o.scope)],
  );
  if (cats.length < 2) fail("need two categories free to count");
  const startCount = async (cat, label) => {
    await visit(page, `/store/${CODE}/stock-takes/new`, page.getByRole("radio", { name: /Cycle count/ }));
    await page.getByRole("radio", { name: /Cycle count/ }).check();
    await page.getByRole("radio", { name: new RegExp(`^${esc(cat.name)}`) }).check();
    await page.locator("#notes").fill(`E2E ${run}: ${cat.name}`);
    await act(page, label, () => page.getByRole("button", { name: "Start counting" }).click(), () => page.waitForURL(/\/stock-takes\/[^/?]+$/));
    const take = await one(`select id, number, blind, status, (select count(*)::int from "StockTakeLine" l where l."stockTakeId" = t.id) as lines from "StockTake" t where "storeId" = $1 and notes = $2`, [store.id, `E2E ${run}: ${cat.name}`]);
    later(`close stock take ${take.number}`, () => q(`update "StockTake" set status = 'CANCELLED' where id = $1 and status = 'COUNTING'`, [take.id]));
    return take;
  };
  const take = await startCount(cats[0], "startTake");
  assert(take?.status === "COUNTING" && take.blind && take.lines === cats[0].lines, `${take.number}: blind ${cats[0].name} count, ${take.lines} lines`);
  await page.getByRole("heading", { level: 1, name: new RegExp(take.number) }).waitFor();
  const lines = await q(
    `select l.id, l."expectedQty", l."variantId", l."batchId", p.name as product, v.name as variant, b.code from "StockTakeLine" l
     join "Variant" v on v.id = l."variantId" join "Product" p on p.id = v."productId" join "Batch" b on b.id = l."batchId"
     where l."stockTakeId" = $1 order by p.name, v.name, b.code limit 2`,
    [take.id],
  );
  const counts = lines.map((l, i) => ({ ...l, qty: l.expectedQty + (i === 0 ? 1 : 0) })); // one unit found on the first line
  const found = counts[0];
  for (const l of counts) await page.getByLabel(`Count for ${l.product} ${l.variant}, batch ${l.code}`, { exact: true }).fill(String(l.qty));
  const saveBtn = page.getByRole("button", { name: "Save", exact: true });
  if (await saveBtn.isEnabled()) await act(page, "saveCounts", () => saveBtn.click(), () => page.getByText(/Saved \d{2}:\d{2}:\d{2}/).waitFor());
  else await page.getByText(/Saved \d{2}:\d{2}:\d{2}/).waitFor(); // autosave beat the click
  const saved = await q(`select id, "countedQty" from "StockTakeLine" where "stockTakeId" = $1 and "countedQty" is not null`, [take.id]);
  assert(saved.length === counts.length && counts.every((l) => saved.find((s) => s.id === l.id)?.countedQty === l.qty), `${saved.length} counts saved`);
  await page.getByRole("button", { name: "Review & approve" }).click();
  await page.waitForURL(/step=review/);
  await shot(page, "stock-take-review");
  await page.getByRole("button", { name: `Approve ${take.number}` }).click();
  await act(page, "approveTake", () => page.getByRole("button", { name: "Approve & post variances" }).click(), () => page.getByRole("heading", { level: 1, name: /Approved/ }).waitFor());
  const approved = await one(`select status, "approvedById" from "StockTake" where id = $1`, [take.id]);
  mv = await one(`select qty, type, reason from "StockMovement" where "stockTakeId" = $1`, [take.id]);
  assert(approved.status === "APPROVED" && approved.approvedById === me.id && mv?.qty === 1 && mv.type === "COUNT" && mv.reason === "FOUND", `${take.number} approved: +1 found posted as a stock-take movement`);
  later("remove the unit found in the count", async () => {
    const l = await lotOf(found.variantId, found.batchId);
    if (l && l.onHand > found.expectedQty) await q(`update "StockLevel" set "onHand" = "onHand" - 1 where "storeId" = $1 and "variantId" = $2 and "batchId" = $3`, [store.id, found.variantId, found.batchId]);
  });
  await visit(page, `/store/${CODE}/adjustments?variant=${found.variantId}`, adjForm);
  const foundSku = (await one(`select sku from "Variant" where id = $1`, [found.variantId])).sku;
  await adjust("postAdjustment · correction −1", { sku: foundSku, reason: "CORRECTION", add: false, batch: found.code, qty: 1, note: `E2E ${run}: reverse the stock-take find` }, () => status(page, `Wrote off 1 × ${found.product} · ${found.variant} (correction, batch ${found.code})`).waitFor());
  cleanup.pop();
  ok("count variance reversed with a correction");
  const take2 = await startCount(cats[1], "startTake (second category)");
  await page.getByRole("button", { name: "Cancel count" }).click();
  await act(page, "cancelTake", () => page.getByRole("button", { name: "Yes, cancel this count" }).click(), () => status(page, "This count was cancelled").waitFor());
  assert((await one(`select status from "StockTake" where id = $1`, [take2.id])).status === "CANCELLED", `${take2.number} cancelled, nothing posted`);

  // ───────────────────────────────────────────────────────────────────────────
  step(`Purchasing: build an order from ${store.dcName}, save it as a draft, then submit it`);
  const buy = await ranged(`p."regClass" in ('ACCESSORY', 'GROW', 'CBD') and ${RELEASED("$2")} >= 5`, [store.dcId]);
  if (!buy) fail(`${store.dcName} has no accessory, grow or CBD item ${CODE} ranges with 5+ released units`);
  const builder = async (sku, qty, notes) => {
    await visit(page, `/store/${CODE}/purchasing/new`, page.getByRole("button", { name: "Clear", exact: true }));
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("tab", { name: /^All ranged/ }).click();
    await page.getByPlaceholder("Filter by name, SKU or category").fill(sku);
    await row(page, sku).getByRole("textbox").fill(String(qty));
    await page.locator("#po-notes").fill(notes);
  };
  const poByNotes = (notes) =>
    one(`select o.id, o.number, o.status, o.kind, o."sellerId", o."submittedAt", l.qty, l."variantId" from "StockOrder" o join "StockOrderLine" l on l."stockOrderId" = o.id where o."buyerId" = $1 and o.notes = $2`, [store.id, notes]);
  const poHeading = (label) => page.getByRole("heading", { level: 1, name: new RegExp(label) });
  const closeByNotes = (notes) => later(`close the test order “${notes}”`, () => q(`update "StockOrder" set status = 'CANCELLED' where "buyerId" = $1 and notes = $2 and status in ('DRAFT', 'SUBMITTED', 'APPROVED')`, [store.id, notes]));
  const wpoNotes = `E2E ${run}`;
  closeByNotes(wpoNotes);
  await builder(buy.sku, 2, wpoNotes);
  await shot(page, "order-builder");
  await act(page, "placeWholesaleOrder · save draft", () => page.getByRole("button", { name: "Save draft" }).click(), () => poHeading("Draft").waitFor());
  const wpo = await poByNotes(wpoNotes);
  assert(
    wpo?.status === "DRAFT" && !wpo.submittedAt && wpo.kind === "WHOLESALE" && wpo.sellerId === store.dcId && wpo.qty === 2 && wpo.variantId === buy.id && page.url().endsWith(`/purchasing/${wpo.id}`),
    `draft ${wpo?.number}: 2 × ${buy.sku} from ${store.dcName}, not sent yet`,
  );
  await act(page, "submitDraft", () => page.getByRole("button", { name: "Submit order" }).click(), () => poHeading("Submitted").waitFor());
  let po = await one(`select status, "submittedAt" from "StockOrder" where id = $1`, [wpo.id]);
  assert(po.status === "SUBMITTED" && po.submittedAt, `${wpo.number} submitted to ${store.dcName}`);

  step(`Purchasing: HQ approves and ships ${wpo.number} from ${store.dcName} → received one short`);
  hq = await session("hq");
  await signIn(hq.page, HQ, `/hq/distribution/${wpo.id}`);
  await hq.page.waitForURL(new RegExp(`/hq/distribution/${wpo.id}`));
  await hydrated(hq.page.getByRole("button", { name: /^(Approve order|Ship order)$/ }));
  if ((await one(`select status from "StockOrder" where id = $1`, [wpo.id])).status === "SUBMITTED")
    await act(hq.page, "HQ · approve DC order", () => hq.page.getByRole("button", { name: "Approve order" }).click(), () => status(hq.page, `${wpo.number} approved`).waitFor());
  if ((await one(`select status from "StockOrder" where id = $1`, [wpo.id])).status === "APPROVED") {
    await hq.page.getByRole("button", { name: "Ship order" }).click();
    await act(hq.page, "HQ · ship DC order", () => hq.page.getByRole("button", { name: "Confirm shipment" }).click(), () => status(hq.page, /Shipped \d+/).waitFor());
  }
  po = await one(`select status from "StockOrder" where id = $1`, [wpo.id]);
  assert(po.status === "SHIPPED", `${wpo.number} approved and shipped by the DC (HQ console)`);
  await shot(hq.page, "hq-shipped");
  await hq.ctx.close(); // one extra page at a time keeps the browser small
  hq = null;
  await page.reload();
  const recv = page.getByLabel(`Received quantity for ${buy.label}`);
  await hydrated(recv);
  assert((await recv.inputValue()) === "2", "receiving is prefilled with what was shipped");
  await recv.fill("1");
  await page.locator("#recv-note").fill(`E2E ${run}: one crushed in transit`);
  await page.getByRole("button", { name: "Receive 1 unit" }).click();
  await shot(page, "receive");
  t0 = new Date();
  // The page re-renders as Received (the receive form goes away) and says what was booked in and what was short.
  const receivedNotice = (text) => status(page, new RegExp(`^Received \\d{1,2} \\w{3} \\d{4}.* incl\\. VAT\\..*${text}`));
  await act(page, "receiveOrder · wholesale (1 short)", () => page.getByRole("button", { name: /^Confirm — book 1 unit in/ }).click(), () => receivedNotice(`1 unit short against the delivery note — recorded on the order for ${esc(store.dcName)}`).waitFor());
  po = await one(`select o.status, l."receivedQty", o.notes from "StockOrder" o join "StockOrderLine" l on l."stockOrderId" = o.id where o.id = $1`, [wpo.id]);
  const inMv = await one(`select sum(qty)::int as qty from "StockMovement" where "stockOrderId" = $1 and type = 'TRANSFER_IN'`, [wpo.id]);
  assert(po.status === "RECEIVED" && po.receivedQty === 1 && inMv.qty === 1 && /Receiving: E2E/.test(po.notes), `${wpo.number} received: 1 in stock, 1 short flagged`);
  assert((await audits("stockorder.discrepancy", me.id, t0)) === 1, "discrepancy recorded for the supplier");
  // The order is put on the supplier invoices for what was counted in, and settles on the franchise statement.
  const dcUnit = (await one(`select "unitCostCents" from "StockOrderLine" where "stockOrderId" = $1`, [wpo.id])).unitCostCents;
  const dcInv = await one(`select number, "totalCents", "vatCents", "onStatement", status, "uploadId" from "SupplierInvoice" where "stockOrderId" = $1`, [wpo.id]);
  assert(
    dcInv?.onStatement && dcInv.status === "DUE" && !dcInv.uploadId && dcInv.number === wpo.number && dcInv.vatCents === Math.round(dcUnit * 0.15) && dcInv.totalCents === dcUnit + dcInv.vatCents,
    `${wpo.number} on the supplier invoices for the 1 unit received (R${((dcInv?.totalCents ?? 0) / 100).toFixed(2)} incl. VAT), settled on the statement`,
  );
  await page.getByTestId("supplier-invoice-card").getByText("On statement").waitFor();

  step("Purchasing: a second order submitted straight from the builder, then cancelled");
  const cancelNotes = `E2E ${run} (to cancel)`;
  closeByNotes(cancelNotes);
  await builder(buy.sku, 1, cancelNotes);
  await act(page, "placeWholesaleOrder · submit", () => page.getByRole("button", { name: "Submit order" }).click(), () => poHeading("Submitted").waitFor());
  const cpo = await poByNotes(cancelNotes);
  assert(cpo?.status === "SUBMITTED" && cpo.submittedAt && cpo.qty === 1, `${cpo?.number} submitted to ${store.dcName} straight away`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await act(page, "cancelOrder", () => page.getByRole("button", { name: "Yes, cancel it" }).click(), () => poHeading("Cancelled").waitFor());
  assert((await one(`select status from "StockOrder" where id = $1`, [cpo.id])).status === "CANCELLED", `${cpo.number} cancelled before the DC acted on it`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Network trading: another store lists 2 surplus units → we buy them in two orders → they decline one (the unit goes back on the listing) and ship the other → we receive it");
  // Another franchisee's store (same region first) with a manager to sign in as, and something both stores range that
  // it has spare (seeded stock levels are random, so the store and the item are chosen together).
  const pair = await one(
    `select s.id, s.code, s.name, u.email, v.id as "variantId", v.sku, p.name || ' · ' || v.name as label
     from "Store" s
     join lateral (select email from "User" u where u."storeId" = s.id and u.role = 'MANAGER' and u.active and u.email is not null order by u.email limit 1) u on true
     join "StoreVariant" sv on sv."storeId" = s.id join "StoreVariant" a on a."variantId" = sv."variantId" and a."storeId" = $1
     join "Variant" v on v.id = sv."variantId" join "Product" p on p.id = v."productId"
     where s.kind = 'RETAIL' and s.status = 'ACTIVE' and s.id <> $1 and s."companyId" <> $2
       and v.active and p.status = 'ACTIVE' and v."podSku" is null and p."regClass" in ('ACCESSORY', 'GROW', 'CBD', 'HEMP') and ${RELEASED("s.id")} >= 3
       and not exists (select 1 from "Listing" l where l."variantId" = v.id and l.active and l."storeId" in ($1, s.id))
       and v.id <> $4
     order by (s."regionId" = $3) desc, s.code, p.name, v.sku limit 1`,
    [store.id, store.companyId, store.regionId, buy.id],
  );
  if (!pair) fail("no other franchisee's store has spare stock of an item we range");
  const sellerStore = { id: pair.id, code: pair.code, name: pair.name, email: pair.email };
  const traded = { id: pair.variantId, sku: pair.sku, label: pair.label };
  seller = await session("seller");
  await signIn(seller.page, sellerStore.email, `/store/${sellerStore.code}/network?tab=mine`);
  await seller.page.waitForURL(new RegExp(`/store/${sellerStore.code}/network`));
  await hydrated(seller.page.locator("#list-item"));
  await seller.page.locator("#list-item").selectOption(traded.id);
  await seller.page.locator("#list-qty").fill("2");
  await seller.page.locator("#list-note").fill(`E2E ${run}`);
  later("close the seller's test listing", () => q(`update "Listing" set active = false where "storeId" = $1 and note = $2 and active`, [sellerStore.id, `E2E ${run}`]));
  await act(seller.page, `createListing (${sellerStore.code})`, () => seller.page.getByRole("button", { name: "List on the network" }).click(), () => status(seller.page, `Listed 2 × ${traded.label}`).waitFor());
  const listing = await one(`select id, qty, "unitCostCents" from "Listing" where "storeId" = $1 and "variantId" = $2 and active and note = $3`, [sellerStore.id, traded.id, `E2E ${run}`]);
  assert(listing?.qty === 2, `${sellerStore.name} listed 2 × ${traded.sku}`);
  const listingNow = () => one(`select qty, active from "Listing" where id = $1`, [listing.id]);
  const boughtAt = new Date();
  later("close the test network orders", () => q(`update "StockOrder" set status = 'CANCELLED' where "buyerId" = $1 and "sellerId" = $2 and kind = 'NETWORK' and "createdAt" >= $3 and status in ('SUBMITTED', 'APPROVED')`, [store.id, sellerStore.id, boughtAt]));
  const buyOne = async (label) => {
    const units = page.locator(`#buy-${listing.id}`);
    await units.fill("1");
    await act(page, label, () => page.locator("form").filter({ has: units }).getByRole("button", { name: "Buy" }).click(), () => page.waitForURL(/\/purchasing\/[^/?]+$/));
    return one(`select id, number, status, kind, "sellerId" from "StockOrder" where id = $1`, [page.url().split("/").pop()]);
  };
  await visit(page, `/store/${CODE}/network`, page.getByRole("searchbox"));
  await page.getByRole("searchbox").fill(traded.sku);
  await page.getByRole("searchbox").press("Enter");
  await page.waitForURL(/[?&]q=/);
  await hydrated(page.locator(`#buy-${listing.id}`));
  await shot(page, "marketplace");
  const npo = await buyOne("buyListing");
  assert(npo?.status === "SUBMITTED" && npo.kind === "NETWORK" && npo.sellerId === sellerStore.id, `${npo?.number} (1 unit) sent to ${sellerStore.name}`);
  let left = await listingNow();
  assert(left.active && left.qty === 1, "1 unit still listed");
  await visit(page, `/store/${CODE}/network?q=${encodeURIComponent(traded.sku)}`, page.locator(`#buy-${listing.id}`));
  const npo2 = await buyOne("buyListing (the last unit)");
  left = await listingNow();
  assert(npo2?.status === "SUBMITTED" && npo2.id !== npo.id && !left.active && left.qty === 0, `${npo2?.number} takes the last unit — the listing sold out`);
  await visit(seller.page, `/store/${sellerStore.code}/purchasing/${npo2.id}`, seller.page.getByRole("button", { name: "Decline" }));
  await seller.page.getByRole("button", { name: "Decline" }).click();
  await act(seller.page, `sellerAct · decline (${sellerStore.code})`, () => seller.page.getByRole("group", { name: `Decline ${npo2.number}?` }).getByRole("button", { name: "Decline order" }).click(), () => seller.page.getByRole("heading", { level: 1, name: /Rejected/ }).waitFor());
  left = await listingNow();
  assert((await one(`select status from "StockOrder" where id = $1`, [npo2.id])).status === "REJECTED" && left.active && left.qty === 1, `${sellerStore.name} declined ${npo2.number}: the unit is back on their listing`);
  await visit(seller.page, `/store/${sellerStore.code}/purchasing/${npo.id}`, seller.page.getByRole("button", { name: "Accept order" }));
  await act(seller.page, `sellerAct · accept (${sellerStore.code})`, () => seller.page.getByRole("button", { name: "Accept order" }).click(), () => seller.page.getByRole("button", { name: "Ship now" }).waitFor());
  await seller.page.getByRole("button", { name: "Ship now" }).click();
  await act(seller.page, `sellerAct · ship (${sellerStore.code})`, () => seller.page.getByRole("button", { name: "Ship & book out" }).click(), () => seller.page.getByRole("heading", { level: 1, name: /In transit/ }).waitFor());
  assert((await one(`select status from "StockOrder" where id = $1`, [npo.id])).status === "SHIPPED", `${sellerStore.name} accepted and shipped ${npo.number}`);
  await seller.ctx.close();
  seller = null;
  await visit(page, `/store/${CODE}/purchasing/${npo.id}`, page.getByRole("button", { name: "Receive 1 unit" }));
  await page.getByRole("button", { name: "Receive 1 unit" }).click();
  await act(page, "receiveOrder · network", () => page.getByRole("button", { name: /^Confirm — book 1 unit in/ }).click(), () => receivedNotice("").waitFor());
  po = await one(`select o.status, l."receivedQty" from "StockOrder" o join "StockOrderLine" l on l."stockOrderId" = o.id where o.id = $1`, [npo.id]);
  assert(po.status === "RECEIVED" && po.receivedQty === 1, `${npo.number} received — batch traceability travels with the unit`);
  const netInv = await one(`select "supplierName", "totalCents", "onStatement", status from "SupplierInvoice" where "stockOrderId" = $1`, [npo.id]);
  const netUnit = (await one(`select "unitCostCents" from "StockOrderLine" where "stockOrderId" = $1`, [npo.id])).unitCostCents;
  assert(
    netInv?.onStatement && netInv.status === "DUE" && netInv.supplierName === sellerStore.name && netInv.totalCents === netUnit + Math.round(netUnit * 0.15),
    `${npo.number} on our supplier invoices from ${sellerStore.name}, settled on the statement`,
  );

  step("Network trading: list our own surplus, then close the listing");
  await visit(page, `/store/${CODE}/network?tab=mine`, page.locator("#list-item"));
  const listable = await page.locator("#list-item option").evaluateAll((os) => os.map((o) => o.value));
  const liveHere = new Set((await q(`select "variantId" from "Listing" where "storeId" = $1 and active`, [store.id])).map((r) => r.variantId));
  const mineId = listable.find((id) => id && !liveHere.has(id));
  const mine = await one(`select p.name || ' · ' || v.name as label, v.sku from "Variant" v join "Product" p on p.id = v."productId" where v.id = $1`, [mineId]);
  await page.locator("#list-item").selectOption(mineId);
  await page.locator("#list-qty").fill("1");
  await page.locator("#list-note").fill(`E2E ${run}`);
  later("close our test listing", () => q(`update "Listing" set active = false where "storeId" = $1 and note = $2 and active`, [store.id, `E2E ${run}`]));
  await act(page, "createListing", () => page.getByRole("button", { name: "List on the network" }).click(), () => status(page, `Listed 1 × ${mine.label}`).waitFor());
  const myListing = await one(`select id from "Listing" where "storeId" = $1 and "variantId" = $2 and active and note = $3`, [store.id, mineId, `E2E ${run}`]);
  assert(myListing, `${mine.sku} listed on the network`);
  const myRow = row(page, mine.sku).filter({ has: page.getByText("Live", { exact: true }) }); // cell texts run together, so no \b in a hasText regex
  await myRow.getByRole("button", { name: "Close", exact: true }).click();
  await act(page, "closeListing", () => page.getByRole("group", { name: "Close this listing?" }).getByRole("button", { name: "Close listing" }).click(), () => myRow.waitFor({ state: "detached" }));
  assert(!(await one(`select active from "Listing" where id = $1`, [myListing.id])).active, "listing closed");

  // ───────────────────────────────────────────────────────────────────────────
  step("Online orders: fixtures for the new member (collect · courier with merch · to cancel)");
  const cbd = await ranged(`p."regClass" = 'CBD' and p.name <> 'Recover CBD Muscle Balm' and ${RELEASED("$1")} >= 3`);
  const acc = await ranged(`p."regClass" = 'ACCESSORY' and p.name <> 'Smell-proof Pouch' and ${RELEASED("$1")} >= 3`);
  if (!cbd || !acc) fail(`${CODE} needs 3+ released units of a CBD item and an accessory for the order fixtures`);
  const merch = await one(`select v.id, v.sku, v."priceCents", p.name || ' · ' || v.name as label from "Variant" v join "Product" p on p.id = v."productId" where v."podSku" is not null and v.active and p.status = 'ACTIVE' order by p.name limit 1`);
  const fixture = async ({ fulfilment, payMethod, paymentStatus, lines, merchSent = false }) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = `E${Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join("")}`;
    const subtotal = lines.reduce((s, l) => s + l.qty * l.priceCents, 0);
    const delivery = fulfilment === "COLLECT" ? {} : { addressLine: "12 Burnett Street", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" };
    const o = await one(
      `insert into "Order" (id, code, "customerId", "storeId", status, fulfilment, "routingNote", "addressLine", suburb, city, province, "postalCode",
         "subtotalCents", "totalCents", "vatCents", "payMethod", "paymentStatus", "paymentRef", "collectionCode", "podRef", "podStatus", events, "updatedAt")
       values (gen_random_uuid()::text, $1, $2, $3, 'PLACED', $4::"Fulfilment", 'E2E back-office fixture', $5, $6, $7, $8::"Province", $9,
         $10, $10, $18, $11::"PayMethod", $12::"PaymentStatus", $13, $14, $15, $16, $17::jsonb, now())
       returning id, code, "collectionCode"`,
      [
        code, member.id, store.id, fulfilment, delivery.addressLine ?? null, delivery.suburb ?? null, delivery.city ?? null, delivery.province ?? null, delivery.postalCode ?? null,
        subtotal, payMethod, paymentStatus, paymentStatus === "PAID" ? `E2E-PAY-${run}` : null, String(100000 + Math.floor(Math.random() * 900000)),
        merchSent ? code : null, merchSent ? "sent" : null, JSON.stringify([{ status: "PLACED", at: new Date().toISOString(), note: "E2E fixture" }]), Math.round((subtotal * 15) / 115),
      ],
    );
    for (const l of lines) await q(`insert into "OrderLine" (id, "orderId", "variantId", qty, "unitPriceCents", "totalCents") values (gen_random_uuid()::text, $1, $2, $3, $4, $5)`, [o.id, l.id, l.qty, l.priceCents, l.qty * l.priceCents]);
    later(`release order ${code}`, () => q(`update "Order" set status = 'CANCELLED' where id = $1 and status in ('PLACED', 'PICKING', 'READY')`, [o.id]));
    return { ...o, totalCents: subtotal };
  };
  const collect = await fixture({ fulfilment: "COLLECT", payMethod: "CARD", paymentStatus: "UNPAID", lines: [{ id: cbd.id, qty: 1, priceCents: cbd.priceCents }] });
  const courier = await fixture({
    fulfilment: "COURIER", payMethod: "ONLINE", paymentStatus: "PAID", merchSent: !!merch,
    lines: [{ id: acc.id, qty: 1, priceCents: acc.priceCents }, ...(merch ? [{ id: merch.id, qty: 1, priceCents: merch.priceCents }] : [])],
  });
  const toCancel = await fixture({ fulfilment: "COLLECT", payMethod: "CARD", paymentStatus: "UNPAID", lines: [{ id: acc.id, qty: 1, priceCents: acc.priceCents }] });
  ok(`orders ${collect.code} (collect, pay in store), ${courier.code} (courier${merch ? " + made-to-order merch" : ""}), ${toCancel.code} (to cancel)`);
  const heading = (status) => page.getByRole("heading", { level: 1, name: new RegExp(status) });
  const move = (label, button, next) => act(page, label, () => page.getByRole("button", { name: button }).click(), () => heading(next).waitFor());

  step(`Online orders: ${collect.code} picked → ready → handed over, paid by card`);
  await visit(page, `/store/${CODE}/orders`, page.getByRole("searchbox"));
  await page.getByRole("searchbox").fill(collect.code);
  await page.getByRole("searchbox").press("Enter");
  await row(page, collect.code).getByRole("link", { name: collect.code }).click();
  await page.waitForURL(new RegExp(`/orders/${collect.id}$`));
  await hydrated(page.getByRole("button", { name: "Start picking" }));
  await move("moveOrder · PICKING", "Start picking", "Picking");
  await move("moveOrder · READY", "Packed — ready for collection", "Ready");
  const ready = await one(`select m.body from "MessageLog" m where m."customerId" = $1 and m.body like $2 order by m."createdAt" desc limit 1`, [member.id, `%${collect.code} is ready%`]);
  assert(ready, "the member was sent their collection message");
  await page.getByRole("button", { name: "Hand over to member" }).click();
  await page.getByLabel(/I've seen the member's ID/).check();
  await page.getByLabel(/^Terminal \/ payment reference/).fill(`E2E-${run}`);
  await shot(page, "handover");
  await act(page, "moveOrder · COMPLETED (handover + card)", () => page.getByRole("button", { name: /^Complete handover/ }).click(), () => heading("Completed").waitFor());
  let o = await one(
    `select o.status, o."idChecked", o."paymentStatus", s.number, s."totalCents", p.method, p.reference from "Order" o join "Sale" s on s."orderId" = o.id join "Payment" p on p."saleId" = s.id where o.id = $1`,
    [collect.id],
  );
  assert(o?.status === "COMPLETED" && o.idChecked && o.paymentStatus === "PAID" && o.method === "CARD" && o.reference === `E2E-${run}`, `${collect.code} handed over (ID checked), sale ${o?.number} paid by card`);

  step(`Online orders: ${courier.code}${merch ? " merch shipped by the partner →" : ""} picked → dispatched → delivered`);
  await visit(page, `/store/${CODE}/orders/${courier.id}`, page.getByRole("button", { name: "Start picking" }));
  if (merch) {
    await page.locator("#merch-courier").fill("Aramex");
    await page.locator("#merch-tracking").fill(`ARX${run}`);
    await act(page, "shipMerch", () => page.getByRole("button", { name: "Merch shipped" }).click(), () => page.getByText(/^Shipped — the tracking number is in the timeline/).waitFor());
    o = await one(`select "podStatus", "podTracking" from "Order" where id = $1`, [courier.id]);
    assert(o.podStatus === "shipped" && o.podTracking === `Aramex · ARX${run}`, "merch tracking recorded and texted to the member");
  } else ok("no made-to-order merch in the catalogue — shipMerch skipped");
  await move("moveOrder · PICKING (courier)", "Start picking", "Picking");
  await move("moveOrder · READY (courier)", "Packed — ready to dispatch", "Ready");
  await page.getByRole("button", { name: "Dispatch", exact: true }).click();
  await page.getByLabel("Courier", { exact: true }).fill("The Courier Guy");
  await act(page, "moveOrder · OUT_FOR_DELIVERY", () => page.getByRole("button", { name: "Dispatch order" }).click(), () => heading("Out for delivery").waitFor());
  o = await one(`select o.status, o.courier, o."trackingNo", s.number from "Order" o join "Sale" s on s."orderId" = o.id where o.id = $1`, [courier.id]);
  assert(o?.status === "OUT_FOR_DELIVERY" && o.courier === "The Courier Guy" && /^HH/.test(o.trackingNo ?? "") && o.number, `dispatched with The Courier Guy (${o?.trackingNo}), sale ${o?.number} posted`);
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await page.getByLabel(/driver checked ID/).check();
  await act(page, "moveOrder · COMPLETED (delivered)", () => page.getByRole("button", { name: "Confirm delivery" }).click(), () => heading("Completed").waitFor());
  assert((await one(`select status from "Order" where id = $1`, [courier.id])).status === "COMPLETED", `${courier.code} delivered`);

  step(`Online orders: cancel ${toCancel.code}`);
  await visit(page, `/store/${CODE}/orders/${toCancel.id}`, page.getByRole("button", { name: "Cancel order" }));
  await page.getByRole("button", { name: "Cancel order" }).click();
  const cancelGroup = page.getByRole("group", { name: "Cancel this order?" });
  await cancelGroup.getByLabel(/^Reason/).fill("E2E: member asked to cancel");
  await act(page, "moveOrder · CANCELLED", () => cancelGroup.getByRole("button", { name: "Cancel order" }).click(), () => heading("Cancelled").waitFor());
  o = await one(`select status, events from "Order" where id = $1`, [toCancel.id]);
  assert(o.status === "CANCELLED" && o.events.at(-1).note === `Cancelled by ${me.name}: E2E: member asked to cancel`, `${toCancel.code} cancelled, reason on the timeline`);


  // ───────────────────────────────────────────────────────────────────────────
  step("Trade: a click & collect order from a business account (SQL fixture) is picked → ready (code texted) → handed over with ID and code → the WHOLESALE sale posts here");
  const tradeItem = await ranged(`p."regClass" = 'ACCESSORY' and v."wholesaleCents" > 0 and ${RELEASED("$1")} >= 6`, [], `${RELEASED("$1")} desc`);
  if (!tradeItem) fail(`${CODE} needs 6+ released units of an accessory for the trade order`);
  const tradeHandling = (await one(`select value from "Setting" where key = 'trade'`))?.value?.collectHandlingCents ?? 7500;
  const halfUp = (n) => Math.floor((n * 1500 + 5000) / 10000);
  const tQty = 4;
  const tEx = tQty * tradeItem.wholesaleCents;
  const tTotal = tEx + halfUp(tEx) + tradeHandling + halfUp(tradeHandling);
  let tNo;
  while (!tNo) {
    const c = `TA-8${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
    if (!(await one(`select 1 from "TradeAccount" where number = $1`, [c]))) tNo = c;
  }
  const tAcc = await one(
    `insert into "TradeAccount" (id, number, name, "legalName", kind, email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, "creditLimitCents", "paymentDays", classes, "adultAttestedAt", "termsVersion", "termsAcceptedAt", "approvedAt", "updatedAt")
     values (gen_random_uuid()::text, $1, $2, $3, 'PHARMACY', $4, '+27125550140', '1 Burnett Street', 'Hatfield', 'Pretoria', 'GP', '0083', 'APPROVED', 'ACCOUNT', 5000000, 30, '{ACCESSORY,CBD}'::"RegClass"[], now(), 'trade-1', now(), now(), now())
     returning id, number, name, email`,
    [tNo, `E2E Pharmacy ${run}`, `E2E Pharmacy ${run} (Pty) Ltd`, `e2e.trade.${run.toLowerCase()}@example.com`],
  );
  later(`remove trade account ${tAcc.number}`, () => q(`delete from "TradeAccount" where id = $1`, [tAcc.id])); // licences go with it
  // What a pharmacy needs, verified by HQ (the document is a seeded one: nobody opens it here).
  await q(
    `insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId", status, "reviewedAt")
     select gen_random_uuid()::text, $1, k::"TradeLicenceKind", 'E2E/' || k, (select "uploadId" from "TradeLicence" order by "createdAt" limit 1), 'VERIFIED', now() from unnest($2::text[]) k`,
    [tAcc.id, ["PHARMACY_LICENCE", "SAPC_RECORDING"]],
  );
  later("unlink the trade sale, drop the trade messages", async () => {
    await q(`update "Sale" set "tradeAccountId" = null where "tradeAccountId" = $1`, [tAcc.id]); // the sale stays, like every other trading record
    await q(`delete from "MessageLog" where "to" in ($1, $2)`, [tAcc.email, "+27825550199"]);
  });
  const tBuyer = await one(`insert into "TradeBuyer" (id, "tradeAccountId", name, email, phone, role) values (gen_random_uuid()::text, $1, 'E2E Buyer', $2, '+27825550199', 'OWNER') returning id, phone`, [tAcc.id, `e2e.trade.buyer.${run.toLowerCase()}@example.com`]);
  let tNum;
  while (!tNum) {
    const c = `TO-8${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
    if (!(await one(`select 1 from "TradeOrder" where number = $1`, [c]))) tNum = c;
  }
  const tOrder = await one(
    `insert into "TradeOrder" (id, number, "tradeAccountId", "buyerId", "storeId", fulfilment, status, "payMethod", "subtotalCents", "deliveryCents", "handlingCents", "vatCents", "totalCents", "collectionCode", events, "reservedAt", "updatedAt")
     values (gen_random_uuid()::text, $1, $2, $3, $4, 'COLLECT', 'PLACED', 'ACCOUNT', $5, 0, $6, $7, $8, $9, $10::jsonb, now(), now()) returning id, number, "collectionCode"`,
    [tNum, tAcc.id, tBuyer.id, store.id, tEx, tradeHandling, halfUp(tEx) + halfUp(tradeHandling), tTotal, String(100000 + Math.floor(Math.random() * 900000)), JSON.stringify([{ status: "PLACED", at: new Date().toISOString(), note: "E2E fixture: placed on account; stock reserved" }])],
  );
  later(`remove trade order ${tOrder.number}`, () => q(`delete from "TradeOrder" where id = $1`, [tOrder.id]));
  await q(`insert into "TradeOrderLine" (id, "tradeOrderId", "variantId", qty, "unitCents", "vatCents") values (gen_random_uuid()::text, $1, $2, $3, $4, $5)`, [tOrder.id, tradeItem.id, tQty, tradeItem.wholesaleCents, halfUp(tEx)]);
  ok(`${tOrder.number} for ${tAcc.name}: ${tQty} × ${tradeItem.label} at R${(tradeItem.wholesaleCents / 100).toFixed(2)} ex VAT + handling → R${(tTotal / 100).toFixed(2)} incl. VAT, on account`);
  await page.goto(`${BASE}/store/${CODE}`);
  const todayTrade = page.getByTestId("today-list").getByRole("listitem").filter({ hasText: /trade orders? to fulfil/ });
  await todayTrade.first().waitFor();
  assert((await todayTrade.count()) === 1 && (await todayTrade.locator("a").getAttribute("href")) === `/store/${CODE}/trade`, "Today lists the trade order to fulfil, linking to Trade orders");
  await visit(page, `/store/${CODE}/orders`, page.getByRole("searchbox"));
  assert((await page.getByRole("link", { name: /trade orders? to fulfil/ }).count()) === 1, "the Online orders page points to the open trade order");
  await visit(page, `/store/${CODE}/trade`, page.getByRole("link", { name: tOrder.number, exact: true }));
  await row(page, tOrder.number).getByRole("link", { name: tOrder.number, exact: true }).click();
  await page.waitForURL(new RegExp(`/trade/${tOrder.id}$`));
  await hydrated(page.getByRole("button", { name: "Start picking" }));
  const tHeading = (text) => page.getByRole("heading", { level: 1 }).filter({ hasText: text });
  await act(page, "pickTradeOrder", () => page.getByRole("button", { name: "Start picking" }).click(), () => tHeading("Picking").waitFor());
  assert((await one(`select status from "TradeOrder" where id = $1`, [tOrder.id])).status === "PICKING", "picking");
  await act(page, "readyTradeOrder", () => page.getByRole("button", { name: "Packed — ready for collection" }).click(), () => tHeading("Ready to collect").waitFor());
  const tReady = await one(`select status, "readyAt" from "TradeOrder" where id = $1`, [tOrder.id]);
  const readyText = await one(`select body from "MessageLog" where channel = 'SMS' and "to" = $1 and body like $2`, [tBuyer.phone, `%${tOrder.number} is ready%`]);
  assert(tReady.status === "READY" && tReady.readyAt && readyText?.body.includes(tOrder.collectionCode), "ready: the collection code texted to the buyer");
  await hydrated(page.getByRole("button", { name: `Hand over ${tOrder.number}` }));
  await page.getByRole("button", { name: `Hand over ${tOrder.number}` }).click();
  const hg = page.getByRole("group", { name: `Hand over ${tOrder.number}` });
  await act(page, "collectTradeOrder · no ID check", () => hg.getByRole("button", { name: "Complete handover" }).click(), () => alert(hg, "Check the collector's ID").waitFor());
  await hg.getByLabel(/I've seen the collector's ID/).check();
  await hg.locator("#collection-code").fill("000000");
  await act(page, "collectTradeOrder · wrong code", () => hg.getByRole("button", { name: "Complete handover" }).click(), () => alert(hg, "That isn't this order's collection code").waitFor());
  assert((await one(`select status from "TradeOrder" where id = $1`, [tOrder.id])).status === "READY", "nothing posted on a wrong code");
  await hg.locator("#collection-code").fill(tOrder.collectionCode);
  await shot(page, "trade-handover");
  await act(page, "collectTradeOrder", () => hg.getByRole("button", { name: "Complete handover" }).click(), () => status(page, "Handed over — sale").waitFor());
  const tDone = await one(
    `select o.status, o."invoiceNumber", o."collectedAt", s.channel, s."storeId", s."totalCents", s."tradeAccountId", s."ageCheck",
       (select method from "Payment" p where p."saleId" = s.id limit 1) method,
       (select cents from "TradeLedgerEntry" e where e."tradeOrderId" = o.id and e.kind = 'INVOICE') invoiced
     from "TradeOrder" o join "Sale" s on s.id = o."saleId" where o.id = $1`,
    [tOrder.id],
  );
  assert(
    tDone?.status === "COLLECTED" && tDone.collectedAt && tDone.channel === "WHOLESALE" && tDone.storeId === store.id && tDone.totalCents === tTotal && tDone.method === "ACCOUNT" && tDone.invoiced === tTotal && /^TI-\d{6}$/.test(tDone.invoiceNumber ?? "") && tDone.ageCheck === "ID_SIGHTED",
    `collected: sale ${tDone?.invoiceNumber} at ${CODE} in the trade channel, R${(tTotal / 100).toFixed(2)} incl. the handling fee, on account, ID sighted`,
  );
  const tMail = await until(() => one(`select 1 from "MessageLog" where channel = 'EMAIL' and "to" = $1 and body like $2`, [tAcc.email, `%${tDone.invoiceNumber}%`]));
  assert(tMail && (await one(`select 1 from "AuditLog" where action = 'trade.order.collected' and "entityId" = $1 and "actorId" = $2`, [tOrder.id, me.id])), "tax invoice emailed to the account; handover audited (trade.order.collected)");
  assert((await page.getByRole("button", { name: `Hand over ${tOrder.number}` }).count()) === 0, "nothing left to do on the order");

  // ───────────────────────────────────────────────────────────────────────────
  step("Local marketing: a coded happy-hour promotion — create, edit, end");
  const promoName = `E2E happy hour ${run}`;
  const promoCode = `E2E${run}`;
  await visit(page, `/store/${CODE}/marketing`, page.getByRole("button", { name: "New promotion" }));
  await page.getByRole("button", { name: "New promotion" }).click();
  const prDlg = page.getByRole("dialog", { name: "New store promotion" });
  await prDlg.locator("#pr-name").fill(promoName);
  await prDlg.locator("#pr-pct").fill("10");
  const promoCat = await one(`select name from "Category" where slug = 'grow'`) ?? (await one(`select name from "Category" order by "sortOrder" limit 1`));
  await prDlg.getByRole("checkbox", { name: new RegExp(`^${esc(promoCat.name)}`) }).first().check();
  await prDlg.locator("#pr-from").fill("15:00");
  await prDlg.locator("#pr-to").fill("17:00");
  await prDlg.locator("#pr-code").fill(promoCode);
  await shot(page, "promotion");
  later("switch off the test promotion", () => q(`update "Promotion" set active = false, "endsAt" = least("endsAt", now()) where name = $1 and "ownerStoreId" = $2 and active`, [promoName, store.id]));
  await act(page, "savePromotion · create", () => prDlg.getByRole("button", { name: "Create promotion" }).click(), () => status(prDlg, `“${promoName}” created`).waitFor());
  const promo = await one(`select id, value, code, active, "ownerStoreId", "startMinute", "endMinute", channels::text[] as channels from "Promotion" where name = $1`, [promoName]);
  assert(promo?.ownerStoreId === store.id && promo.value === 10 && promo.code === promoCode && promo.startMinute === 900 && promo.endMinute === 1020 && promo.channels.join() === "POS", `10% happy hour (15:00–17:00, code ${promoCode}) at ${store.name}'s tills`);
  await prDlg.getByRole("button", { name: "Close" }).click();
  await row(page, promoName).getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/[?&]edit=/); // a plain link: the page loads again with the drawer open
  const editDlg = page.getByRole("dialog", { name: `Edit “${promoName}”` });
  await hydrated(editDlg.locator("#pr-pct"));
  await editDlg.locator("#pr-pct").fill("15");
  await act(page, "savePromotion · edit", () => editDlg.getByRole("button", { name: "Save changes" }).click(), () => status(editDlg, `“${promoName}” updated.`).waitFor());
  assert((await one(`select value from "Promotion" where id = $1`, [promo.id])).value === 15, "discount changed to 15%");
  await editDlg.getByRole("button", { name: "Close" }).click();
  await row(page, promoName).getByRole("button", { name: "End", exact: true }).click();
  await act(page, "endPromotion", () => page.getByRole("group", { name: `End “${promoName}” now?` }).getByRole("button", { name: "End promotion" }).click(), () => row(page, promoName).filter({ hasText: "Ended" }).waitFor());
  assert(!(await one(`select active from "Promotion" where id = $1`, [promo.id])).active, "promotion ended");

  step("Local marketing: campaigns — Harvest tier (draft → send) and “Into CBD & wellness” (sent from the form), legal send window, cancel");
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await page.waitForURL(/tab=campaigns/);
  const openCampaign = async (name) => {
    await page.getByRole("button", { name: "New campaign" }).click();
    const dlg = page.getByRole("dialog", { name: "New campaign" });
    await dlg.locator("#cp-name").fill(name);
    await dlg.getByText(/members can receive SMS marketing/).first().waitFor();
    return dlg;
  };
  // Live reach ("N of M members can receive SMS") must match the database. Other tests add members while this one runs,
  // so the numbers shown must fall between a count taken before the change and one taken after it.
  const readReach = async (dlg) => {
    const m = (await dlg.locator('[aria-live="polite"]').filter({ hasText: /members can receive|Counting/ }).first().innerText()).match(/([\d,]+) of ([\d,]+) members can receive SMS/);
    return m ? { reachable: Number(m[1].replace(/,/g, "")), total: Number(m[2].replace(/,/g, "")) } : null;
  };
  const audience = (where) => one(`select count(*)::int as total, (count(*) filter (where "consentSms"))::int as reachable from "Customer" where "homeStoreId" = $1 and ${where}`, [store.id]);
  const reachFor = async (label, dlg, segment, where) => {
    const lo = await audience(where);
    let shown = null;
    await act(page, label, () => dlg.locator("#cp-seg").selectOption(segment), async () => {
      for (let i = 0; i < 100 && !shown; i++) {
        const [r, hi] = [await readReach(dlg), await audience(where)];
        if (r && r.total >= lo.total && r.total <= hi.total && r.reachable >= lo.reachable && r.reachable <= hi.reachable) shown = r;
        else await sleep(100);
      }
      if (!shown) fail(`${label}: reach ${JSON.stringify(await readReach(dlg))} never matched the database (${JSON.stringify(lo)})`);
    });
    return shown;
  };
  const campaigns = [];
  const campaignRow = async (name) => {
    const c = await one(`select id, name, status, segment, channel, "storeId", "scheduledAt", "sentCount" from "Campaign" where name = $1 and "storeId" = $2`, [name, store.id]);
    if (c) (campaigns.push(c), later(`cancel campaign “${name}”`, () => q(`update "Campaign" set status = 'CANCELLED' where id = $1 and status in ('DRAFT', 'SCHEDULED')`, [c.id])));
    return c;
  };
  const campName = `E2E Harvest nudge ${run}`;
  let cpDlg = await openCampaign(campName);
  const harvest = await reachFor("campaignReach · Harvest tier", cpDlg, "tier:HARVEST", `tier = 'HARVEST'`);
  ok(`${harvest.reachable} of ${harvest.total} Harvest members can get SMS marketing (matches the database)`);
  const message = "Hi {{firstName}}, thanks for being a Harvest member. Pop in this week to see what's new on the shelves. Adults 18+.";
  await cpDlg.locator("#cp-msg").fill(message);
  await act(page, "createCampaign · draft", () => cpDlg.getByRole("button", { name: "Save draft" }).click(), () => status(cpDlg, `“${campName}” saved as a draft.`).waitFor());
  const camp = await campaignRow(campName);
  assert(camp?.status === "DRAFT" && camp.segment === "tier:HARVEST" && camp.channel === "SMS", "draft saved (Harvest tier, SMS)");
  await cpDlg.getByRole("button", { name: "Close" }).click();
  await act(page, "sendDraft", () => row(page, campName).getByRole("button", { name: "Send", exact: true }).click(), () => row(page, campName).filter({ hasText: /Scheduled|Sent/ }).waitFor());
  const sent = await one(`select status, "scheduledAt", "sentCount" from "Campaign" where id = $1`, [camp.id]);
  assert(sent.status === "SCHEDULED" || sent.status === "SENT", sent.status === "SCHEDULED" ? `outside the CPA send window: scheduled for ${sent.scheduledAt.toISOString()}` : `sent to ${sent.sentCount} members`);

  // The interest the new member gave when they joined puts them in an "Into …" audience.
  const cbdName = `E2E Into CBD ${run}`;
  cpDlg = await openCampaign(cbdName);
  const intoLabel = await cpDlg.locator('#cp-seg option[value="interest:CBD"]').textContent();
  assert(intoLabel === "Into CBD & wellness", `audience option “${intoLabel}”`);
  const into = await reachFor("campaignReach · Into CBD & wellness", cpDlg, "interest:CBD", `interests @> '{CBD}'`);
  const counted = await one(`select 1 as yes from "Customer" where id = $1 and "homeStoreId" = $2 and interests @> '{CBD}' and "consentSms"`, [member.id, store.id]);
  assert(counted && into.reachable >= 1, `${into.reachable} of ${into.total} members into CBD & wellness can get SMS — ${member.memberNo} among them`);
  await cpDlg.locator("#cp-msg").fill(`Hi {{firstName}}, you told us you're into CBD & wellness: new balms and oils are on the shelves at ${store.name} this week. Adults 18+.`);
  await shot(page, "campaign-interest");
  await act(page, "createCampaign · send (Into CBD)", () => cpDlg.getByRole("button", { name: /^(Send to [\d,]+|Schedule send)$/ }).click(), () => status(cpDlg, new RegExp(`“${esc(cbdName)}” is scheduled for|^Sent to [\\d,]+ members`)).waitFor());
  const cbdCamp = await campaignRow(cbdName);
  if (cbdCamp?.status === "SCHEDULED") assert(cbdCamp.segment === "interest:CBD" && cbdCamp.scheduledAt > new Date(), `outside the CPA send window: held for ${cbdCamp.scheduledAt.toISOString()}, the next legal slot`);
  else {
    const got = await one(`select "to" from "MessageLog" where "campaignId" = $1 and "customerId" = $2`, [cbdCamp?.id, member.id]);
    assert(cbdCamp?.status === "SENT" && cbdCamp.segment === "interest:CBD" && got, `sent to ${cbdCamp?.sentCount} members into CBD & wellness, ${member.memberNo} among them`);
  }
  await cpDlg.getByRole("button", { name: "Close" }).click();

  // Cancel what's waiting for the send window; on a weekday both went out, so cancel a fresh draft instead.
  let cancelNames = (await q(`select name from "Campaign" where id = any($1::text[]) and status in ('DRAFT', 'SCHEDULED') order by "createdAt"`, [campaigns.map((c) => c.id)])).map((r) => r.name);
  if (!cancelNames.length) {
    const second = `E2E second draft ${run}`;
    cpDlg = await openCampaign(second);
    await cpDlg.locator("#cp-msg").fill(message);
    await cpDlg.getByRole("button", { name: "Save draft" }).click();
    await status(cpDlg, "saved as a draft").waitFor();
    await cpDlg.getByRole("button", { name: "Close" }).click();
    await campaignRow(second);
    cancelNames = [second];
  }
  for (const name of cancelNames) {
    await row(page, name).getByRole("button", { name: "Cancel", exact: true }).click();
    await act(page, "cancelCampaign", () => page.getByRole("group", { name: `Cancel “${name}”?` }).getByRole("button", { name: "Cancel campaign" }).click(), () => row(page, name).filter({ hasText: "Cancelled" }).waitFor());
    assert((await one(`select status from "Campaign" where name = $1 and "storeId" = $2`, [name, store.id])).status === "CANCELLED", `“${name}” cancelled — nothing more will be sent`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  step("Pricing: a shelf price on one item (and back), then a category at −5% (and cleared)");
  const priceCat = await one(
    `select c.slug, c.name, count(*)::int as items from "StoreVariant" sv join "Variant" v on v.id = sv."variantId" join "Product" p on p.id = v."productId" join "Category" c on c.id = p."categoryId"
     where sv."storeId" = $1 and v.active group by c.slug, c.name having count(sv."priceCents") = 0 order by (c.slug = 'grow') desc, count(*) limit 1`,
    [store.id],
  );
  const priced = await q(`select sv."variantId", sv."priceCents" from "StoreVariant" sv join "Variant" v on v.id = sv."variantId" join "Product" p on p.id = v."productId" join "Category" c on c.id = p."categoryId" where sv."storeId" = $1 and c.slug = $2 and v.active`, [store.id, priceCat.slug]);
  later(`clear own prices in ${priceCat.name}`, () => q(`update "StoreVariant" set "priceCents" = null where "storeId" = $1 and "variantId" = any($2::text[])`, [store.id, priced.map((p) => p.variantId)]));
  const pr = await ranged(`c.slug = $2 and sv."priceCents" is null`, [priceCat.slug]);
  await visit(page, `/store/${CODE}/pricing?q=${encodeURIComponent(pr.sku)}`, page.getByLabel(`Shelf price for ${pr.label}`));
  const shelfPrice = pr.priceCents + 100;
  await page.getByLabel(`Shelf price for ${pr.label}`).fill((shelfPrice / 100).toFixed(2));
  await act(page, "savePrices · own price", () => page.getByRole("button", { name: "Save 1 price" }).click(), () => page.getByText(/Saved 1 price\./).waitFor());
  assert((await one(`select "priceCents" from "StoreVariant" where "storeId" = $1 and "variantId" = $2`, [store.id, pr.id])).priceCents === shelfPrice, `${pr.sku} at R${(shelfPrice / 100).toFixed(2)} on the tills`);
  await page.getByRole("button", { name: `Reset ${pr.label} to the list price` }).click();
  await act(page, "savePrices · back to list", () => page.getByRole("button", { name: "Save 1 price" }).click(), () => page.getByText(/Saved 1 price\./).waitFor());
  assert((await one(`select "priceCents" from "StoreVariant" where "storeId" = $1 and "variantId" = $2`, [store.id, pr.id])).priceCents === null, "back to the list price");
  const bulk = async (label, mode, done) => {
    await page.getByRole("button", { name: "Change a category…" }).click();
    const g = page.getByRole("group", { name: "Bulk price change" });
    await g.locator("#bulk-cat").selectOption(priceCat.slug);
    if (mode === "reset") await g.getByLabel(/Clear my prices/).check();
    else await g.getByLabel("Percentage versus RRP").fill("-5");
    await act(page, label, () => g.getByRole("button", { name: "Apply to category" }).click(), done);
  };
  await bulk("bulkPrices · −5%", "pct", () => status(page, `Set ${priceCat.items} items to -5% vs RRP`).waitFor());
  const cut = await q(`select sv."priceCents", v."priceCents" as rrp from "StoreVariant" sv join "Variant" v on v.id = sv."variantId" where sv."storeId" = $1 and sv."variantId" = any($2::text[])`, [store.id, priced.map((p) => p.variantId)]);
  assert(cut.every((x) => x.priceCents === Math.max(100, Math.round((x.rrp * 95) / 100 / 100) * 100)), `${cut.length} ${priceCat.name} items at RRP −5%, rounded to the rand`);
  await bulk("bulkPrices · clear", "reset", () => status(page, `Cleared your own prices on ${priceCat.items} items`).waitFor());
  assert((await one(`select count("priceCents")::int as n from "StoreVariant" where "storeId" = $1 and "variantId" = any($2::text[])`, [store.id, priced.map((p) => p.variantId)])).n === 0, `${priceCat.name} follows the list price again`);
  cleanup.pop();

  // ───────────────────────────────────────────────────────────────────────────
  step("Settings: Sunday trading hours (bad times rejected), then put back; revoke a till");
  const hours = store.hours ?? {};
  later("restore store details", () => q(`update "Store" set hours = $2::jsonb, phone = $3, email = $4, whatsapp = $5, "clickCollect" = $6, "sameDay" = $7 where id = $1`, [store.id, JSON.stringify(hours), store.phone, store.email, store.whatsapp, store.clickCollect, store.sameDay]));
  const deviceName = `E2E till ${run}`;
  const device = await one(`insert into "Device" (id, "storeId", name, prefix, "tokenHash") values (gen_random_uuid()::text, $1, $2, $3, $4) returning id`, [store.id, deviceName, `E2E${run}`, randomBytes(32).toString("hex")]);
  later("delete the test till", () => q(`delete from "Device" where id = $1`, [device.id]));
  await visit(page, `/store/${CODE}/settings`, page.locator("#open-sun"));
  const sunClosed = page.locator('input[name="closed:sun"]');
  const setSunday = async (h) => {
    if (!h) return sunClosed.check();
    await sunClosed.uncheck();
    await page.locator("#open-sun").fill(h[0]);
    await page.locator("#close-sun").fill(h[1]);
  };
  const newSunday = hours.sun ? [hours.sun[0], hours.sun[1] === "15:00" ? "16:00" : "15:00"] : ["10:00", "14:00"];
  await setSunday(["12:00", "11:00"]);
  await act(page, "saveStoreDetails · close before open", () => page.getByRole("button", { name: "Save details" }).click(), () => alert(page, "Sunday: closing time must be after opening time").waitFor());
  await setSunday(newSunday);
  await act(page, "saveStoreDetails", () => page.getByRole("button", { name: "Save details" }).click(), () => status(page, "Store details saved.").waitFor());
  let st = await one(`select hours, "clickCollect", "sameDay" from "Store" where id = $1`, [store.id]);
  assert(JSON.stringify(st.hours.sun) === JSON.stringify(newSunday) && st.clickCollect === store.clickCollect && st.sameDay === store.sameDay, `Sunday ${newSunday.join("–")} saved, online fulfilment untouched`);
  await setSunday(hours.sun ?? null);
  await act(page, "saveStoreDetails · restore", () => page.getByRole("button", { name: "Save details" }).click(), () => status(page, "Store details saved.").waitFor());
  st = await one(`select hours from "Store" where id = $1`, [store.id]);
  assert(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].every((k) => JSON.stringify(st.hours[k] ?? null) === JSON.stringify(hours[k] ?? null)), "hours restored");
  const devRow = page.getByText(deviceName, { exact: true }).locator("xpath=../..");
  await devRow.getByRole("button", { name: "Revoke" }).click();
  await act(page, "revokeDevice", () => page.getByRole("group", { name: `Revoke ${deviceName}?` }).getByRole("button", { name: "Revoke till" }).click(), () => page.getByText(deviceName, { exact: true }).waitFor({ state: "hidden" }));
  assert(!(await one(`select active from "Device" where id = $1`, [device.id])).active, `${deviceName} revoked`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Franchise statement: email last month's statement to the owner");
  await visit(page, `/store/${CODE}/statement`, page.getByRole("button", { name: "Email to owner" }));
  t0 = new Date();
  await act(page, "emailToOwner", () => page.getByRole("button", { name: "Email to owner" }).click(), () => status(page, `statement is on its way to ${store.companyEmail}`).waitFor());
  const mail = await one(`select "to", body from "MessageLog" where channel = 'EMAIL' and "to" = $1 and body like 'Franchise statement%' and "createdAt" >= $2`, [store.companyEmail, t0]);
  assert(mail, `statement emailed to ${store.companyEmail} (${mail?.body.split("\n")[0]})`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Team: add a budtender (weak PIN refused), reset their PIN, deactivate and reactivate");
  const staffName = `E2E Budtender ${run}`;
  await visit(page, `/store/${CODE}/team`, page.getByRole("button", { name: "Add staff" }));
  await page.getByRole("button", { name: "Add staff" }).click();
  const stDlg = page.getByRole("dialog", { name: "Add a team member" });
  await stDlg.locator("#st-name").fill(staffName);
  await stDlg.locator("#st-pin").fill("1234");
  await act(page, "addStaff · weak PIN", () => stDlg.getByRole("button", { name: "Add to team" }).click(), () => alert(stDlg, "harder to guess").waitFor());
  await stDlg.locator("#st-pin").fill("2580");
  later("delete the test budtender", () => q(`delete from "User" where name = $1 and "storeId" = $2`, [staffName, store.id]));
  await act(page, "addStaff", () => stDlg.getByRole("button", { name: "Add to team" }).click(), () => status(stDlg, `${staffName} added.`).waitFor());
  const staff = await one(`select id, role, "storeId", active, "pinHash", "canDispense" from "User" where name = $1`, [staffName]);
  assert(staff?.role === "BUDTENDER" && staff.storeId === store.id && staff.pinHash && !staff.canDispense, `${staffName} on the team (till PIN only)`);
  await stDlg.getByRole("button", { name: "Close" }).click();
  await row(page, staffName).getByRole("button", { name: "Reset PIN" }).click();
  const pinGroup = page.getByRole("group", { name: `New till PIN for ${staffName}` });
  await pinGroup.getByLabel("New 4-digit PIN").fill("3691");
  await act(page, "resetPin", () => pinGroup.getByRole("button", { name: "Save PIN" }).click(), () => status(page, `New PIN set for ${staffName}`).waitFor());
  assert((await one(`select "pinHash" from "User" where id = $1`, [staff.id])).pinHash !== staff.pinHash, "PIN changed");
  await row(page, staffName).getByRole("button", { name: "Deactivate" }).click();
  await act(page, "setActive · deactivate", () => page.getByRole("group", { name: `Deactivate ${staffName}?` }).getByRole("button", { name: "Deactivate" }).click(), () => row(page, staffName).filter({ hasText: "Inactive" }).waitFor());
  assert(!(await one(`select active from "User" where id = $1`, [staff.id])).active, "deactivated");
  await act(page, "setActive · reactivate", () => row(page, staffName).getByRole("button", { name: "Reactivate" }).click(), () => row(page, staffName).getByRole("button", { name: "Deactivate" }).waitFor());
  assert((await one(`select active from "User" where id = $1`, [staff.id])).active, "reactivated");
  const ownCard = await one(`select c.id, c."memberNo" from "Customer" c where c."memberNo" is not null and not exists (select 1 from "User" u where u."memberId" = c.id) order by c."createdAt" limit 1`);
  await row(page, staffName).getByRole("button", { name: "Link card" }).click();
  const cardGroup = page.getByRole("group", { name: `${staffName}'s own Rewards card` });
  await cardGroup.getByLabel("Member number").fill("HH9999999");
  await act(page, "setMemberCard · unknown number", () => cardGroup.getByRole("button", { name: "Save card" }).click(), () => alert(cardGroup, "No Rewards member has the number HH9999999").waitFor());
  await cardGroup.getByLabel("Member number").fill(ownCard.memberNo);
  await act(page, "setMemberCard", () => cardGroup.getByRole("button", { name: "Save card" }).click(), () => status(page, `Linked ${ownCard.memberNo}`).waitFor());
  assert((await one(`select "memberId" from "User" where id = $1`, [staff.id])).memberId === ownCard.id, `${staffName}'s own card ${ownCard.memberNo} linked (their sales on it earn no commission and are flagged)`);

  // ───────────────────────────────────────────────────────────────────────────
  step("Banking: record a deposit with its stamped slip (a file that isn't a photo or PDF is refused)");
  const cashUp = await one(
    `insert into "Shift" (id, "storeId", "openedById", "openedAt", "openingFloatCents", "closedById", "closedAt", "expectedCashCents", "countedCashCents")
     values (gen_random_uuid()::text, $1, $2, now() - interval '9 hours', 100000, $2, now() - interval '1 hour', 342050, 342050) returning id`,
    [store.id, me.id],
  );
  later("remove the test cash-up", () => q(`delete from "Shift" where id = $1`, [cashUp.id]));
  const slipBytes = readFileSync(new URL("../prisma/demo/deposit-slip.jpg", import.meta.url));
  const depForm = page.getByRole("form", { name: "Record a deposit" });
  await visit(page, `/store/${CODE}/banking`, depForm.locator(`input[name="shift"][value="${cashUp.id}"]`));
  if (await depForm.getByRole("button", { name: "Clear" }).count()) await depForm.getByRole("button", { name: "Clear" }).click();
  await depForm.locator(`input[name="shift"][value="${cashUp.id}"]`).check();
  await depForm.getByText("Ticked 1 of").waitFor();
  await depForm.locator("#dep-amount").fill("2420.50");
  await depForm.getByText("Matches the ticked cash-ups.").waitFor();
  await depForm.locator("#dep-ref").fill(`E2E-${run}`);
  await depForm.locator("#dep-slip").setInputFiles({ name: "slip.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a photo") });
  await act(page, "addDeposit · not a slip", () => depForm.getByRole("button", { name: "Record deposit" }).click(), () => alert(depForm, "must be a photo").waitFor());
  await depForm.locator("#dep-slip").setInputFiles({ name: "slip.jpg", mimeType: "image/jpeg", buffer: slipBytes });
  t0 = new Date();
  await act(page, "addDeposit", () => depForm.getByRole("button", { name: "Record deposit" }).click(), () => status(page, "it matches the cash counted").waitFor());
  const dep = await one(
    `select d.id, d.number, d."amountCents", d."expectedCents", d.status, d."slipId", u.sha256, u."contentType" from "CashDeposit" d join "Upload" u on u.id = d."slipId" where d.reference = $1`,
    [`E2E-${run}`],
  );
  if (dep)
    later(`remove ${dep.number}`, async () => {
      await q(`update "Shift" set "depositId" = null where "depositId" = $1`, [dep.id]);
      await q(`delete from "CashDeposit" where id = $1`, [dep.id]);
      await q(`delete from "Upload" where id = $1`, [dep.slipId]);
    });
  assert(
    dep?.amountCents === 242050 && dep.expectedCents === 242050 && dep.status === "RECORDED" && dep.contentType === "image/jpeg" && dep.sha256 === createHash("sha256").update(slipBytes).digest("hex"),
    `${dep?.number}: R2,420.50 banked against R2,420.50 counted less float, slip stored (SHA-256 matches)`,
  );
  assert((await one(`select "depositId" from "Shift" where id = $1`, [cashUp.id])).depositId === dep.id && (await audits("deposit.record", me.id, t0)) === 1, "the cash-up is banked; audited");
  await row(page, dep.number).first().waitFor();
  assert(!(await row(page, dep.number).getByRole("button", { name: "Verify" }).count()), "the manager can't check the deposit (owner, area manager or HQ do)");

  step("Loss prevention: an alert about the manager is hidden from them, even by its address");
  const lpAlert = await one(
    `insert into "Alert" (id, key, rule, severity, "storeId", "userId", title, detail, "amountCents", evidence, "updatedAt")
     values (gen_random_uuid()::text, $1, 'REFUND', 'HIGH', $2, $3, $4, 'A card sale refunded in cash (test alert).', 42000, '[]'::jsonb, now()) returning id, title`,
    [`E2E:${run}`, store.id, me.id, `E2E refund check ${run}`],
  );
  later("delete the test alert", () => q(`delete from "Alert" where id = $1`, [lpAlert.id]));
  const hidden = await page.goto(`${BASE}/store/${CODE}/loss-prevention/${lpAlert.id}`);
  assert(hidden.status() === 404, "404 for the manager");

  // ───────────────────────────────────────────────────────────────────────────
  step("HQ updates: acknowledge an update for the store");
  // An update waiting for this store on the first page of the list (newest first, 10 a page), else a new one.
  let ann = await one(
    `with shown as (select a.* from "Announcement" a join "Store" s on s.id = $1 join "Region" r on r.id = s."regionId"
                    where a.audience in ('ALL', 'format:' || s.format, 'region:' || r.code) order by a."createdAt" desc limit 10)
     select id, title from shown a where a."requiresAck" and not exists (select 1 from "AnnouncementAck" k where k."announcementId" = a.id and k."storeId" = $1)
     order by a."createdAt" desc limit 1`,
    [store.id],
  );
  if (!ann) {
    ann = await one(`insert into "Announcement" (id, title, body, kind, audience, "requiresAck") values (gen_random_uuid()::text, $1, 'Brief the team on the E2E checklist.', 'POLICY', 'ALL', true) returning id, title`, [`E2E update ${run}`]);
    later("delete the test update", () => q(`delete from "Announcement" where id = $1`, [ann.id]));
  } else later(`un-acknowledge “${ann.title}”`, () => q(`delete from "AnnouncementAck" where "announcementId" = $1 and "storeId" = $2`, [ann.id, store.id]));
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: ann.title, exact: true }) });
  await visit(page, `/store/${CODE}/updates`, card.getByRole("button", { name: "I've read this and briefed the team" }));
  await act(page, "acknowledge", () => card.getByRole("button", { name: "I've read this and briefed the team" }).click(), () => card.getByText(/Acknowledged \d{1,2} \w{3} \d{4}/).waitFor()); // the text follows an icon, so no ^
  const ack = await one(`select "userId" from "AnnouncementAck" where "announcementId" = $1 and "storeId" = $2`, [ann.id, store.id]);
  assert(ack?.userId === me.id, `“${ann.title}” acknowledged by ${me.name}`);
  await cleanup.pop().fn(); // put the update back as it was straight away: every store in the network sees it

  step("Scope: a manager can't open another store's back office");
  const away = await page.goto(`${BASE}/store/PTA03`);
  await page.getByText("This store sits outside what you look after").waitFor();
  assert(away.status() === 404 && page.url().endsWith("/store/PTA03"), "not found (404) inside their own back office, not the sign-in page");

  // ───────────────────────────────────────────────────────────────────────────
  step("Owner: /store opens the consolidated view of all their stores; switch store; dispenser rights");
  owner = await session("owner");
  const op = owner.page;
  const ownerStores = await q(`select code, name from "Store" where "companyId" = $1 and kind = 'RETAIL' order by name`, [store.companyId]);
  await signIn(op, OWNER, "/store");
  await op.waitForURL(new RegExp(`/store/[A-Z0-9]+\\?stores=company`));
  await op.getByRole("link", { name: `All my stores (${ownerStores.length})` }).waitFor();
  const league = op.locator("table").filter({ has: op.getByRole("columnheader", { name: "Growth" }) });
  for (const s of ownerStores) await league.getByRole("link", { name: s.name }).waitFor();
  assert(ownerStores.length > 1, `consolidated view: ${ownerStores.map((s) => s.name).join(" + ")}`);
  await shot(op, "owner-consolidated");
  await op.getByRole("link", { name: `${store.name} only` }).click();
  await op.waitForURL((u) => !u.search.includes("stores=company"));
  await op.getByText(`Herbal Holland ${store.name} · ${CODE}`, { exact: true }).waitFor(); // the single-store overline
  ok(`back to ${store.name} on its own`);
  const other = ownerStores.find((s) => s.code !== CODE);
  await visit(op, `/store/${CODE}/inventory`, op.getByLabel("Switch store"));
  await act(op, "switch store (keeps the section)", () => op.getByLabel("Switch store").selectOption(other.code), () => op.waitForURL(new RegExp(`/store/${other.code}/inventory$`)), { action: false });
  await op.getByRole("heading", { level: 1, name: "Stock on hand" }).waitFor();
  ok(`switched to ${other.name}, still on Stock on hand`);
  await visit(op, `/store/${CODE}/team`, row(op, staffName).getByRole("button", { name: "Make dispenser" }));
  await act(op, "setDispenser · on", () => row(op, staffName).getByRole("button", { name: "Make dispenser" }).click(), () => status(op, `${staffName} can now dispense`).waitFor());
  assert((await one(`select "canDispense" from "User" where id = $1`, [staff.id])).canDispense, `${staffName} authorised to dispense`);
  await act(op, "setDispenser · off", () => row(op, staffName).getByRole("button", { name: "Remove dispenser" }).click(), () => status(op, `${staffName} can no longer dispense`).waitFor());
  assert(!(await one(`select "canDispense" from "User" where id = $1`, [staff.id])).canDispense, "dispenser rights removed");

  step("Banking: the owner opens the slip, queries the deposit, then verifies it (locked)");
  const ownerUser = await one(`select id, name from "User" where email = $1`, [OWNER]);
  t0 = new Date();
  // Fetched from the page, like opening the link (the session cookie is Secure on a production build).
  const slip = await op.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, type: r.headers.get("content-type"), bytes: [...new Uint8Array(await r.arrayBuffer())] };
  }, `${BASE}/store/${CODE}/banking/${dep.id}/slip`);
  assert(slip.status === 200 && slip.type === "image/jpeg" && Buffer.from(slip.bytes).equals(slipBytes), "slip served to the owner, byte for byte");
  assert((await audits("deposit.slip_view", ownerUser.id, t0)) === 1, "slip view audited");
  await visit(op, `/store/${CODE}/banking?dep=${dep.number}`, row(op, dep.number).getByRole("button", { name: "Query" }));
  await row(op, dep.number).getByRole("button", { name: "Query" }).click();
  const qg = op.getByRole("group", { name: `Query ${dep.number}` });
  await act(op, "queryDeposit · no note", () => qg.getByRole("button", { name: "Send query" }).click(), () => alert(qg, /Say what doesn.t match/).waitFor());
  await qg.getByLabel("What doesn't match the bank statement?").fill("Not on the statement yet");
  await act(op, "queryDeposit", () => qg.getByRole("button", { name: "Send query" }).click(), () => row(op, dep.number).getByText("Queried", { exact: true }).waitFor());
  assert((await one(`select status from "CashDeposit" where id = $1`, [dep.id])).status === "QUERIED", `${dep.number} queried`);
  await row(op, dep.number).getByRole("button", { name: "Verify" }).click();
  await act(op, "verifyDeposit", () => op.getByRole("group", { name: `Verify ${dep.number}?` }).getByRole("button", { name: "Verify and lock" }).click(), () => row(op, dep.number).getByText("Verified", { exact: true }).waitFor());
  const checked = await one(`select status, "reviewedById" from "CashDeposit" where id = $1`, [dep.id]);
  assert(checked.status === "VERIFIED" && checked.reviewedById === ownerUser.id && !(await row(op, dep.number).getByRole("button", { name: "Verify" }).count()), `${dep.number} verified by ${ownerUser.name} and locked`);

  step("Loss prevention: the owner investigates the alert, then resolves it with a note");
  await visit(op, `/store/${CODE}/loss-prevention/${lpAlert.id}`, op.getByRole("button", { name: "Investigating" }));
  t0 = new Date();
  await op.getByRole("button", { name: "Investigating" }).click();
  const inv = op.getByRole("group", { name: "Mark as investigating" });
  await inv.getByLabel("Note (optional)").fill("Checking the card machine slips");
  await act(op, "updateAlert · investigating", () => inv.getByRole("button", { name: "Mark as investigating" }).click(), () => status(op, "Marked as investigating").waitFor());
  await hydrated(op.getByRole("button", { name: "Resolve" }));
  await op.getByRole("button", { name: "Resolve" }).click();
  const res = op.getByRole("group", { name: "Resolve this alert" });
  await res.getByLabel("How was it resolved?").fill("The card refund was reversed; spoke to the team");
  await act(op, "updateAlert · resolve", () => res.getByRole("button", { name: "Resolve" }).click(), () => status(op, "Resolved").waitFor());
  const closed = await one(`select status, "closedById", note from "Alert" where id = $1`, [lpAlert.id]);
  assert(closed.status === "RESOLVED" && closed.closedById === ownerUser.id && (await audits("alert.update", ownerUser.id, t0)) === 2, "investigating → resolved, with the note; both audited");

  step(`Commission: the owner switches it on at ${other.name}, approves last month for payroll, downloads it, then switches it off`);
  const cs = await one(`select id, code, "commissionOn" from "Store" where code = $1`, [other.code]);
  const lastMonth = dayKey(new Date(new Date(`${dayKey().slice(0, 7)}-01T12:00:00+02:00`).getTime() - 5 * 86_400_000)).slice(0, 7);
  later(`put ${cs.code}'s commission back`, () => q(`update "Store" set "commissionOn" = $2 where id = $1`, [cs.id, cs.commissionOn]));
  later(`un-approve ${cs.code} ${lastMonth}`, () => q(`delete from "CommissionRun" where "storeId" = $1 and month = $2`, [cs.id, lastMonth]));
  await q(`update "Store" set "commissionOn" = false where id = $1`, [cs.id]);
  await q(`delete from "CommissionRun" where "storeId" = $1 and month = $2`, [cs.id, lastMonth]);
  t0 = new Date();
  await visit(op, `/store/${cs.code}/commission`, op.getByRole("button", { name: "Switch commission on" }));
  await op.getByRole("button", { name: "Switch commission on" }).click();
  await act(op, "commission · on", () => op.getByRole("group", { name: "Switch commission on?" }).getByRole("button", { name: "Switch on" }).click(), () => status(op, "Commission is on").waitFor());
  assert((await one(`select "commissionOn" from "Store" where id = $1`, [cs.id])).commissionOn && (await audits("commission.switch", ownerUser.id, t0)) === 1, "switched on (audited)");
  await visit(op, `/store/${cs.code}/commission?month=${lastMonth}`, op.getByRole("button", { name: "Approve for payroll" }));
  await op.getByRole("button", { name: "Approve for payroll" }).click();
  await act(op, "approve commission", () => op.getByRole("group", { name: /^Approve .+ for payroll\?$/ }).getByRole("button", { name: "Approve", exact: true }).click(), () => status(op, "approved:").waitFor());
  const cr = await one(`select "totalCents", lines, "approvedById" from "CommissionRun" where "storeId" = $1 and month = $2`, [cs.id, lastMonth]);
  // (A short CI seed may have no sales last month: the month is still approved, with nobody to pay.)
  assert(cr?.approvedById === ownerUser.id && (await audits("commission.approve", ownerUser.id, t0)) === 1, `${lastMonth} approved: R${(cr?.totalCents / 100).toFixed(2)} for ${cr?.lines.length} people (audited)`);
  const [csvDl] = await Promise.all([op.waitForEvent("download"), op.getByRole("link", { name: "Export CSV" }).click()]);
  const csvRows = parseCsv(readFileSync(await csvDl.path(), "utf8")).filter((r) => r.length > 1);
  assert(csvRows.length === cr.lines.length + 1 && csvRows[0][0] === "Name", `${csvDl.suggestedFilename()}: a row per person (${cr.lines.length})`);
  await visit(op, `/store/${cs.code}/commission`, op.getByRole("button", { name: "Switch commission off" }));
  await op.getByRole("button", { name: "Switch commission off" }).click();
  await act(op, "commission · off", () => op.getByRole("group", { name: "Switch commission off?" }).getByRole("button", { name: "Switch off" }).click(), () => status(op, "Commission is off").waitFor());
  assert(!(await one(`select "commissionOn" from "Store" where id = $1`, [cs.id])).commissionOn, "switched off again");

  passed = true;
} catch (e) {
  console.log(`\n✗ FAILED during “${current}”:`, e.message.split("\n")[0]);
  await shot(page, "FAILED");
  for (const s of [hq, owner, seller]) if (s) await shot(s.page, "FAILED-other");
  process.exitCode = 1;
} finally {
  for (const c of cleanup.reverse()) await c.fn().catch((e) => console.log(`  (cleanup “${c.label}” failed: ${e.message.split("\n")[0]})`));
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
