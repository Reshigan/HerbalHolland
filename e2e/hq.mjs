// End-to-end test of the HQ console (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://…/hh_dev node e2e/hq.mjs [outdir]   (seeded demo data)
// Signs in as the HQ administrator and drives every HQ form through the UI: onboard a store (profile, fees, status,
// owner) → new product, variants, ranging → catalogue import (template → preview → import) → batch lab results, quarantine/release → DC orders (approve + ship,
// reject, cancel) → recall → compliance rules and licences → pricing → promotions → drops → events → campaigns
// (reach for an interest audience, draft, schedule, send, cancel, do-not-contact import) → social (Postiz not
// connected) → online orders (cancel, delivery settings) → a member's POPIA export and erasure → launch lock →
// Rewards settings and My Deals → statements → team → announcements → reports centre (+ CSV) → trade (an application
// whose licence HQ first doesn't accept and then verifies — approval waits for it — approved on account terms, an order placed for the account, picked and shipped short, the EFT recorded, the
// statement emailed, hold and release, the trade settings card) → an area manager's scope.
// Everything it creates is named "E2E …" and removed at the end; every setting it changes is put back as found.
// Prints how long each action took, from the click to its visible result.
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-hq";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
page.setDefaultNavigationTimeout(120_000); // the dev server compiles each route on first visit
const problems = [];
const watch = (p, who) => p.on("pageerror", (e) => problems.push(`${who} · ${p.url().replace(BASE, "")}: ${e.message.split("\n")[0]}`));
watch(page, "hq");
let n = 0;
const shot = (name, p = page) => p.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => console.log(`\n▸ ${s}`);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls until fn returns something truthy (or gives up and returns null). */
async function until(fn, ms = 20_000, every = 150) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────────────
/** Success/info notices (and flashes after a redirect) are role=status; errors and field errors are role=alert. */
const notice = (text, p = page) => p.getByRole("status").filter({ hasText: text }).first();
const alertIn = (scope, text) => scope.getByRole("alert").filter({ hasText: text }).first();
/** Client forms only handle a submit once React has hydrated them (before that the browser would submit natively). */
async function hydrated(locator, p = page) {
  const el = locator.first();
  await el.waitFor();
  const done = await until(() => el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))), 60_000, 100);
  if (!done) fail(`never hydrated: ${p.url()}`);
}
async function open(path, ready, p = page) {
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  if (ready) await hydrated(ready, p);
}
const formWith = (sel, p = page) => p.locator("form").filter({ has: p.locator(sel) });
const headerOf = (p = page) => p.locator("h1").first().locator("xpath=../..");

// ── Timing: click → visible result ──────────────────────────────────────────
const timings = [];
/**
 * Triggers an action and waits for its visible result, recording the time in between. Server-action submits also
 * wait for the action's response first, so a result that looks like the previous one (a restore) isn't taken early.
 */
async function act(label, trigger, result, { p = page, action = true } = {}) {
  const t0 = performance.now();
  const response = action ? p.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 120_000 }) : null;
  await trigger();
  if (response) await response;
  await result();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  return ms;
}

// ── Dates (SAST wall clock for datetime-local inputs) ───────────────────────
const sastParts = (d) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
const localInput = (d) => {
  const x = sastParts(d);
  return `${x.year}-${x.month}-${x.day}T${x.hour === "24" ? "00" : x.hour}:${x.minute}`;
};
/** A Tuesday–Thursday at least `days` days out, at `hh:00` SAST — inside the CPA contact window. */
function weekdayAt(days, hh) {
  const d = new Date(Date.now() + days * 86_400_000);
  while (!["Tue", "Wed", "Thu"].includes(sastParts(d).weekday)) d.setTime(d.getTime() + 86_400_000);
  return `${localInput(d).slice(0, 10)}T${String(hh).padStart(2, "0")}:00`;
}

// ── Test data: unique per run, removed at the end ───────────────────────────
const sfx = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36).toString(36)}`;
const SFX = sfx.toUpperCase();
const created = { announcements: [], offers: [], mails: [], campaigns: [] };
const T = {
  storeName: `E2E Store ${sfx}`,
  productName: `E2E Calm Tonic ${sfx}`,
  categoryName: `E2E Tonics ${sfx}`,
  sku: `E2E-${SFX}-30`,
  batchCode: `E2E${SFX}`,
  listName: `E2E list ${sfx}`,
  promoName: `E2E deal ${sfx}`,
  promoCode: `E2E${SFX}`,
  dropName: `E2E drop ${sfx}`,
  eventTitle: `E2E members' evening ${sfx}`,
  campaignName: `E2E campaign ${sfx}`,
  caption: `The Windmill Tee is back: the mark embroidered in Sunset thread, made in Cape Town. (${sfx})`,
  staffName: `E2E Staffer ${sfx}`,
  staffEmail: `e2e.staff.${sfx}@herbalholland.co.za`,
  ownerName: `E2E Owner ${sfx}`,
  ownerEmail: `e2e.owner.${sfx}@example.com`,
  annTitle: `E2E notice ${sfx}`,
  importName: `E2E Import Jar ${sfx}`,
  importSku: `E2E-${SFX}-IMP`,
  importFile: `e2e-import-${sfx}.csv`,
  memberEmail: `e2e.member.${sfx}@example.com`,
  dncEmail: `e2e.dnc.${sfx}@example.com`,
  tradeName: `E2E Trade ${sfx}`,
  tradeEmail: `e2e.trade.${sfx}@example.com`,
  tradeBuyerEmail: `e2e.trade.buyer.${sfx}@example.com`,
};
const freePhone = async () => {
  for (;;) {
    const p = `+2769${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    if (!(await one(`select 1 from "Customer" where phone = $1 union all select 1 from "Suppression" where value = $1`, [p]))) return p;
  }
};

// Settings are shared with everyone using this database: remember them exactly (row or no row) and put them back.
const SETTING_KEYS = ["compliance", "loyalty", "offers", "pricing", "ecommerce", "launch", "loss", "banking", "commission", "trade"];
const originalSettings = new Map((await q(`select key, value from "Setting" where key = any($1)`, [SETTING_KEYS])).map((r) => [r.key, r.value]));
const setting = async (key) => (await one(`select value from "Setting" where key = $1`, [key]))?.value ?? null;
async function restoreSetting(key) {
  const now = await setting(key);
  if (originalSettings.has(key)) {
    if (JSON.stringify(now) !== JSON.stringify(originalSettings.get(key)))
      await q(`insert into "Setting" (key, value, "updatedAt") values ($1, $2, now()) on conflict (key) do update set value = excluded.value, "updatedAt" = now()`, [key, JSON.stringify(originalSettings.get(key))]);
  } else if (now) await q(`delete from "Setting" where key = $1`, [key]); // no row = the built-in defaults
}

let store, product, variant, batch, member, order, dc, area, tradeAccount, tradeOrder;

try {
  step("Sign in as the HQ administrator (demo link)");
  await page.goto(`${BASE}/api/auth/demo?email=hq@herbalholland.co.za&next=/hq`);
  await page.waitForURL(`${BASE}/hq`);
  const admin = await one(`select id, name from "User" where email = 'hq@herbalholland.co.za'`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  ok(`signed in as ${admin.name}`);
  area = await one(`select u.id, r.id "regionId", r.code, r.name from "User" u join "Region" r on r.id = u."regionId" where u.email = 'area.gpn@herbalholland.co.za'`);
  dc = await one(`select id, code, name from "Store" where kind = 'WAREHOUSE' order by code limit 1`);
  const otherRegion = await one(`select id, code, name from "Region" where id <> $1 and exists (select 1 from "Store" s where s."regionId" = "Region".id and s.kind = 'RETAIL') order by code limit 1`, [area.regionId]);

  // ── Stores ────────────────────────────────────────────────────────────────
  step("Stores: onboard a store for a new franchisee (validation first; range copied from a template)");
  let storeCode;
  while (!storeCode) {
    const c = `XTS${100 + Math.floor(Math.random() * 900)}`;
    if (!(await one(`select 1 from "Store" where code = $1`, [c]))) storeCode = c;
  }
  await open("/hq/stores", page.getByRole("link", { name: /Onboard a store/ }));
  await page.getByRole("link", { name: /Onboard a store/ }).click();
  await page.waitForURL(/\/hq\/stores\/new$/);
  const sf = formWith("#coLegalName, #companyId");
  await hydrated(sf);
  await sf.locator("#code").fill("PT1");
  await sf.locator("#name").fill(T.storeName);
  await sf.locator("#regionId").selectOption(otherRegion.id);
  await sf.locator("#format").selectOption("EXPRESS");
  await sf.locator("#addressLine").fill("Shop 1, E2E Centre, 1 Test Road");
  await sf.locator("#suburb").fill("Testville");
  await sf.locator("#city").fill("Bloemfontein");
  await sf.locator("#province").selectOption("FS");
  await sf.locator("#postalCode").fill("93");
  await sf.getByRole("radio", { name: "New franchisee" }).click();
  await sf.locator("#coLegalName").fill(`E2E Trading ${sfx} (Pty) Ltd`);
  await sf.locator("#coEmail").fill(`owner.${sfx}@example.com`);
  await sf.locator("#coVatNumber").fill("123");
  await act("stores.createStore · invalid", () => sf.getByRole("button", { name: "Create store" }).click(), () => alertIn(sf, "Check the highlighted fields.").waitFor());
  assert(
    (await alertIn(sf, "Three letters and a number").isVisible()) && (await alertIn(sf, "4-digit postal code").isVisible()) && (await alertIn(sf, "10 digits starting with 4").isVisible()),
    "bad store code, postal code and VAT number are flagged on their fields",
  );
  assert(!(await one(`select 1 from "Store" where name = $1`, [T.storeName])), "nothing was created");
  await sf.locator("#code").fill(storeCode.toLowerCase());
  await sf.locator("#postalCode").fill("9301");
  await sf.locator("#coVatNumber").fill("");
  const templateId = await sf.locator("#templateId").inputValue();
  await shot("new-store");
  await act("stores.createStore", () => sf.getByRole("button", { name: "Create store" }).click(), () => page.getByText("Store created", { exact: true }).waitFor());
  store = await one(`select s.id, s.code, s.name, s.status, s.format, s.licences::text[] licences, s."companyId", c.kind "coKind", c.name "coName" from "Store" s join "Company" c on c.id = s."companyId" where s.code = $1`, [storeCode]);
  const ranged = (await one(`select count(*)::int n from "StoreVariant" where "storeId" = $1`, [store?.id ?? ""])).n;
  const expected = (await one(`select count(*)::int n from "StoreVariant" sv join "Variant" v on v.id = sv."variantId" where sv."storeId" = $1 and v.active`, [templateId])).n;
  assert(page.url().endsWith(`/hq/stores/${storeCode}?created=1`) && store.status === "OPENING_SOON" && store.format === "EXPRESS", `store ${storeCode} created (opening soon, express, ${otherRegion.name})`);
  assert(store.coKind === "FRANCHISEE" && store.coName === `E2E Trading ${sfx}` && store.licences.length === 0, `owner company "${store.coName}" created; no licences`);
  assert(ranged === expected && ranged > 0, `range copied from the template store: ${ranged} SKUs`);

  step("Stores: profile, fees, status and owner of the new store");
  const profile = formWith("#receiptFooter");
  await hydrated(profile);
  await profile.locator("#postalCode").fill("93A");
  await act("stores.saveStoreProfile · invalid", () => profile.getByRole("button", { name: "Save profile" }).click(), () => alertIn(profile, "4-digit postal code").waitFor());
  await profile.locator("#postalCode").fill("9301");
  await profile.locator("#receiptFooter").fill(`Thanks for visiting E2E ${sfx}`);
  await profile.locator("#whatsapp").fill("082 555 0199");
  await act("stores.saveStoreProfile", () => profile.getByRole("button", { name: "Save profile" }).click(), () => notice("Store profile saved.").waitFor());
  let s1 = await one(`select "receiptFooter", whatsapp from "Store" where id = $1`, [store.id]);
  assert(s1.receiptFooter === `Thanks for visiting E2E ${sfx}` && s1.whatsapp === "+27825550199", "profile saved (receipt footer; WhatsApp stored as +27825550199)");
  const fees = formWith("#royalty");
  await fees.locator("#royalty").fill("40");
  await act("stores.saveStoreFees · invalid", () => fees.getByRole("button", { name: "Update fees" }).click(), () => alertIn(fees, "Fees must be percentages of net sales.").waitFor());
  await fees.locator("#royalty").fill("5.5");
  await act("stores.saveStoreFees", () => fees.getByRole("button", { name: "Update fees" }).click(), () => notice("Fees updated — they apply from the next statement.").waitFor());
  s1 = await one(`select "royaltyBps", "levyBps", "ecomBps" from "Store" where id = $1`, [store.id]);
  assert(s1.royaltyBps === 550 && s1.levyBps === 200 && s1.ecomBps === 1000, "royalty 5.5% (550 bps), levy and e-com unchanged");
  const status = formWith("#status");
  await status.locator("#status").selectOption("ACTIVE");
  await act("stores.saveStoreStatus", () => status.getByRole("button", { name: "Update status" }).click(), () => notice("Store is now active.").waitFor());
  s1 = await one(`select status, "openedAt" from "Store" where id = $1`, [store.id]);
  assert(s1.status === "ACTIVE" && s1.openedAt, "store active, opening date stamped");
  await status.locator("#status").selectOption("OPENING_SOON");
  await act("stores.saveStoreStatus (back)", () => status.getByRole("button", { name: "Update status" }).click(), () => notice("Store is now opening soon.").waitFor());
  assert((await one(`select status from "Store" where id = $1`, [store.id])).status === "OPENING_SOON", "back to opening soon (stays out of the shop for the rest of the test)");
  const owner = formWith("#legalName");
  await owner.locator("#vatNumber").fill("12345");
  await act("stores.saveCompany · invalid", () => owner.getByRole("button", { name: "Save owner" }).click(), () => alertIn(owner, "10 digits starting with 4").waitFor());
  const vat = `4${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await owner.locator("#vatNumber").fill(vat);
  await owner.locator("#contactName").fill("E2E Owner");
  await act("stores.saveCompany", () => owner.getByRole("button", { name: "Save owner" }).click(), () => notice("Owner saved. VAT status changes apply to invoices from now on.").waitFor());
  const co = await one(`select "vatNumber", "contactName" from "Company" where id = $1`, [store.companyId]);
  assert(co.vatNumber === vat && co.contactName === "E2E Owner", `owner now a VAT vendor (${vat})`);
  await shot("store-detail");

  step("Stores: franchisee owners — add one (validation first), reset their password, deactivate them");
  await open(`/hq/stores/${storeCode}`, formWith("#ownerEmail"));
  const of = formWith("#ownerEmail");
  await hydrated(of);
  await of.locator("#ownerName").fill(T.ownerName);
  await of.locator("#ownerEmail").fill("not-an-email");
  await act("stores.addOwner · invalid", () => of.getByRole("button", { name: "Add owner" }).click(), () => alertIn(of, "The email address they'll sign in with").waitFor());
  assert(!(await one(`select 1 from "User" where name = $1`, [T.ownerName])), "nothing was created");
  await of.locator("#ownerEmail").fill(T.ownerEmail);
  await act("stores.addOwner", () => of.getByRole("button", { name: "Add owner" }).click(), () => notice(/can now sign in as/).waitFor());
  const opw1 = (await notice(/can now sign in as/).innerText()).match(/temporary password\s+(\S+)\s+—/)?.[1];
  const storeOwner = await one(`select id, role, "companyId", "mustChangePassword", "tempPasswordUntil" from "User" where email = $1`, [T.ownerEmail]);
  assert(storeOwner?.role === "OWNER" && storeOwner.companyId === store.companyId && storeOwner.mustChangePassword && storeOwner.tempPasswordUntil && opw1, `${T.ownerEmail} added as an owner of ${store.coName}, with a one-time password`);
  const orow = page.getByRole("listitem").filter({ hasText: T.ownerEmail });
  await orow.getByRole("button", { name: "Reset password" }).click();
  const orp = orow.getByRole("group", { name: `Reset ${T.ownerName}'s password?` });
  await act("stores.resetOwnerPassword", () => orp.getByRole("button", { name: "Reset password" }).click(), () => orow.getByText(/New temporary password for/).waitFor());
  const opw2 = (await orow.getByText(/New temporary password for/).innerText()).match(/:\s+(\S+)\s+—/)?.[1];
  assert(opw2 && opw2 !== opw1, "a new one-time password is shown once");
  await orow.getByRole("button", { name: "Deactivate" }).click();
  const odp = orow.getByRole("group", { name: `Deactivate ${T.ownerName}?` });
  await act("stores.setOwnerActive (deactivate)", () => odp.getByRole("button", { name: "Deactivate" }).click(), () => notice(`${T.ownerName} has been signed out everywhere and can no longer sign in.`).waitFor());
  const od = await one(`select active, (select count(*)::int from "Session" s where s."userId" = u.id) sessions from "User" u where id = $1`, [storeOwner.id]);
  assert(od.active === false && od.sessions === 0, "deactivated and signed out everywhere (the store isn't trading yet, so no owner has to stay active)");
  const ownerAudit = (await q(`select action from "AuditLog" where "entityId" = $1 order by at`, [storeOwner.id])).map((r) => r.action);
  assert(["user.create", "user.password_reset", "user.deactivate"].every((a) => ownerAudit.includes(a)), `audited (${ownerAudit.join(", ")})`);

  step("Stores: the opening checklist was seeded for the new store; a task is marked done with a note; the list shows progress");
  const tasks = await q(`select id, key, title, "dueAt" from "StoreTask" where "storeId" = $1 order by "sortOrder"`, [store.id]);
  assert(tasks.length === 21 && tasks[0].key === "lease" && !tasks.some((t) => t.key === "sahpra"), `${tasks.length} tasks seeded (no SAHPRA line: the store isn't licensed for THC)`);
  const cl = page.getByTestId("opening-checklist");
  await open(`/hq/stores/${storeCode}`, cl.getByRole("button", { name: "Mark done" }).first());
  await cl.getByText(`0 of ${tasks.length} done`).waitFor();
  await cl.getByRole("button", { name: "Mark done" }).first().click();
  const panel = cl.getByRole("group", { name: tasks[0].title });
  await panel.getByLabel("Note (optional)").fill(`Signed by E2E ${sfx}`);
  // The revalidated row re-renders as done (with Undo), so wait for that rather than the panel's notice.
  await act("stores.markTaskDone", () => panel.getByRole("button", { name: "Mark done" }).click(), () => cl.getByText(`Signed by E2E ${sfx}`).waitFor());
  const doneTask = await one(`select "doneAt", "doneById", note from "StoreTask" where id = $1`, [tasks[0].id]);
  assert(doneTask.doneAt && doneTask.doneById === admin.id && doneTask.note === `Signed by E2E ${sfx}`, "task done with the note, by the admin");
  assert(await one(`select 1 from "AuditLog" where action = 'store.task_done' and "entityId" = $1`, [tasks[0].id]), "audited (store.task_done)");
  await cl.getByText(`1 of ${tasks.length} done`).waitFor();
  await open(`/hq/stores?q=${storeCode}`, null);
  await page.getByText(`1/${tasks.length}`).first().waitFor();
  ok(`stores list shows the progress line 1/${tasks.length}`);
  await shot("store-checklist");

  // ── Catalogue ─────────────────────────────────────────────────────────────
  step("Catalogue: new draft CBD supplement (validation first: Schedule 0 limits and product facts), reclassify it as CBD food & drink (0.0075% limit), add + edit a variant, range and unrange it");
  const cat = await one(`select c.id, c.name from "Category" c where exists (select 1 from "Product" p where p."categoryId" = c.id and p."regClass" = 'CBD') order by c."sortOrder" limit 1`);
  await open("/hq/catalogue", page.getByRole("link", { name: /New product/ }));
  await page.getByRole("link", { name: /New product/ }).click();
  await page.waitForURL(/\/hq\/catalogue\/new$/);
  let pf = formWith("#regClass");
  await hydrated(pf);
  await pf.locator("#name").fill(T.productName);
  await pf.locator("#tagline").fill("A calm wind-down, made in small batches.");
  await pf.locator("#description").fill("Too short");
  await pf.locator("#categoryId").selectOption(cat.id);
  await pf.locator("#regClass").selectOption("CBD"); // a new product starts with no class
  assert(await pf.getByRole("button", { name: "Create product" }).isDisabled(), "Create is blocked until the Schedule 0 fields are filled");
  await pf.locator("#cbdMgPerPack").fill("300");
  await pf.locator("#cbdMgPerDay").fill("10");
  await pf.getByText("List the ingredients").waitFor();
  assert(await pf.getByRole("button", { name: "Create product" }).isDisabled(), "…and until its ingredients and allergens are declared");
  await pf.locator("#ingredients").fill("MCT oil (from coconut), broad-spectrum hemp extract (300 mg CBD), natural peppermint oil");
  await pf.getByRole("checkbox", { name: "No major allergens" }).check();
  await pf.getByText("Within Schedule 0 limits").waitFor();
  await act("catalogue.saveProduct · invalid", () => pf.getByRole("button", { name: "Create product" }).click(), () => alertIn(pf, "Write at least a sentence").waitFor());
  await pf.locator("#description").fill("A peppermint and hemp tonic for the end of a long day. Small-batch, made in the Western Cape.");
  await act("catalogue.saveProduct (create)", () => pf.getByRole("button", { name: "Create product" }).click(), () => page.getByText("Product created", { exact: true }).waitFor());
  product = await one(`select id, slug, status, "regClass", "cbdMgPerPack", "cbdMgPerDay", "legalBasis", ingredients, allergens from "Product" where name = $1`, [T.productName]);
  assert(page.url().includes(`/hq/catalogue/${product?.id}?created=1`) && product.status === "DRAFT" && product.regClass === "CBD" && product.cbdMgPerPack === 300, `draft product /p/${product?.slug} created (CBD, 300 mg per pack, "${product?.legalBasis}")`);
  assert(product.ingredients?.startsWith("MCT oil") && JSON.stringify(product.allergens) === '["none"]', "ingredients and “No major allergens” saved");
  pf = formWith("#regClass");
  await hydrated(pf);
  await pf.locator("#tagline").fill(`Small-batch calm (${sfx}).`);
  await act("catalogue.saveProduct (update)", () => pf.getByRole("button", { name: "Save product" }).click(), () => notice("Product saved.").waitFor());
  assert((await one(`select tagline from "Product" where id = $1`, [product.id])).tagline === `Small-batch calm (${sfx}).`, "tagline updated");
  // Reclassify as CBD food & drink (a 30 ml tonic): at most 0.0075% CBD of the net content, only what the hemp brings.
  await pf.locator("#regClass").selectOption("CBD_FOOD");
  await pf.locator("#netContent").fill("30");
  await pf.locator('select[name="netUnit"]').selectOption("ml");
  await pf.getByText("CBD food & drink may hold at most 2.25 mg CBD in 30 ml (0.0075%)").waitFor();
  assert(await pf.getByRole("button", { name: "Save product" }).isDisabled(), "300 mg in 30 ml is over the CBD food limit: Save is blocked");
  await pf.locator("#cbdMgPerPack").fill("2");
  await pf.locator("#thcMax").fill("0.001");
  await pf.getByRole("checkbox", { name: "Only the CBD naturally in its ingredients" }).check();
  await pf.getByText("Within the CBD food limit: 2 mg of the 2.25 mg allowed in 30 ml").waitFor();
  await act("catalogue.saveProduct (reclassify)", () => pf.getByRole("button", { name: "Save product" }).click(), () => notice("Product saved.").waitFor());
  const tonic = await one(`select "regClass", "netContent", "netUnit", "cbdMgPerPack", "cbdMgPerDay", "naturalCbd", "thcMax", "legalBasis" from "Product" where id = $1`, [product.id]);
  assert(
    tonic.regClass === "CBD_FOOD" && tonic.netContent === 30 && tonic.netUnit === "ml" && tonic.cbdMgPerPack === 2 && tonic.cbdMgPerDay == null && tonic.naturalCbd && tonic.thcMax === 0.001 && tonic.legalBasis.startsWith("CBD food"),
    "now CBD food & drink: 2 mg in 30 ml, natural CBD only, THC ≤ 0.001%, no daily dose",
  );
  assert(await one(`select 1 from "AuditLog" where action = 'compliance.product' and "entityId" = $1`, [product.id]), "reclassification audited as compliance.product");
  const vnew = formWith("#sku-new");
  await vnew.locator("#sku-new").fill(T.sku.toLowerCase());
  await vnew.locator("#name-new").fill("30ml");
  await vnew.locator("#price-new").fill("199.00");
  await vnew.locator("#wholesale-new").fill("95.00");
  await vnew.locator("#cost-new").fill("42.00");
  await act("catalogue.saveVariant (create)", () => vnew.getByRole("button", { name: "Add variant" }).click(), () => notice("30ml added.").waitFor());
  variant = await one(`select id, sku, "priceCents", "wholesaleCents", active from "Variant" where sku = $1`, [T.sku]);
  assert(variant?.priceCents === 19900 && variant.wholesaleCents === 9500 && variant.active, `variant ${T.sku} added (SKU upper-cased, RRP R199)`);
  await vnew.locator("#sku-new").fill(T.sku);
  await vnew.locator("#name-new").fill("60ml");
  await vnew.locator("#price-new").fill("349");
  await vnew.locator("#wholesale-new").fill("160");
  await vnew.locator("#cost-new").fill("70");
  await act("catalogue.saveVariant · duplicate SKU", () => vnew.getByRole("button", { name: "Add variant" }).click(), () => alertIn(vnew, "SKU already in use").waitFor());
  await vnew.getByRole("button", { name: "Cancel" }).click();
  const vf = formWith(`[id="sku-${variant.id}"]`);
  await vf.locator(`[id="price-${variant.id}"]`).fill("219.00");
  await act("catalogue.saveVariant (update)", () => vf.getByRole("button", { name: `Save ${T.sku}` }).click(), () => notice(`${T.sku} saved.`).waitFor());
  const priced = await one(`select v."priceCents", (select action from "AuditLog" a where a."entityId" = v.id order by at desc limit 1) action from "Variant" v where v.id = $1`, [variant.id]);
  assert(priced.priceCents === 21900 && priced.action === "variant.price", "RRP now R219, audited as a price change");
  const rf = formWith("#rv-variant");
  await rf.locator("#rv-variant").selectOption(variant.id);
  // The region's least common store format (formats are random in generated networks): the fewest stores to range.
  const { format: fmt, n: matching } = await one(`select format, count(*)::int n from "Store" where kind = 'RETAIL' and status <> 'CLOSED' and "regionId" = $1 group by format order by 2, 1 limit 1`, [area.regionId]);
  await rf.locator("#rv-format").selectOption(fmt);
  await rf.locator("#rv-region").selectOption(area.regionId);
  await act("catalogue.rangeVariant (range)", () => rf.getByRole("button", { name: "Range at matching stores" }).click(), () => notice(new RegExp(`${esc(T.sku)} (ranged at ${matching} more store|was already ranged)`)).waitFor());
  const rangedAt = await q(`select s.code from "StoreVariant" sv join "Store" s on s.id = sv."storeId" where sv."variantId" = $1`, [variant.id]);
  assert(rangedAt.length === matching && matching > 0, `ranged at the ${area.name} ${fmt.toLowerCase()} stores only: ${rangedAt.map((r) => r.code).join(", ")}`);
  await act("catalogue.rangeVariant (unrange)", () => rf.getByRole("button", { name: "Unrange" }).click(), () => notice(`${T.sku} unranged at ${matching} store`).waitFor());
  assert(!(await one(`select 1 from "StoreVariant" where "variantId" = $1`, [variant.id])), "unranged again");
  await shot("product");

  step("Catalogue: a category — add it (slug from the name, copy screened), edit it, move it up, delete it once empty");
  await open("/hq/catalogue/categories", formWith("#cat-name"));
  let catForm = formWith("#cat-name");
  await catForm.locator("#cat-name").fill(T.categoryName);
  assert((await catForm.locator("#cat-slug").inputValue()) === `e2e-tonics-${sfx}`, "slug follows the name");
  await catForm.locator("#cat-blurb").fill("Detox tonics for the weekend");
  await act("categories.saveCategory · health claim", () => catForm.getByRole("button", { name: "Add category" }).click(), () => alertIn(catForm, "Health claim").waitFor());
  await catForm.locator("#cat-blurb").fill("Rooibos and hemp tonics, served cold.");
  await catForm.getByRole("radio", { name: "Drink" }).check({ force: true });
  await act("categories.saveCategory (create)", () => catForm.getByRole("button", { name: "Add category" }).click(), () => notice(`“${T.categoryName}” added`).waitFor());
  const category = await one(`select id, slug, icon, "sortOrder" from "Category" where name = $1`, [T.categoryName]);
  assert(category?.slug === `e2e-tonics-${sfx}` && category.icon === "CupSoda" && (await one(`select 1 from "AuditLog" where action = 'category.create' and "entityId" = $1`, [category.id])), `category /shop?category=${category?.slug} added (audited)`);
  const catRow = () => page.locator("tr").filter({ hasText: `/shop?category=e2e-tonics-${sfx}` });
  await catRow().getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/edit=/);
  catForm = formWith("#cat-name");
  await hydrated(catForm);
  await catForm.locator("#cat-name").fill(`${T.categoryName} & more`);
  await act("categories.saveCategory (update)", () => catForm.getByRole("button", { name: "Save category" }).click(), () => notice(`“${T.categoryName} & more” saved.`).waitFor());
  assert((await one(`select name, slug from "Category" where id = $1`, [category.id])).slug === `e2e-tonics-${sfx}`, "renamed; the URL slug stays");
  await act("categories.moveCategory", () => catRow().getByRole("button", { name: /up$/ }).click(), async () => {
    if (!(await until(async () => (await one(`select "sortOrder" from "Category" where id = $1`, [category.id])).sortOrder < category.sortOrder))) fail("category didn't move up");
  });
  ok("moved up one place (audited as category.reorder)");
  await catRow().getByRole("button", { name: "Delete" }).click();
  await act("categories.deleteCategory", () => page.getByRole("group", { name: /^Delete E2E Tonics/ }).getByRole("button", { name: "Delete", exact: true }).click(), () => notice(`“${T.categoryName} & more” deleted.`).waitFor());
  assert(!(await one(`select 1 from "Category" where id = $1`, [category.id])), "deleted (it was empty)");

  step(`Catalogue import: download the template, upload three rows (two new, one with an unknown category) with opening stock at ${dc.name}, check the dry run, import`);
  await open("/hq/catalogue", page.getByRole("link", { name: "Import", exact: true }));
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await page.waitForURL(/\/hq\/catalogue\/import$/);
  const uf = formWith("#import-file");
  await hydrated(uf);
  let tpl;
  await act("catalogue import template (download)", async () => {
    [tpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download the template" }).click()]);
  }, async () => tpl.saveAs(`${out}/catalogue-template.csv`), { action: false });
  const header = readFileSync(`${out}/catalogue-template.csv`, "utf8").replace(/^﻿/, "").split(/\r?\n/)[0];
  const cols = header.split(",");
  assert(tpl.suggestedFilename() === "herbal-holland_catalogue-import-template.csv" && header.startsWith("sku,product,variant,category,class,rrp_incl_vat,wholesale_excl_vat,cost_excl_vat") && cols.includes("stock"), `template ${tpl.suggestedFilename()}: ${cols.length} columns, required first`);
  const shelf = (await one(`select name from "Category" order by (slug = 'accessories') desc, "sortOrder" limit 1`)).name;
  const noSuchCategory = `E2E No Such Category ${sfx}`;
  const cell = (v = "") => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const importRows = [
    { sku: `${T.importSku}-250`, product: T.importName, variant: "250 ml", category: shelf, class: "ACCESSORY", rrp_incl_vat: "189.00", wholesale_excl_vat: "85.00", cost_excl_vat: "45.00", description: "An airtight glass jar with a bamboo lid, for keeping things fresh.", stock: "12" },
    { sku: `${T.importSku}-500`, product: T.importName, variant: "500 ml", category: shelf, class: "ACCESSORY", rrp_incl_vat: "R249", wholesale_excl_vat: "112", cost_excl_vat: "60", stock: "6" },
    { sku: `${T.importSku}-X`, product: `E2E Import Mystery ${sfx}`, variant: "One size", category: noSuchCategory, class: "ACCESSORY", rrp_incl_vat: "99", wholesale_excl_vat: "40", cost_excl_vat: "20", description: "A category that doesn't exist, so this row is refused." },
  ];
  const importCsv = [header, ...importRows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  await uf.locator("#import-file").setInputFiles({ name: T.importFile, mimeType: "text/csv", buffer: Buffer.from(importCsv) });
  await uf.locator("#import-at").selectOption(dc.id);
  await act("catalogueImport.uploadCatalogue (dry run)", () => uf.getByRole("button", { name: "Check the file" }).click(), () => page.getByText(`Unknown category “${noSuchCategory}”`).first().waitFor());
  const tabCount = async (name) => Number(await page.getByRole("link", { name: new RegExp(`^${name}\\s*\\d+$`) }).locator("span").last().textContent());
  assert(page.url().includes("file=") && (await tabCount("New")) === 2 && (await tabCount("Errors")) === 1, "dry run: 2 new rows, 1 error (unknown category, never created)");
  assert(!(await one(`select 1 from "Product" where name = $1`, [T.importName])), "nothing written by the dry run");
  await shot("catalogue-import-preview");
  await act("catalogueImport.importCatalogue", () => page.getByRole("button", { name: "Import", exact: true }).click(), () => notice(`Imported: 1 new product, 2 new variants; 18 units of opening stock at ${dc.name}. 1 row with errors was skipped.`).waitFor());
  const imported = await one(`select p.id, p.status, p."regClass", c.name category from "Product" p join "Category" c on c.id = p."categoryId" where p.name = $1`, [T.importName]);
  const importedVariants = await q(
    `select v.sku, v."priceCents", v."wholesaleCents", v."costCents",
       (select coalesce(sum(sl."onHand"), 0) from "StockLevel" sl where sl."variantId" = v.id and sl."storeId" = $2)::int "atDc",
       (select count(*) from "StockMovement" m where m."variantId" = v.id and m.type = 'RECEIVE' and m.reason = 'CORRECTION' and m."storeId" = $2)::int moves
     from "Variant" v where v."productId" = $1 order by v."sortOrder"`,
    [imported?.id ?? "", dc.id],
  );
  assert(
    imported?.status === "DRAFT" && imported.category === shelf && JSON.stringify(importedVariants.map((v) => [v.sku, v.priceCents, v.wholesaleCents, v.costCents, v.atDc, v.moves])) === JSON.stringify([[`${T.importSku}-250`, 18900, 8500, 4500, 12, 1], [`${T.importSku}-500`, 24900, 11200, 6000, 6, 1]]),
    `“${T.importName}” created in draft: RRP R189 and R249 in cents; 12 + 6 received at ${dc.code} (reason Correction)`,
  );
  const importLog = await one(`select a.data from "AuditLog" a join "Upload" u on u.id = a."entityId" where a.action = 'catalogue.import' and u."fileName" = $1`, [T.importFile]);
  assert(importLog?.data.created.products === 1 && importLog.data.created.variants === 2 && importLog.data.skipped === 1 && importLog.data.stock?.units === 18 && !(await one(`select 1 from "Category" where name = $1`, [noSuchCategory])), "one catalogue.import audit entry with the counts; the unknown category wasn't created");
  assert(await page.getByRole("button", { name: "Import", exact: true }).count() === 0 && (await page.getByText(/^Imported \d/).count()) === 1, "the file shows as imported (it can't be imported twice)");

  // ── Fixtures (SQL) for the rest of the run ────────────────────────────────
  step(`Fixtures: a batch of ${T.sku} at ${dc.name}, a throwaway member homed at the test store, an unpaid order`);
  batch = await one(`insert into "Batch" (id, code, "variantId", supplier, "packedAt", "expiresAt") values (gen_random_uuid()::text, $1, $2, 'E2E Supplier', now() - interval '10 days', now() + interval '400 days') returning id, code`, [T.batchCode, variant.id]);
  await q(`insert into "StockLevel" (id, "storeId", "variantId", "batchId", "onHand", "unitCostCents", "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, 6, 4200, now())`, [dc.id, variant.id, batch.id]);
  const phone = await freePhone();
  let memberNo;
  while (!memberNo) {
    const m = `HH9${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
    if (!(await one(`select 1 from "Customer" where "memberNo" = $1`, [m]))) memberNo = m;
  }
  member = await one(
    `insert into "Customer" (id, "memberNo", phone, email, "firstName", "lastName", dob, "ageCheck", "ageVerifiedAt", "homeStoreId", "referralCode", "consentSms", "consentEmail", "consentAt", points, interests, "termsVersion", "termsAcceptedAt", source)
     values (gen_random_uuid()::text, $1, $2, $3, 'E2E', $4, '1991-03-14', 'ID_NUMBER', now(), $5, $6, true, true, now(), 25, '{CBD}', '2026-09-27', now(), 'E2E') returning id, "memberNo", phone, email`,
    [memberNo, phone, T.memberEmail, `Member ${sfx}`, store.id, `E2EX${SFX}`],
  );
  await q(`insert into "LoyaltyEntry" (id, "customerId", points, kind, note) values (gen_random_uuid()::text, $1, 25, 'SIGNUP', 'Welcome to Herbal Holland Rewards')`, [member.id]);
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let orderCode;
  while (!orderCode) {
    const c = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
    if (!(await one(`select 1 from "Order" where code = $1`, [c]))) orderCode = c;
  }
  order = await one(
    `insert into "Order" (id, code, "customerId", "storeId", status, fulfilment, "routingNote", "subtotalCents", "totalCents", "vatCents", "payMethod", "paymentStatus", "collectionCode", events, "updatedAt")
     values (gen_random_uuid()::text, $1, $2, $3, 'PLACED', 'COLLECT', 'E2E fixture', 21900, 21900, 2857, 'CARD', 'UNPAID', '482913', $4::jsonb, now()) returning id, code`,
    [orderCode, member.id, store.id, JSON.stringify([{ status: "PLACED", at: new Date().toISOString(), note: "E2E fixture: pay in store" }])],
  );
  await q(`insert into "OrderLine" (id, "orderId", "variantId", qty, "unitPriceCents", "totalCents") values (gen_random_uuid()::text, $1, $2, 1, 21900, 21900)`, [order.id, variant.id]);
  ok(`batch ${batch.code} (6 at ${dc.code}), member ${member.memberNo}, order ${order.code}`);

  // ── Batches ───────────────────────────────────────────────────────────────
  step("Batches: lab results (validation first), quarantine (reason required) and release");
  await open(`/hq/batches?q=${T.batchCode}`, page.getByRole("link", { name: T.batchCode }));
  await page.getByRole("link", { name: T.batchCode }).click();
  await page.waitForURL(`**/hq/batches/${batch.id}`);
  const lab = formWith("#coaRef");
  await hydrated(lab);
  await lab.locator("#cbd").fill("150");
  await act("batches.saveLabResults · invalid", () => lab.getByRole("button", { name: "Save lab results" }).click(), () => alertIn(lab, "0–100%").waitFor());
  await lab.locator("#thc").fill("0");
  await lab.locator("#cbd").fill("12.5");
  await lab.locator("#moisturePct").fill("8");
  await lab.locator("#coaRef").fill(`COA-${SFX}`);
  await lab.locator("#labName").fill("E2E Analytical (SANAS T0000)");
  for (const k of ["microbials", "mycotoxins", "pesticides", "heavyMetals"]) await lab.locator(`#${k}`).selectOption("PASS");
  await lab.locator("#residualSolvents").selectOption("N/A");
  await lab.getByLabel("Terpene 1", { exact: true }).fill("Myrcene");
  await lab.getByLabel("Terpene 1 %").fill("0.4");
  await act("batches.saveLabResults", () => lab.getByRole("button", { name: "Save lab results" }).click(), () => notice("Lab results saved.").waitFor());
  const b1 = await one(`select thc, cbd, "coaRef", "labResults" from "Batch" where id = $1`, [batch.id]);
  assert(b1.cbd === 12.5 && b1.coaRef === `COA-${SFX}` && b1.labResults.microbials === "PASS" && b1.labResults.residualSolvents === "N/A" && b1.labResults.terpenes?.[0]?.name === "Myrcene", "COA, panel and terpenes saved");
  await page.getByRole("button", { name: "Quarantine batch" }).click();
  const qp = page.getByRole("group", { name: "Quarantine this batch" });
  await act("batches.setBatchStatus · no reason", () => qp.getByRole("button", { name: "Quarantine now" }).click(), () => alertIn(qp, "Give a reason").waitFor());
  await qp.locator("#q-reason").fill("E2E: awaiting a microbial re-test");
  await act("batches.setBatchStatus (quarantine)", () => qp.getByRole("button", { name: "Quarantine now" }).click(), () => notice("Batch quarantined — it can't be sold or shipped until released.").waitFor());
  assert((await one(`select status from "Batch" where id = $1`, [batch.id])).status === "QUARANTINE", "batch quarantined");
  await page.getByRole("button", { name: "Release batch" }).click();
  const rp = page.getByRole("group", { name: "Release for sale" });
  await rp.locator("#r-reason").fill("E2E: re-test passed");
  await act("batches.setBatchStatus (release)", () => rp.getByRole("button", { name: "Release", exact: true }).click(), () => notice("Batch released for sale.").waitFor());
  assert((await one(`select status from "Batch" where id = $1`, [batch.id])).status === "RELEASED", "batch released");
  await shot("batch");

  // ── Distribution ──────────────────────────────────────────────────────────
  step(`Distribution: three orders from ${dc.name} to the test store — approve + ship, reject, approve + cancel`);
  const mkOrder = async (qty) => {
    const nn = (await one(`insert into "Counter" (key, value) values ('PO', 1) on conflict (key) do update set value = "Counter".value + 1 returning value`)).value;
    const sub = qty * 9500;
    const o = await one(
      `insert into "StockOrder" (id, number, kind, status, "buyerId", "sellerId", "subtotalCents", "vatCents", "totalCents", notes, "createdById", "submittedAt")
       values (gen_random_uuid()::text, $1, 'WHOLESALE', 'SUBMITTED', $2, $3, $4, $5, $6, 'E2E fixture', $7, now()) returning id, number`,
      [`PO-${String(nn).padStart(6, "0")}`, store.id, dc.id, sub, Math.round(sub * 0.15), sub + Math.round(sub * 0.15), admin.id],
    );
    await q(`insert into "StockOrderLine" (id, "stockOrderId", "variantId", qty, "unitCostCents") values (gen_random_uuid()::text, $1, $2, $3, 9500)`, [o.id, variant.id, qty]);
    return o;
  };
  const poShip = await mkOrder(2), poReject = await mkOrder(1), poCancel = await mkOrder(1);
  await open(`/hq/distribution?dc=${dc.code}`, page.getByRole("row").filter({ hasText: poShip.number }).getByRole("button", { name: "Approve" }));
  await act("distribution.actOnDcOrder (approve, from the list)", () => page.getByRole("row").filter({ hasText: poShip.number }).getByRole("button", { name: "Approve" }).click(), () => notice(`${poShip.number} approved — ready to pick for ${T.storeName}.`).waitFor());
  assert(page.url().includes("/hq/distribution?") && (await one(`select status from "StockOrder" where id = $1`, [poShip.id])).status === "APPROVED", `${poShip.number} approved; back on the list with a confirmation`);
  await open(`/hq/distribution/${poShip.id}`, page.getByRole("button", { name: "Ship order" }));
  await page.getByRole("button", { name: "Ship order" }).click();
  const sp = page.getByRole("group", { name: "Ship now?" });
  await act("distribution.actOnDcOrder (ship)", () => sp.getByRole("button", { name: "Confirm shipment" }).click(), () => notice(`Shipped 2 units to ${T.storeName}.`).waitFor());
  const shipped = await one(`select o.status, l.shipped, (select "onHand" from "StockLevel" where "storeId" = $2 and "batchId" = $3) left from "StockOrder" o join "StockOrderLine" l on l."stockOrderId" = o.id where o.id = $1`, [poShip.id, dc.id, batch.id]);
  assert(shipped.status === "SHIPPED" && shipped.shipped?.[0]?.batchId === batch.id && shipped.shipped[0].qty === 2 && shipped.left === 4, `shipped 2 from batch ${batch.code} (FEFO); ${dc.code} holds 4`);
  await open(`/hq/distribution/${poReject.id}`, page.getByRole("button", { name: "Reject", exact: true }));
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const rj = page.getByRole("group", { name: "Reject this order" });
  await act("distribution.actOnDcOrder · no reason", () => rj.getByRole("button", { name: "Reject order" }).click(), () => alertIn(rj, "Give the store a reason.").waitFor());
  await rj.locator("#reject-reason").fill("E2E: duplicate of another order");
  await act("distribution.actOnDcOrder (reject)", () => rj.getByRole("button", { name: "Reject order" }).click(), () => notice(`${poReject.number} rejected; the store can see why.`).waitFor());
  const rej = await one(`select status, notes from "StockOrder" where id = $1`, [poReject.id]);
  assert(rej.status === "REJECTED" && /Rejected by HQ \(.+\): E2E: duplicate/.test(rej.notes), "rejected, reason on the order for the store");
  await open(`/hq/distribution/${poCancel.id}`, page.getByRole("button", { name: "Approve order" }));
  await act("distribution.actOnDcOrder (approve)", () => page.getByRole("button", { name: "Approve order" }).click(), () => notice(`${poCancel.number} approved`).waitFor());
  await page.getByRole("button", { name: "Cancel order" }).click();
  const cp = page.getByRole("group", { name: "Cancel this order" });
  await cp.locator("#cancel-reason").fill("E2E: store asked us to cancel");
  await act("distribution.actOnDcOrder (cancel)", () => cp.getByRole("button", { name: "Cancel order" }).click(), () => notice(`${poCancel.number} cancelled.`).waitFor());
  assert((await one(`select status from "StockOrder" where id = $1`, [poCancel.id])).status === "CANCELLED", "approved order cancelled");

  step("Batches: recall the fixture batch (type-to-confirm; nobody bought it, so nobody is messaged)");
  await open(`/hq/batches/${batch.id}`, page.getByRole("button", { name: "Recall batch" }));
  await page.getByRole("button", { name: "Recall batch" }).click();
  const rc = page.getByRole("group", { name: "Recall this batch" });
  await rc.locator("#rc-reason").fill("E2E: potency label misprint");
  assert(await rc.getByRole("button", { name: "Recall and notify" }).isDisabled(), "recall stays locked until the batch code is typed");
  await rc.locator("#confirm-phrase").fill(T.batchCode.toLowerCase());
  await act("batches.setBatchStatus (recall)", () => rc.getByRole("button", { name: "Recall and notify" }).click(), () => notice(/^Batch recalled\. 0 members notified by SMS/).waitFor());
  const recall = await one(`select a.id, a."requiresAck", b.status from "Announcement" a, "Batch" b where b.id = $1 and a.kind = 'RECALL' and a.title like $2`, [batch.id, `%batch ${T.batchCode}`]);
  assert(recall?.status === "RECALLED" && recall.requiresAck, "batch recalled; recall notice raised for every store to acknowledge");
  await page.getByText("Recalled — blocked everywhere").waitFor();
  await shot("recalled");
  await q(`delete from "Announcement" where id = $1`, [recall.id]); // test data: don't leave a recall notice on every store's dashboard
  ok("test recall notice removed again");

  // ── Compliance ────────────────────────────────────────────────────────────
  step("Compliance: guardrails (adult-use switch, minimum age), change a rule and restore it");
  await open("/hq/compliance", formWith("#minAge"));
  const rules = formWith("#minAge");
  const orig = { minAge: await rules.locator("#minAge").inputValue(), daily: await rules.locator("#dailyLimitGrams").inputValue() };
  const compBefore = await setting("compliance");
  await rules.getByRole("radio", { name: /Adult use/ }).click();
  await rules.locator("#confirmAdult").waitFor();
  await act("compliance.saveCompliance · adult use unconfirmed", () => rules.getByRole("button", { name: "Save compliance rules" }).click(), () => alertIn(rules, "Type ADULT USE to confirm the switch").waitFor());
  await rules.getByRole("radio", { name: /Medical/ }).click();
  await rules.locator("#minAge").fill("16");
  await act("compliance.saveCompliance · under 18", () => rules.getByRole("button", { name: "Save compliance rules" }).click(), () => alertIn(rules, "Between 18 and 25 — never below 18").waitFor());
  assert(JSON.stringify(await setting("compliance")) === JSON.stringify(compBefore), "nothing saved (still medical mode, minimum age unchanged)");
  await rules.locator("#minAge").fill(orig.minAge);
  const daily = String(Number(orig.daily) + 1);
  await rules.locator("#dailyLimitGrams").fill(daily);
  await act("compliance.saveCompliance", () => rules.getByRole("button", { name: "Save compliance rules" }).click(), () => notice("Compliance rules saved (dailyLimitGrams)").waitFor());
  let comp = await setting("compliance");
  assert(comp?.dailyLimitGrams === Number(daily) && comp.thcMode === "MEDICAL" && String(comp.minAge) === orig.minAge && comp.licensedOnly.includes("THC"), `daily limit ${orig.daily} → ${daily} g saved; THC still licence-gated`);
  await rules.locator("#dailyLimitGrams").fill(orig.daily);
  await act("compliance.saveCompliance (restore)", () => rules.getByRole("button", { name: "Save compliance rules" }).click(), () => notice("Compliance rules saved (dailyLimitGrams)").waitFor());
  comp = await setting("compliance");
  assert(String(comp?.dailyLimitGrams) === orig.daily, `restored to ${orig.daily} g`);
  await restoreSetting("compliance");

  step("Compliance: a THC licence on the test store (reference required), then removed");
  await page.getByPlaceholder("Find a store").fill(storeCode);
  await page.getByPlaceholder("Find a store").press("Enter");
  await page.waitForURL(new RegExp(`/hq/compliance\\?q=${storeCode}`));
  const lic = formWith(`[aria-label="${T.storeName} licence reference"]`);
  await hydrated(lic);
  await lic.getByLabel("THC", { exact: true }).check();
  await act("compliance.saveLicences · no reference", () => lic.getByRole("button", { name: "Save" }).click(), () => alertIn(lic, "Record the licence or permit number").waitFor());
  await lic.getByLabel(`${T.storeName} licence reference`).fill(`E2E-LIC-${SFX}`);
  await act("compliance.saveLicences", () => lic.getByRole("button", { name: "Save" }).click(), () => notice("Licences saved.").waitFor());
  let l1 = await one(`select licences::text[] licences, "licenceRef" from "Store" where id = $1`, [store.id]);
  assert(l1.licences.join() === "THC" && l1.licenceRef === `E2E-LIC-${SFX}`, "THC licence recorded with its reference");
  await lic.getByLabel("THC", { exact: true }).uncheck();
  await act("compliance.saveLicences (remove)", () => lic.getByRole("button", { name: "Save" }).click(), () => notice("Licence removed: THC").waitFor());
  l1 = await one(`select licences::text[] licences from "Store" where id = $1`, [store.id]);
  assert(l1.licences.length === 0, "licence removed; THC blocked at the store again");

  // ── Pricing ───────────────────────────────────────────────────────────────
  step("Pricing: a price list for the test variant at the test store (create, edit, delete)");
  await open("/hq/pricing", page.getByRole("link", { name: /New price list/ }));
  await page.getByRole("link", { name: /New price list/ }).click();
  await page.waitForURL(/\/hq\/pricing\/new$/);
  let plf = formWith("#adjustPct");
  await hydrated(plf);
  await plf.locator("#name").fill(T.listName);
  await act("pricing.savePriceList · empty", () => plf.getByRole("button", { name: "Save price list" }).click(), () => alertIn(plf, "Add at least one item price, or set a blanket adjustment").waitFor());
  await plf.locator("#channel").selectOption("ONLINE");
  await plf.getByLabel("Item 1", { exact: true }).selectOption(variant.id);
  await plf.getByLabel("Price 1", { exact: true }).fill("189.00");
  await plf.getByPlaceholder("Search stores…").fill(storeCode);
  await plf.getByRole("checkbox", { name: new RegExp(storeCode) }).check();
  await act("pricing.savePriceList (create)", () => plf.getByRole("button", { name: "Save price list" }).click(), () => notice("Price list created.").waitFor());
  let pl = await one(`select l.id, l.kind, l.channel, l."storeIds", l.active, i."priceCents" from "PriceList" l join "PriceListItem" i on i."priceListId" = l.id where l.name = $1`, [T.listName]);
  assert(pl && page.url().includes(`/hq/pricing/${pl.id}`) && pl.kind === "ZONE" && pl.channel === "ONLINE" && pl.storeIds.join() === store.id && pl.priceCents === 18900, "online zone list for the test store: R189");
  plf = formWith("#adjustPct");
  await hydrated(plf);
  await plf.getByLabel("Price 1", { exact: true }).fill("179.00");
  await act("pricing.savePriceList (update)", () => plf.getByRole("button", { name: "Save price list" }).click(), () => notice(/^Saved\. Tills and the web shop use it/).waitFor());
  assert((await one(`select "priceCents" from "PriceListItem" where "priceListId" = $1`, [pl.id])).priceCents === 17900, "item price now R179");
  await headerOf().getByRole("button", { name: "Delete" }).click();
  const dl = page.getByRole("group", { name: "Delete this price list?" });
  assert(await dl.getByRole("button", { name: "Delete price list" }).isDisabled(), "delete needs DELETE typed");
  await dl.locator("#confirm-phrase").fill("delete");
  await act("pricing.deletePriceList", () => dl.getByRole("button", { name: "Delete price list" }).click(), () => notice(`“${T.listName}” deleted`).waitFor());
  assert(!(await one(`select 1 from "PriceList" where id = $1`, [pl.id])) && !(await one(`select 1 from "PriceListItem" where "priceListId" = $1`, [pl.id])), "price list and its items deleted");

  step("Pricing: rules (store margin guide) changed and restored");
  await open("/hq/pricing", formWith("#minMarginPct"));
  const pr = formWith("#minMarginPct");
  const origMargin = await pr.locator("#minMarginPct").inputValue();
  await pr.locator("#minMarginPct").fill("95");
  await act("pricing.savePricingRules · invalid", () => pr.getByRole("button", { name: "Save rules" }).click(), () => alertIn(pr, "0–80").waitFor());
  await pr.locator("#minMarginPct").fill(String(Number(origMargin) + 1));
  await act("pricing.savePricingRules", () => pr.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Saved\. (Stock within|Near-expiry)/).waitFor());
  assert((await setting("pricing"))?.minMarginPct === Number(origMargin) + 1, `margin guide ${origMargin}% → ${Number(origMargin) + 1}%`);
  await pr.locator("#minMarginPct").fill(origMargin);
  await act("pricing.savePricingRules (restore)", () => pr.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Saved\. (Stock within|Near-expiry)/).waitFor());
  assert(String((await setting("pricing"))?.minMarginPct) === origMargin, `restored to ${origMargin}%`);
  await restoreSetting("pricing");

  // ── Promotions ────────────────────────────────────────────────────────────
  step("Promotions: a coded online deal on the test product (create, edit, pause, resume)");
  await open("/hq/promotions", page.getByRole("link", { name: /New promotion/ }));
  await page.getByRole("link", { name: /New promotion/ }).click();
  await page.waitForURL(/\/hq\/promotions\/new$/);
  let prf = formWith("#maxUses");
  await hydrated(prf);
  await prf.locator("#name").fill(T.promoName);
  await prf.locator("#percent").fill("0");
  await prf.getByPlaceholder("Search products…").first().fill(T.productName);
  await prf.getByRole("checkbox", { name: T.productName }).check();
  await prf.getByLabel("In store", { exact: true }).uncheck();
  await prf.locator("#code").fill(T.promoCode.toLowerCase());
  await prf.locator("#maxUses").fill("5");
  await act("promotions.savePromotion · invalid", () => prf.getByRole("button", { name: "Save promotion" }).click(), () => alertIn(prf, "Whole percent, 1–100").waitFor());
  await prf.locator("#percent").fill("10");
  await act("promotions.savePromotion (create)", () => prf.getByRole("button", { name: "Save promotion" }).click(), () => notice("Promotion created.").waitFor());
  const promo = await one(`select id, kind, value, code, "productIds", channels::text[] channels, "maxUses", active from "Promotion" where name = $1`, [T.promoName]);
  assert(promo && promo.kind === "PERCENT" && promo.value === 10 && promo.code === T.promoCode && promo.productIds.join() === product.id && promo.channels.join() === "ONLINE" && promo.maxUses === 5, `10% off the test product online with code ${T.promoCode} (max 5 uses)`);
  prf = formWith("#maxUses");
  await hydrated(prf);
  await prf.locator("#percent").fill("15");
  await act("promotions.savePromotion (update)", () => prf.getByRole("button", { name: "Save promotion" }).click(), () => notice("Promotion saved — tills pick it up on the next basket.").waitFor());
  assert((await one(`select value from "Promotion" where id = $1`, [promo.id])).value === 15, "now 15% off");
  await act("promotions.setPromotionActive (pause)", () => headerOf().getByRole("button", { name: "Pause" }).click(), () => notice("Promotion paused — it stops applying immediately.").waitFor());
  assert((await one(`select active from "Promotion" where id = $1`, [promo.id])).active === false, "paused");
  await act("promotions.setPromotionActive (resume)", () => headerOf().getByRole("button", { name: "Resume" }).click(), () => notice("Promotion resumed.").waitFor());
  assert((await one(`select active from "Promotion" where id = $1`, [promo.id])).active === true, "resumed");
  await shot("promotion");

  // ── Drops ─────────────────────────────────────────────────────────────────
  step("Drops: schedule a drop of the test variant a year out (validation first), edit it, delete it");
  await open("/hq/drops", page.getByRole("link", { name: /New drop/ }));
  await page.getByRole("link", { name: /New drop/ }).click();
  await page.waitForURL(/\/hq\/drops\/new$/);
  let df = formWith("#perMemberLimit");
  await hydrated(df);
  await df.locator("#name").fill(T.dropName);
  await df.locator("#blurb").fill("A numbered first run for the end-to-end test. One per member.");
  await df.locator("#startsAt").fill(weekdayAt(365, 10));
  await act("drops.saveDrop · no products", () => df.getByRole("button", { name: "Schedule drop" }).click(), () => alertIn(df, "Pick at least one product").waitFor());
  await df.getByPlaceholder("Search products or SKUs…").fill(T.productName);
  await df.getByRole("checkbox", { name: new RegExp(`^${esc(T.productName)} — 30ml`) }).check();
  await act("drops.saveDrop (create)", () => df.getByRole("button", { name: "Schedule drop" }).click(), () => notice(`“${T.dropName}” is scheduled.`).waitFor());
  const drop = await one(`select id, slug, "variantIds", "perMemberLimit", "membersOnly" from "Drop" where name = $1`, [T.dropName]);
  assert(drop && page.url().includes(`/hq/drops/${drop.id}`) && drop.variantIds.join() === variant.id && drop.perMemberLimit === 1 && drop.membersOnly, `drop /drops/${drop?.slug} scheduled (1 per member, members only)`);
  df = formWith("#perMemberLimit");
  await hydrated(df);
  await df.locator("#perMemberLimit").fill("2");
  await act("drops.saveDrop (update)", () => df.getByRole("button", { name: "Save drop" }).click(), () => notice(/^Drop saved\./).waitFor());
  assert((await one(`select "perMemberLimit" from "Drop" where id = $1`, [drop.id])).perMemberLimit === 2, "limit now 2 per member");
  await page.getByRole("button", { name: "Delete drop" }).click();
  const dd = page.getByRole("group", { name: `Delete “${T.dropName}”?` });
  await act("drops.deleteDrop", () => dd.getByRole("button", { name: "Delete drop" }).click(), () => notice(`“${T.dropName}” deleted`).waitFor());
  assert(page.url().includes("/hq/drops") && !(await one(`select 1 from "Drop" where id = $1`, [drop.id])), "drop deleted; back on the drops list");

  // ── Events ────────────────────────────────────────────────────────────────
  step("Events: a members' evening at the test store (validation first, create, edit, delete)");
  await open("/hq/events", page.getByRole("link", { name: /New event/ }));
  await page.getByRole("link", { name: /New event/ }).click();
  await page.waitForURL(/\/hq\/events\/new$/);
  let ef = formWith("#ev-cap");
  await hydrated(ef);
  await ef.locator("#ev-store").selectOption(store.id);
  await ef.locator("#ev-title").fill(T.eventTitle);
  await ef.locator("#ev-blurb").fill("Meet the team and taste Rooibos tea. Adults 18+, ID at the door.");
  const yesterday = localInput(new Date(Date.now() - 86_400_000)).slice(0, 10);
  await ef.locator("#ev-start").fill(`${yesterday}T18:00`);
  await ef.locator("#ev-end").fill(`${yesterday}T21:00`);
  await ef.locator("#ev-cap").fill("20");
  await act("events.saveEvent · in the past", () => ef.getByRole("button", { name: "Create event" }).click(), () => alertIn(ef, "Must be in the future").waitFor());
  const evDay = weekdayAt(60, 18).slice(0, 10);
  await ef.locator("#ev-start").fill(`${evDay}T18:00`);
  await ef.locator("#ev-end").fill(`${evDay}T21:00`);
  await act("events.saveEvent (create)", () => ef.getByRole("button", { name: "Create event" }).click(), () => notice(new RegExp(`^“${esc(T.eventTitle)}” at ${esc(T.storeName)} is on for`)).waitFor());
  const ev = await one(`select id, slug, capacity, "storeId" from "StoreEvent" where title = $1`, [T.eventTitle]);
  assert(ev && page.url().includes(`/hq/events/${ev.id}`) && ev.storeId === store.id && ev.capacity === 20, `event /events/${ev?.slug} created at the test store (20 places)`);
  ef = formWith("#ev-cap");
  await hydrated(ef);
  await ef.locator("#ev-cap").fill("25");
  await act("events.saveEvent (update)", () => ef.getByRole("button", { name: "Save event" }).click(), () => notice("Event saved.").waitFor());
  assert((await one(`select capacity from "StoreEvent" where id = $1`, [ev.id])).capacity === 25, "capacity now 25");
  await page.getByRole("button", { name: "Delete event" }).click();
  const de = page.getByRole("group", { name: `Delete “${T.eventTitle}”?` });
  await act("events.deleteEvent", () => de.getByRole("button", { name: "Delete event" }).click(), () => notice(`“${T.eventTitle}” deleted.`).waitFor());
  assert(!(await one(`select 1 from "StoreEvent" where id = $1`, [ev.id])), "event deleted");

  // ── Campaigns ─────────────────────────────────────────────────────────────
  step("Campaigns: live reach for an “Into …” interest audience, then for the test store's members");
  await open("/hq/marketing", page.getByRole("link", { name: /New campaign/ }));
  await page.getByRole("link", { name: /New campaign/ }).click();
  await page.waitForURL(/\/hq\/marketing\/new/);
  let cf = formWith("#segment");
  await hydrated(cf);
  const reachBox = cf.locator('[aria-live="polite"]').filter({ hasText: "reachable" });
  const readReach = async () => {
    const m = (await reachBox.innerText()).match(/([\d,]+)\s*reachable[\s\S]*?of ([\d,]+) in the audience/);
    return m ? { reachable: Number(m[1].replace(/,/g, "")), total: Number(m[2].replace(/,/g, "")) } : null;
  };
  const audience = (storeId) =>
    one(`select count(*)::int total, (count(*) filter (where "consentSms"))::int reachable from "Customer" where interests @> '{CBD}' and ($1::text is null or "homeStoreId" = $1)`, [storeId ?? null]);
  await until(readReach); // the all-members estimate has loaded
  const label = await cf.locator('#segment option[value="interest:CBD"]').textContent();
  assert(label === "Into CBD & wellness", `audience option “${label}”`);
  const lo = await audience();
  let shown;
  await act("marketing.estimateReach (Into CBD & wellness)", () => cf.locator("#segment").selectOption("interest:CBD"), async () => {
    shown = await until(async () => {
      const r = await readReach();
      const hi = await audience();
      return r && r.total >= lo.total && r.total <= hi.total && r.reachable >= lo.reachable && r.reachable <= hi.reachable ? r : null;
    });
    if (!shown) fail(`reach never matched the database (${JSON.stringify(await readReach())} vs ${JSON.stringify(lo)})`);
  });
  ok(`${shown.reachable.toLocaleString()} reachable by SMS of ${shown.total.toLocaleString()} members into CBD & wellness (matches the database)`);
  const pickStore = async (form, st) => {
    // The home-store picker loads stores on demand: search by code, then pick the match.
    await form.locator("#storeSearch").fill(st.code);
    await form.getByRole("list", { name: "Matching stores" }).getByRole("button", { name: new RegExp(`^${st.name}`) }).click();
  };
  await act("marketing.estimateReach (+ home store)", () => pickStore(cf, store), async () => {
    if (!(await until(async () => { const r = await readReach(); return r?.total === 1 && r.reachable === 1; }))) fail(`home-store reach: ${JSON.stringify(await readReach())}`);
  });
  ok("narrowed to the test store: 1 of 1 (the fixture member)");
  await shot("campaign-reach");

  step("Campaigns: draft (validation first) → schedule → send now → cancel");
  await act("marketing.saveCampaign · empty", () => cf.getByRole("button", { name: "Save draft" }).click(), () => alertIn(cf, "Name the campaign").waitFor());
  await cf.locator("#name").fill(T.campaignName);
  await cf.locator("#message").fill("Hi {{firstName}}, the Windmill Tee is back in store this week. Come say hello.");
  await cf.getByText("Copy passes screening").waitFor();
  await act("marketing.saveCampaign (draft)", () => cf.getByRole("button", { name: "Save draft" }).click(), () => notice("Draft saved.").waitFor());
  let camp = await one(`select id, status, segment, "storeId", channel from "Campaign" where name = $1`, [T.campaignName]);
  created.campaigns.push(camp?.id);
  assert(camp && page.url().includes(`/hq/marketing/${camp.id}`) && camp.status === "DRAFT" && camp.segment === "interest:CBD" && camp.storeId === store.id && camp.channel === "SMS", "SMS draft saved for members into CBD at the test store");
  cf = formWith("#segment");
  await hydrated(cf);
  const when = weekdayAt(2, 10);
  await cf.locator("#scheduledAt").fill(when);
  await act("marketing.saveCampaign (schedule)", () => cf.getByRole("button", { name: "Schedule", exact: true }).click(), () => alertOrStatus(cf, /^Scheduled for /).waitFor());
  camp = await one(`select status, "scheduledAt" from "Campaign" where id = $1`, [camp.id]);
  assert(camp.status === "SCHEDULED" && localInput(camp.scheduledAt) >= when, `scheduled for ${localInput(camp.scheduledAt)}`);
  const campId = created.campaigns[0];
  await headerOf().getByRole("button", { name: "Send now" }).waitFor();
  await headerOf().getByRole("button", { name: "Send now" }).click(); // confirm step restates the reach
  await headerOf().getByText(/^Send to [\d,]+ members by SMS\?$/).waitFor();
  await act("marketing.sendNow", () => headerOf().getByRole("button", { name: "Yes, send now" }).click(), () => notice(/^(Sent to [\d,]+ members|.+: held until )/).waitFor());
  camp = await one(`select status, "sentCount", "suppressedCount", "scheduledAt" from "Campaign" where id = $1`, [campId]);
  const sms = await q(`select "to", body from "MessageLog" where "campaignId" = $1`, [campId]);
  if (camp.status === "SENT") assert(camp.sentCount === 1 && sms.length === 1 && sms[0].to === member.phone && sms[0].body.startsWith("Hi E2E, the Windmill Tee") && /Reply STOP/.test(sms[0].body), "sent inside the CPA window: 1 SMS to the fixture member, personalised, with the opt-out footer");
  else assert(camp.status === "SCHEDULED" && camp.scheduledAt > new Date() && sms.length === 0, `outside the CPA send window: held until ${localInput(camp.scheduledAt)}, nothing sent`);
  let cancelId = campId;
  if (camp.status === "SENT") {
    // A sent campaign can't be cancelled: cancel a second draft instead.
    await open("/hq/marketing/new", formWith("#segment"));
    const cf2 = formWith("#segment");
    await cf2.locator("#name").fill(`${T.campaignName} (2)`);
    await cf2.locator("#message").fill("Hi {{firstName}}, our winter hours start next week. See you soon.");
    await act("marketing.saveCampaign (draft)", () => cf2.getByRole("button", { name: "Save draft" }).click(), () => notice("Draft saved.").waitFor());
    cancelId = (await one(`select id from "Campaign" where name = $1`, [`${T.campaignName} (2)`])).id;
    created.campaigns.push(cancelId);
  }
  await headerOf().getByRole("button", { name: "Cancel campaign" }).click();
  const cc = page.getByRole("group", { name: "Cancel this campaign?" });
  await act("marketing.cancelCampaign", () => cc.getByRole("button", { name: "Cancel campaign" }).click(), () => notice("Campaign cancelled — nothing will be sent.").waitFor());
  assert((await one(`select status, "scheduledAt" from "Campaign" where id = $1`, [cancelId])).status === "CANCELLED", "campaign cancelled");
  await shot("campaign-cancelled");

  step("Campaigns: do-not-contact import (registry CSV with a header, a bad line, mixed case email)");
  await page.getByRole("main").getByRole("link", { name: "Campaigns", exact: true }).click(); // the page's back link
  await page.waitForURL(/\/hq\/marketing$/);
  await page.getByRole("link", { name: "Do-not-contact list" }).click();
  await page.waitForURL(/tab=suppression/);
  const dnc = formWith("#values");
  await hydrated(dnc);
  await dnc.locator("#values").fill("12345");
  await act("marketing.importSuppressions · nothing valid", () => dnc.getByRole("button", { name: /Add to do-not-contact list/ }).click(), () => alertIn(dnc, "Nothing valid to import").waitFor());
  T.dncPhone = await freePhone();
  await dnc.locator("#values").fill(`msisdn\n0${T.dncPhone.slice(3, 5)} ${T.dncPhone.slice(5, 8)} ${T.dncPhone.slice(8)}\n12345\n${T.dncEmail.toUpperCase()}`);
  await dnc.locator("#source").selectOption("REFUSED");
  await act("marketing.importSuppressions", () => dnc.getByRole("button", { name: /Add to do-not-contact list/ }).click(), () => notice(/^2 added to the do-not-contact list\. 0 match current members/).waitFor());
  const dncRows = await q(`select value, source, channel from "Suppression" where value = any($1)`, [[T.dncPhone, T.dncEmail]]);
  assert(dncRows.length === 2 && dncRows.every((r) => r.source === "REFUSED" && r.channel === null), `${T.dncPhone} and ${T.dncEmail} on the list (all channels); the bad line was reported`);

  // ── Social ────────────────────────────────────────────────────────────────
  step("Social: the page says Postiz isn't connected, screening blocks selling copy, nothing reaches Postiz");
  await page.getByRole("link", { name: "Social", exact: true }).click();
  await page.waitForURL(/\/hq\/marketing\/social/);
  const sc = formWith("#content");
  await hydrated(sc);
  // Without POSTIZ_* (CI, a fresh server) posts are only recorded. A server holding a Postiz address it can't reach says
  // so and fails a post before anything is sent. A reachable Postiz would publish for real: the test stops there.
  const offline = await notice("Postiz isn't connected").isVisible();
  const problem = alertIn(page, "Couldn't load your channels");
  const unreachable = !offline && (await problem.isVisible()) ? (await problem.textContent()).replace("Couldn't load your channels", "") : null;
  if (!offline && !unreachable) fail("Postiz is connected on this server — the test won't publish to real social accounts");
  ok(offline ? "“Postiz isn't connected — posts are recorded here only”" : `POSTIZ_* is set but Postiz is unreachable, and the page says so: “${unreachable}”`);
  await sc.locator("#content").fill("Buy CBD oil at 20% off this weekend only");
  await sc.getByText(/Sells cannabis or CBD/).waitFor();
  assert(await sc.getByRole("button", { name: /Post now/ }).isDisabled(), "a caption selling CBD is flagged and can't be posted");
  await sc.locator("#content").fill(T.caption);
  await sc.getByText("Caption passes screening").waitFor();
  if (offline) {
    await act("social.postSocial (not connected)", () => sc.getByRole("button", { name: /Post now/ }).click(), () => notice("Recorded here only — connect Postiz to publish (docs/INTEGRATIONS.md).").waitFor());
    const post = await one(`select id, mode, "postizIds", image from "SocialPost" where content = $1`, [T.caption]);
    assert(post && post.postizIds.length === 0 && post.image === "brand", "post recorded (nothing sent to Postiz)");
    await page.getByRole("listitem").filter({ hasText: T.caption }).getByText("Recorded only").waitFor();
    ok("listed under Posts as “Recorded only”");
  } else {
    await act("social.postSocial (Postiz unreachable)", () => sc.getByRole("button", { name: /Post now/ }).click(), () => alertIn(sc, "Couldn't reach Postiz").waitFor());
    assert(!(await one(`select 1 from "SocialPost" where content = $1`, [T.caption])), "the post fails with the reason on the form; nothing recorded, nothing sent");
  }
  await shot("social");

  // ── Online orders ─────────────────────────────────────────────────────────
  step("Online orders: cancel the fixture order (reason required); the member is told");
  await open(`/hq/orders?q=${order.code}`, page.getByRole("link", { name: order.code }));
  await page.getByRole("link", { name: order.code }).click();
  await page.waitForURL(`**/hq/orders/${order.code}`);
  await hydrated(page.getByRole("button", { name: "Cancel order" }));
  await page.getByRole("button", { name: "Cancel order" }).click();
  const oc = page.getByRole("group", { name: `Cancel order ${order.code}?` });
  await act("orders.cancelOrder · no reason", () => oc.getByRole("button", { name: "Cancel order" }).click(), () => alertIn(oc, "Say why").waitFor());
  await oc.locator("#cancel-reason").fill("E2E: member asked to cancel by phone");
  await act("orders.cancelOrder", () => oc.getByRole("button", { name: "Cancel order" }).click(), () => notice("Order cancelled. Stock is released, any points used are returned and the member has been told.").waitFor());
  const oc1 = await one(`select status, events from "Order" where id = $1`, [order.id]);
  const told = await one(`select body from "MessageLog" where "customerId" = $1 and channel = 'SMS' and body like $2`, [member.id, `%${order.code} was cancelled%`]);
  assert(oc1.status === "CANCELLED" && oc1.events.at(-1).note === "Cancelled by HQ: E2E: member asked to cancel by phone" && told, "order cancelled with the reason on its timeline; member sent an SMS");

  step("Online orders: delivery & collection settings (validation first), changed and restored");
  await open("/hq/orders?tab=settings", formWith("#collectHoldDays"));
  const es = formWith("#collectHoldDays");
  const origEco = { unpaid: await es.locator("#unpaidHoldMinutes").inputValue(), hold: await es.locator("#collectHoldDays").inputValue() };
  await es.locator("#unpaidHoldMinutes").fill("5");
  await act("orders.saveEcommerceSettings · invalid", () => es.getByRole("button", { name: "Save settings" }).click(), () => alertIn(es, "15 minutes to 24 hours").waitFor());
  await es.locator("#unpaidHoldMinutes").fill(origEco.unpaid);
  await es.locator("#collectHoldDays").fill(String(Number(origEco.hold) + 1));
  await act("orders.saveEcommerceSettings", () => es.getByRole("button", { name: "Save settings" }).click(), () => notice("Delivery and collection settings saved — checkout uses them immediately.").waitFor());
  assert((await setting("ecommerce"))?.collectHoldDays === Number(origEco.hold) + 1, `collection hold ${origEco.hold} → ${Number(origEco.hold) + 1} days`);
  await es.locator("#collectHoldDays").fill(origEco.hold);
  await act("orders.saveEcommerceSettings (restore)", () => es.getByRole("button", { name: "Save settings" }).click(), () => notice("Delivery and collection settings saved").waitFor());
  assert(String((await setting("ecommerce"))?.collectHoldDays) === origEco.hold, `restored to ${origEco.hold} days`);
  await restoreSetting("ecommerce");


  // ── Trade (wholesale) ─────────────────────────────────────────────────────
  step("Trade: an application (SQL) with its company registration certificate — approval waits for the licence");
  const tVat = `4${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const tReg = `2018/${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}/07`;
  let tNo;
  while (!tNo) {
    const c = `TA-9${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
    if (!(await one(`select 1 from "TradeAccount" where number = $1`, [c]))) tNo = c;
  }
  tradeAccount = await one(
    `insert into "TradeAccount" (id, number, name, "legalName", kind, "regNumber", "vatNumber", email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, classes, "adultAttestedAt", "termsVersion", "termsAcceptedAt", "updatedAt")
     values (gen_random_uuid()::text, $1, $2, $3, 'RETAILER', $6, $4, $5, '+27115550123', '12 Jan Smuts Avenue', 'Rosebank', 'Johannesburg', 'GP', '2196', 'PENDING', 'PREPAID', '{ACCESSORY,CBD}'::"RegClass"[], now(), 'trade-1', now(), now())
     returning id, number, name, email`,
    [tNo, T.tradeName, `${T.tradeName} (Pty) Ltd`, tVat, T.tradeEmail, tReg],
  );
  await q(`insert into "TradeBuyer" (id, "tradeAccountId", name, email, phone, role) values (gen_random_uuid()::text, $1, 'E2E Buyer', $2, '+27825550123', 'OWNER')`, [tradeAccount.id, T.tradeBuyerEmail]);
  // A retailer needs its company registration certificate for these ranges; the buyer sent it with the application.
  const sendCertificate = async () => {
    const u = await one(`insert into "Upload" (id, key, "fileName", "contentType", "sizeBytes", sha256) values (gen_random_uuid()::text, 'e2e/cor14-3.pdf', 'cor14-3.pdf', 'application/pdf', 1024, 'e2e') returning id`);
    return one(`insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId") values (gen_random_uuid()::text, $1, 'CIPC_REGISTRATION', $2, $3) returning id`, [tradeAccount.id, tReg, u.id]);
  };
  const firstCert = await sendCertificate();
  await open(`/hq/trade/accounts?status=LICENCES&q=${encodeURIComponent(T.tradeName)}`, page.getByRole("link", { name: T.tradeName, exact: true }));
  ok("the application is under Licences to check");
  await open("/hq/trade/accounts?status=PENDING", page.getByRole("link", { name: T.tradeName, exact: true }));
  await page.getByRole("link", { name: T.tradeName, exact: true }).click();
  await page.waitForURL(new RegExp(`/hq/trade/accounts/${tradeAccount.id}$`));
  const cert = page.getByTestId("hq-licence-CIPC_REGISTRATION");
  await cert.getByText("To check").waitFor();
  await page.getByText("Verify the licences first").waitFor();
  let taf = formWith("#creditLimit");
  await hydrated(taf);
  await taf.locator("#terms").selectOption("ACCOUNT");
  await taf.locator("#creditLimit").fill("");
  await act("trade.approveAccount · invalid", () => taf.getByRole("button", { name: "Approve account" }).click(), () => alertIn(taf, "An account on credit terms needs a limit").waitFor());
  await taf.locator("#creditLimit").fill("20000");
  await act("trade.approveAccount · licence not verified", () => taf.getByRole("button", { name: "Approve account" }).click(), () => alertIn(taf, "Verify the licences first").waitFor());
  assert((await one(`select status from "TradeAccount" where id = $1`, [tradeAccount.id])).status === "PENDING", "still pending: terms checked first, then the licence");

  step("Trade: HQ doesn't accept the certificate (the account is told why), then verifies the one sent again");
  await hydrated(cert.getByRole("button", { name: "Not accepted" }));
  await cert.getByRole("button", { name: "Not accepted" }).click();
  const rg = page.getByRole("group", { name: "Can't accept this company registration certificate?" });
  await act("trade.rejectLicence · no reason", () => rg.getByRole("button", { name: "Send the reason" }).click(), () => alertIn(rg, "Say what's wrong").waitFor());
  await rg.getByLabel("What's wrong (in the email the account gets)").fill("The certificate is for a different company");
  await act("trade.rejectLicence", () => rg.getByRole("button", { name: "Send the reason" }).click(), () => notice("Licence not accepted").waitFor());
  const rejected = await one(`select status, "rejectReason", "reviewedById" from "TradeLicence" where id = $1`, [firstCert.id]);
  assert(rejected.status === "REJECTED" && rejected.rejectReason === "The certificate is for a different company" && rejected.reviewedById === admin.id, "not accepted, with the reason, by the admin");
  assert(await until(() => one(`select 1 from "MessageLog" where "to" = $1 and body like $2`, [tradeAccount.email, `%not accepted — ${tradeAccount.number}%The certificate is for a different company%`])), "the account is emailed the reason");
  assert(await one(`select 1 from "AuditLog" where action = 'trade.licence.reject' and "entityId" = $1 and "actorId" = $2`, [firstCert.id, admin.id]), "audited (trade.licence.reject)");
  await cert.getByText("Not accepted").first().waitFor();
  const secondCert = await sendCertificate();
  await open(`/hq/trade/accounts/${tradeAccount.id}`, cert.getByRole("button", { name: "Verify" }));
  await shot("trade-licence");
  await act("trade.verifyLicence", () => cert.getByRole("button", { name: "Verify" }).click(), () => notice("Licence verified").waitFor());
  const verified = await one(`select status, "reviewedById", "reviewedAt" from "TradeLicence" where id = $1`, [secondCert.id]);
  assert(verified.status === "VERIFIED" && verified.reviewedById === admin.id && verified.reviewedAt, "verified by the admin");
  assert(await one(`select 1 from "AuditLog" where action = 'trade.licence.verify' and "entityId" = $1 and "actorId" = $2`, [secondCert.id, admin.id]), "audited (trade.licence.verify)");
  await cert.getByText("Verified").first().waitFor();
  assert(!(await page.getByText("Verify the licences first").count()), "nothing left to verify");

  step("Trade: approved on account terms; the account is emailed");
  taf = formWith("#creditLimit");
  await hydrated(taf);
  await taf.locator("#terms").selectOption("ACCOUNT");
  await taf.locator("#creditLimit").fill("20000");
  await taf.getByRole("checkbox", { name: "Supplements", exact: true }).check();
  await shot("trade-approve");
  await act("trade.approveAccount", () => taf.getByRole("button", { name: "Approve account" }).click(), () => notice(`${tradeAccount.number} approved on account terms`).waitFor());
  let tacc = await one(`select status, terms, "creditLimitCents", "paymentDays", classes::text[] classes, "approvedById", "approvedAt" from "TradeAccount" where id = $1`, [tradeAccount.id]);
  assert(tacc.status === "APPROVED" && tacc.terms === "ACCOUNT" && tacc.creditLimitCents === 2_000_000 && tacc.paymentDays === 30 && tacc.classes.includes("SUPPLEMENT") && tacc.approvedById === admin.id && tacc.approvedAt, "approved on account: R20,000 limit, 30 days, three ranges, by the admin");
  assert(await one(`select 1 from "AuditLog" where action = 'trade.account.approve' and "entityId" = $1 and "actorId" = $2`, [tradeAccount.id, admin.id]), "audited (trade.account.approve)");
  assert(await until(() => one(`select 1 from "MessageLog" where "to" = $1 and body like $2`, [tradeAccount.email, `%account ${tradeAccount.number} approved%`])), "approval email logged for the account");

  step(`Trade: HQ places a courier order on account for ${T.tradeName} (whole cases above the minimum) → it queues to pick at ${dc.name}`);
  const tVariant = await one(
    `select v.id, v.sku, v.name, p.name product, v."wholesaleCents", v."caseQty",
       (select coalesce(sum(sl."onHand"), 0) from "StockLevel" sl join "Batch" b on b.id = sl."batchId" where sl."variantId" = v.id and sl."storeId" = $1 and b.status = 'RELEASED')::int "onHand"
     from "Variant" v join "Product" p on p.id = v."productId"
     where v.active and p.status = 'ACTIVE' and v."podSku" is null and p."regClass" in ('ACCESSORY', 'CBD') and v."wholesaleCents" between 5000 and 60000 order by "onHand" desc limit 1`,
    [dc.id],
  );
  const tSetting = (await setting("trade")) ?? {};
  const tMinOrder = tSetting.minOrderCents ?? 200_000;
  const tCases = Math.ceil(tMinOrder / (tVariant.wholesaleCents * tVariant.caseQty)) + 1;
  const tUnits = tCases * tVariant.caseQty;
  if (tVariant.onHand < tUnits) fail(`${dc.code} needs ${tUnits} of ${tVariant.sku} on hand for the trade order`);
  const tLabel = `${tVariant.product} · ${tVariant.name}`;
  await open(`/hq/trade/accounts/${tradeAccount.id}/order`, page.getByRole("button", { name: "Search", exact: true }));
  await page.getByPlaceholder("Product, SKU or barcode").fill(tVariant.sku);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `Add a case of ${tLabel}` }).click();
  await page.getByLabel(`Cases of ${tLabel}`).fill(String(tCases));
  await page.locator("#reference").fill(`E2E-PO-${SFX}`);
  await shot("trade-order-builder");
  await act("trade.placeOrderForAccount", () => page.getByRole("button", { name: `Place order for ${T.tradeName}` }).click(), () => page.waitForURL(/\/hq\/trade\/orders\/[^/?]+\?m=/));
  tradeOrder = await one(`select id, number, status, "payMethod", fulfilment, "storeId", "totalCents", "subtotalCents", "deliveryCents", reference from "TradeOrder" where "tradeAccountId" = $1`, [tradeAccount.id]);
  const tLine = await one(`select id, qty, "unitCents" from "TradeOrderLine" where "tradeOrderId" = $1`, [tradeOrder?.id ?? ""]);
  assert(tradeOrder?.status === "PLACED" && tradeOrder.payMethod === "ACCOUNT" && tradeOrder.fulfilment === "COURIER" && tradeOrder.storeId === dc.id && tLine?.qty === tUnits && tradeOrder.reference === `E2E-PO-${SFX}`, `${tradeOrder?.number}: placed on account, courier from ${dc.code}, ${tUnits} units at R${(tLine?.unitCents / 100).toFixed(2)} ex VAT`);
  assert(tradeOrder.subtotalCents === tUnits * tLine.unitCents && tradeOrder.totalCents > tradeOrder.subtotalCents, `ex VAT ${tradeOrder.subtotalCents} + VAT and courier = ${tradeOrder.totalCents} incl.`);
  await open("/hq/trade/orders?view=pick", null);
  await page.getByRole("link", { name: tradeOrder.number, exact: true }).waitFor();
  ok(`${tradeOrder.number} is in To pick`);

  step(`Trade: ${tradeOrder.number} picked → shipped one case short with the courier and tracking → tax invoice on the ledger, WHOLESALE sale at ${dc.code}`);
  await open(`/hq/trade/orders/${tradeOrder.id}`, page.getByRole("button", { name: "Start picking" }));
  await act("trade.pickOrder", () => page.getByRole("button", { name: "Start picking" }).click(), () => notice("is being picked").waitFor());
  assert((await one(`select status from "TradeOrder" where id = $1`, [tradeOrder.id])).status === "PICKING", "picking");
  await hydrated(page.getByRole("button", { name: "Ship order" }));
  await page.getByRole("button", { name: "Ship order" }).click();
  const tsg = page.getByRole("group", { name: `Ship ${tradeOrder.number}?` });
  await act("trade.shipOrder · no courier", () => tsg.getByRole("button", { name: "Ship and invoice" }).click(), () => alertIn(tsg, "Which courier is it with?").waitFor());
  await tsg.locator("#ship-courier").fill("The Courier Guy");
  await tsg.locator("#ship-tracking").fill(`E2E${SFX}`);
  const tShippedUnits = tUnits - tVariant.caseQty;
  await tsg.locator(`#short-${tLine.id}`).fill(String(tShippedUnits));
  await shot("trade-ship");
  await act("trade.shipOrder", () => tsg.getByRole("button", { name: "Ship and invoice" }).click(), () => notice("shipped with The Courier Guy").waitFor());
  const tShipped = await one(`select o.status, o.courier, o."trackingNo", o."invoiceNumber", o."saleId", l."shippedQty" from "TradeOrder" o join "TradeOrderLine" l on l."tradeOrderId" = o.id where o.id = $1`, [tradeOrder.id]);
  const tHalfUp = (n) => Math.floor((n * 1500 + 5000) / 10000);
  const tInvoiced = tShippedUnits * tLine.unitCents + tHalfUp(tShippedUnits * tLine.unitCents) + tradeOrder.deliveryCents + tHalfUp(tradeOrder.deliveryCents);
  const tInv = await one(`select cents, reference, "dueAt" from "TradeLedgerEntry" where "tradeOrderId" = $1 and kind = 'INVOICE'`, [tradeOrder.id]);
  const tSale = await one(`select channel, "storeId", "totalCents", "tradeAccountId", number from "Sale" where id = $1`, [tShipped.saleId ?? ""]);
  assert(tShipped.status === "SHIPPED" && tShipped.courier === "The Courier Guy" && tShipped.trackingNo === `E2E${SFX}` && /^TI-\d{6}$/.test(tShipped.invoiceNumber ?? "") && tShipped.shippedQty === tShippedUnits, `shipped: ${tShipped.shippedQty} of ${tUnits}, invoice ${tShipped.invoiceNumber}`);
  const tDueDays = tInv?.dueAt ? Math.round((tInv.dueAt.getTime() - Date.now()) / 86_400_000) : null;
  assert(tInv?.cents === tInvoiced && tInv.reference === tShipped.invoiceNumber && tDueDays === 30, `ledger INVOICE for the shipped quantity (R${(tInvoiced / 100).toFixed(2)}), due in 30 days`);
  assert(tSale?.channel === "WHOLESALE" && tSale.storeId === dc.id && tSale.totalCents === tInvoiced && tSale.tradeAccountId === tradeAccount.id && tSale.number === tShipped.invoiceNumber, `WHOLESALE sale ${tSale?.number} posted at ${dc.code}`);
  assert(await one(`select 1 from "AuditLog" where action = 'trade.order.shipped' and "entityId" = $1 and "actorId" = $2`, [tradeOrder.id, admin.id]), "audited (trade.order.shipped)");
  await open("/hq/trade/orders?view=done", null);
  await page.getByRole("link", { name: tradeOrder.number, exact: true }).waitFor();
  ok(`${tradeOrder.number} is Done`);

  step(`Trade: the EFT recorded against ${tShipped.invoiceNumber} → balance zero; the statement emailed; hold and release`);
  await open(`/hq/trade/accounts/${tradeAccount.id}?tab=ledger`, formWith("#pay-amount"));
  const tpf = formWith("#pay-amount");
  await tpf.locator("#pay-amount").fill("0");
  await tpf.locator("#pay-reference").fill("x");
  await act("trade.recordPayment · invalid", () => tpf.getByRole("button", { name: "Record payment" }).click(), () => alertIn(tpf, "The amount received, like 2500.00").waitFor());
  await tpf.locator("#pay-amount").fill((tInvoiced / 100).toFixed(2));
  await tpf.locator("#pay-reference").fill(`E2E-EFT-${SFX}`);
  await tpf.locator("#pay-order").selectOption(tradeOrder.id);
  await act("trade.recordPayment", () => tpf.getByRole("button", { name: "Record payment" }).click(), () => notice(`Payment of R${(tInvoiced / 100).toFixed(2)} recorded`).waitFor());
  const tBalance = (await one(`select coalesce(sum(cents), 0)::int n from "TradeLedgerEntry" where "tradeAccountId" = $1`, [tradeAccount.id])).n;
  assert(tBalance === 0 && (await one(`select 1 from "AuditLog" where action = 'trade.payment' and "entityId" = $1`, [tradeAccount.id])), "balance R0.00 after the payment (audited: trade.payment)");
  const tNow = sastParts(new Date());
  const tMonth = `${tNow.year}-${tNow.month}`;
  await open(`/hq/trade/accounts/${tradeAccount.id}?tab=ledger&month=${tMonth}`, page.getByRole("button", { name: "Email statement" }));
  await page.getByRole("row").filter({ hasText: tShipped.invoiceNumber }).first().waitFor();
  await shot("trade-ledger");
  await act("trade.sendStatement", () => page.getByRole("button", { name: "Email statement" }).click(), () => notice(`Statement for ${tMonth} emailed`).waitFor());
  const tStLog = await one(`select status, kind from "MessageLog" where id = $1`, [`trade-statement-${tradeAccount.id}-${tMonth}`]);
  created.mails.push(`trade-statement-${tradeAccount.id}-${tMonth}`);
  assert(tStLog?.kind === "trade-statement" && tStLog.status === "SENT" && (await one(`select 1 from "AuditLog" where action = 'trade.statement.send' and "entityId" = $1 and "actorId" = $2`, [tradeAccount.id, admin.id])), `statement for ${tMonth} logged (message-log receipt) and the send audited`);
  await open(`/hq/trade/accounts/${tradeAccount.id}`, page.getByRole("button", { name: "Put on hold" }));
  await page.getByRole("button", { name: "Put on hold" }).click();
  const thg = page.getByRole("group", { name: `Put ${T.tradeName} on hold?` });
  await act("trade.holdAccount · no reason", () => thg.getByRole("button", { name: "Put on hold" }).click(), () => alertIn(thg, "Say why").waitFor());
  await thg.locator("#hold-reason").fill("E2E: invoice query");
  await act("trade.holdAccount", () => thg.getByRole("button", { name: "Put on hold" }).click(), () => notice("Account on hold").waitFor());
  tacc = await one(`select status, "holdReason" from "TradeAccount" where id = $1`, [tradeAccount.id]);
  assert(tacc.status === "ON_HOLD" && tacc.holdReason === "E2E: invoice query" && (await until(() => one(`select 1 from "MessageLog" where "to" = $1 and body like $2`, [tradeAccount.email, `%${tradeAccount.number} on hold%`]))), "on hold with the reason; the account emailed");
  await hydrated(page.getByRole("button", { name: "Lift the hold" }));
  await act("trade.releaseAccount", () => page.getByRole("button", { name: "Lift the hold" }).click(), () => notice("Hold lifted").waitFor());
  assert((await one(`select status, "holdReason" from "TradeAccount" where id = $1`, [tradeAccount.id])).status === "APPROVED" && (await one(`select 1 from "AuditLog" where action = 'trade.account.release' and "entityId" = $1 and "actorId" = $2`, [tradeAccount.id, admin.id])), "approved again (audited: trade.account.release)");
  await shot("trade-account");

  step("Trade: the settings card (validation first), changed and restored");
  await open("/hq/settings", formWith("#minOrder"));
  const tsf = formWith("#minOrder");
  const tOrig = { handling: await tsf.locator("#collectHandling").inputValue(), eft: await tsf.locator("#eftHoldDays").inputValue() };
  await tsf.locator("#eftHoldDays").fill("0");
  await act("settings.saveTradeSettings · invalid", () => tsf.getByRole("button", { name: "Save trade settings" }).click(), () => alertIn(tsf, "1 to 30 days").waitFor());
  await tsf.locator("#eftHoldDays").fill(tOrig.eft);
  await tsf.locator("#collectHandling").fill(String(Number(tOrig.handling) + 1));
  await act("settings.saveTradeSettings", () => tsf.getByRole("button", { name: "Save trade settings" }).click(), () => notice("Trade settings saved").waitFor());
  assert((await setting("trade"))?.collectHandlingCents === Math.round((Number(tOrig.handling) + 1) * 100) && (await one(`select 1 from "AuditLog" where action = 'settings.trade' and "actorId" = $1`, [admin.id])), `collect handling R${tOrig.handling} → R${Number(tOrig.handling) + 1} (audited: settings.trade)`);
  await tsf.locator("#collectHandling").fill(tOrig.handling);
  await act("settings.saveTradeSettings (restore)", () => tsf.getByRole("button", { name: "Save trade settings" }).click(), () => notice("Trade settings saved").waitFor());
  await restoreSetting("trade");
  assert(JSON.stringify(await setting("trade")) === JSON.stringify(originalSettings.get("trade") ?? null), "trade settings as found");
  await shot("trade-settings");

  // ── Members (POPIA) ───────────────────────────────────────────────────────
  step("Members: POPIA access export, then erasure of the fixture member (type-to-confirm)");
  await open(`/hq/customers?q=${member.memberNo}`, page.getByRole("link", { name: `E2E Member ${sfx}` }));
  await page.getByRole("link", { name: `E2E Member ${sfx}` }).click();
  await page.waitForURL(`**/hq/customers/${member.id}`);
  let download;
  await act("customers.export (POPIA download)", async () => {
    [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Export data/ }).click()]);
  }, async () => download.saveAs(`${out}/member-export.json`), { action: false });
  const exported = JSON.parse(readFileSync(`${out}/member-export.json`, "utf8"));
  assert(
    download.suggestedFilename() === `herbal-holland-${member.memberNo}.json` && exported.member.memberNo === member.memberNo && exported.member.orders[0]?.code === order.code && exported.member.loyalty.length === 1 && !("idHash" in exported.member),
    `export ${download.suggestedFilename()}: profile, orders, points ledger — no ID hash`,
  );
  assert(await one(`select 1 from "AuditLog" where action = 'customer.export' and "entityId" = $1`, [member.id]), "export audited");
  await page.getByRole("button", { name: "Anonymise member" }).click();
  const an = page.getByRole("group", { name: "Anonymise this member?" });
  await an.locator("#erase-reason").fill(`E2E request ${sfx}, ID verified`);
  assert(await an.getByRole("button", { name: "Erase personal information" }).isDisabled(), "erasure locked until ANONYMISE is typed");
  await an.locator("#confirm-phrase").fill("anonymise");
  await act("customers.anonymiseCustomer", () => an.getByRole("button", { name: "Erase personal information" }).click(), () => notice(/^Personal information erased\./).waitFor());
  const anon = await one(`select phone, email, "firstName", "lastName", dob, points, "consentSms", "consentEmail" from "Customer" where id = $1`, [member.id]);
  const forfeited = await one(`select points from "LoyaltyEntry" where "customerId" = $1 and kind = 'EXPIRE'`, [member.id]);
  const dncMember = await q(`select value from "Suppression" where value = any($1) and source = 'REFUSED'`, [[member.phone, member.email]]);
  assert(anon.phone === `anon-${member.id}` && anon.email === null && anon.firstName === "Anonymised" && anon.dob === null && !anon.consentSms && !anon.consentEmail, "name, mobile, email, birth date erased; consent withdrawn");
  assert(anon.points === 0 && forfeited?.points === -25 && dncMember.length === 2, "25 points forfeited on the ledger; mobile and email on the do-not-contact list");
  await page.getByText("This member's personal information was erased on request.").waitFor();
  assert(!(await page.getByRole("link", { name: /Export data/ }).count()), "no export or erase actions left on an anonymised member");
  await shot("anonymised");

  // ── Founding Members ──────────────────────────────────────────────────────
  step("Founding Members: settings lock once numbers are assigned — and the server enforces it");
  await open("/hq/launch", formWith("#launchAt"));
  const lf = formWith("#launchAt");
  const founders = (await one(`select count(*)::int n from "Customer" where "foundingNo" is not null`)).n;
  const launchBefore = await setting("launch");
  if (founders) {
    assert(
      (await page.getByText("Locked — founding numbers are assigned").isVisible()) && (await lf.locator("fieldset").evaluate((f) => f.disabled)) && !(await lf.getByRole("button", { name: "Save" }).count()),
      `${founders.toLocaleString()} founding numbers assigned: the form is read-only, no Save button`,
    );
    await act("launch.saveLaunch (forced submit while locked)", () => lf.evaluate((f) => ((f.querySelector("fieldset").disabled = false), f.requestSubmit())), () => alertIn(lf, "Founding numbers are already assigned").waitFor());
    assert(JSON.stringify(await setting("launch")) === JSON.stringify(launchBefore), "a forced submit is refused by the server; nothing changed");
    assert(!(await page.getByRole("button", { name: /Assign founding numbers now/ }).count()), "assignFoundingNow isn't offered (numbers exist) — not run: it would renumber real members");
  } else {
    const months = await lf.locator("#foundingMonths").inputValue();
    await lf.locator("#foundingMonths").fill(String(Number(months) === 36 ? 35 : Number(months) + 1));
    await act("launch.saveLaunch", () => lf.getByRole("button", { name: "Save" }).click(), () => notice(/^Saved\./).waitFor());
    await lf.locator("#foundingMonths").fill(months);
    await act("launch.saveLaunch (restore)", () => lf.getByRole("button", { name: "Save" }).click(), () => notice(/^Saved\./).waitFor());
    assert(String((await setting("launch"))?.foundingMonths) === months, "launch settings saved and restored (assignFoundingNow not run)");
  }
  await restoreSetting("launch");

  // ── Rewards ───────────────────────────────────────────────────────────────
  step("Rewards: programme rules, tier savings and My Deals — validation, change, restore");
  await open("/hq/loyalty", formWith("#earnPer100"));
  const lr = formWith("#earnPer100");
  const ol = { earn: await lr.locator("#earnPer100").inputValue(), bday: await lr.locator("#birthdayBonus").inputValue() };
  await lr.locator("#earnPer100").fill("0");
  await act("loyalty.saveLoyalty · invalid", () => lr.getByRole("button", { name: "Save rules" }).click(), () => alertIn(lr, "1–50 points per R100").waitFor());
  await lr.locator("#earnPer100").fill(ol.earn);
  const bday = String(Number(ol.bday) === 1000 ? 999 : Number(ol.bday) + 1);
  await lr.locator("#birthdayBonus").fill(bday);
  await act("loyalty.saveLoyalty", () => lr.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Programme rules saved/).waitFor());
  assert(String((await setting("loyalty"))?.birthdayBonus) === bday, `birthday bonus ${ol.bday} → ${bday} points`);
  await lr.locator("#birthdayBonus").fill(ol.bday);
  await act("loyalty.saveLoyalty (restore)", () => lr.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Programme rules saved/).waitFor());
  assert(String((await setting("loyalty"))?.birthdayBonus) === ol.bday, "restored");
  const ts = formWith("#save_HARVEST");
  const tv = {};
  for (const k of ["SEED", "SPROUT", "BLOOM", "HARVEST"]) tv[k] = await ts.locator(`#save_${k}`).inputValue();
  await ts.locator("#save_HARVEST").fill(String(Number(tv.BLOOM) - 0.5));
  await act("loyalty.saveTierSavings · out of order", () => ts.getByRole("button", { name: "Save savings" }).click(), () => alertIn(ts, "Higher tiers should save at least as much as lower ones").waitFor());
  const harvest = String(Number(tv.HARVEST) >= 30 ? 29.5 : Number(tv.HARVEST) + 0.5);
  await ts.locator("#save_HARVEST").fill(harvest);
  await act("loyalty.saveTierSavings", () => ts.getByRole("button", { name: "Save savings" }).click(), () => notice(/^Instant savings updated/).waitFor());
  assert(String((await setting("loyalty"))?.tierSavingsPct?.HARVEST) === harvest, `Harvest saving ${tv.HARVEST}% → ${harvest}%`);
  await ts.locator("#save_HARVEST").fill(tv.HARVEST);
  await act("loyalty.saveTierSavings (restore)", () => ts.getByRole("button", { name: "Save savings" }).click(), () => notice(/^Instant savings updated/).waitFor());
  assert(String((await setting("loyalty"))?.tierSavingsPct?.HARVEST) === tv.HARVEST, "restored");
  await restoreSetting("loyalty");
  const md = formWith("#offerPercent");
  const om = { pct: await md.locator("#offerPercent").inputValue(), days: await md.locator("#offerDays").inputValue() };
  await md.locator("#offerPercent").fill("50");
  await act("loyalty.saveOffers · invalid", () => md.getByRole("button", { name: "Save My Deals" }).click(), () => alertIn(md, "5–30%").waitFor());
  await md.locator("#offerPercent").fill(om.pct);
  const days = String(Number(om.days) === 14 ? 13 : Number(om.days) + 1);
  await md.locator("#offerDays").fill(days);
  await act("loyalty.saveOffers", () => md.getByRole("button", { name: "Save My Deals" }).click(), () => notice(/^My Deals (saved|switched off)/).waitFor());
  assert(String((await setting("offers"))?.validDays) === days, `deals valid ${om.days} → ${days} days`);
  await md.locator("#offerDays").fill(om.days);
  await act("loyalty.saveOffers (restore)", () => md.getByRole("button", { name: "Save My Deals" }).click(), () => notice(/^My Deals (saved|switched off)/).waitFor());
  assert(String((await setting("offers"))?.validDays) === om.days, "restored");
  await restoreSetting("offers");

  step("Rewards: load this week's deals now (the new ones are removed again)");
  const offersEnabled = (await setting("offers"))?.enabled ?? true;
  const mark = (await one(`select now() t`)).t;
  await page.getByRole("button", { name: "Generate this week's deals now" }).click();
  const gd = page.getByRole("group", { name: "Load this week's deals now?" });
  await act("loyalty.generateDealsNow", () => gd.getByRole("button", { name: "Load deals" }).click(), () => page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /deals loaded onto members' cards|nothing new to load|My Deals is switched off/ }).first().waitFor());
  const fresh = await q(`select id from "MemberOffer" where "createdAt" >= $1`, [mark]);
  created.offers.push(...fresh.map((r) => r.id));
  const said = await page.getByRole("status").filter({ hasText: /deals loaded onto members' cards|nothing new to load/ }).first().textContent().catch(() => "");
  const loaded = Number((said.match(/^([\d,]+) new deals/)?.[1] ?? "0").replace(/,/g, ""));
  assert(offersEnabled ? loaded === fresh.length : /switched off/.test(await page.getByRole("alert").first().textContent()), offersEnabled ? `${loaded} new deal(s) loaded, matching the database (members with a live deal skipped)` : "My Deals is off: nothing loaded");
  if (fresh.length) await q(`delete from "MemberOffer" where id = any($1) and "redeemedAt" is null`, [fresh.map((r) => r.id)]);

  // ── Statements ────────────────────────────────────────────────────────────
  step("Statements: email one store's statement, then all of them");
  const stStore = await one(`select s.code, s.name, c.email from "Store" s join "Company" c on c.id = s."companyId" where s.kind = 'RETAIL' and s.status <> 'OPENING_SOON' and c.email is not null order by s.name limit 1`);
  await open("/hq/statements", page.getByRole("button", { name: /Email all statements/ }));
  const month = await page.getByLabel("Month").inputValue();
  const monthName = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  await page.getByRole("link", { name: stStore.name, exact: true }).click();
  await page.waitForURL(new RegExp(`store=${stStore.code}`));
  const m0 = (await one(`select now() t`)).t;
  await hydrated(page.getByRole("button", { name: /Email to owner/ }));
  await act("statements.emailOneStatement", () => page.getByRole("button", { name: /Email to owner/ }).click(), () => notice(new RegExp(`statement emailed to ${esc(stStore.email)}`)).waitFor());
  const oneMail = await q(`select id from "MessageLog" where channel = 'EMAIL' and "to" = $1 and "createdAt" >= $2 and body like $3`, [stStore.email, m0, `Franchise statement — ${stStore.name}%`]);
  created.mails.push(...oneMail.map((r) => r.id));
  assert(oneMail.length === 1, `${monthName} statement for ${stStore.name} emailed to ${stStore.email} (message log)`);
  await page.getByRole("link", { name: /All statements/ }).click();
  await page.waitForURL(/\/hq\/statements\?month=/);
  await hydrated(page.getByRole("button", { name: /Email all statements/ }));
  await page.getByRole("button", { name: /Email all statements/ }).click();
  const ea = page.getByRole("group", { name: /^Email \d+ .+ statements\?$/ });
  const m1 = (await one(`select now() t`)).t;
  await act("statements.emailAllStatements", () => ea.getByRole("button", { name: "Send to all owners" }).click(), () => notice(/statements? emailed to owners/).waitFor());
  const sent = Number((await notice(/statements? emailed to owners/).textContent()).match(/^(\d+)/)?.[1]);
  const allMail = await q(`select id from "MessageLog" where channel = 'EMAIL' and "createdAt" >= $1 and body like 'Franchise statement — %'`, [m1]);
  created.mails.push(...allMail.map((r) => r.id));
  assert(sent > 1 && allMail.length >= sent, `${sent} statements emailed to owners`);

  // ── Team ──────────────────────────────────────────────────────────────────
  step("Team: add a person (validation first), reset their password, deactivate and reactivate them");
  await open("/hq/team", formWith("#regionId"));
  const tf = formWith("#regionId");
  await tf.locator("#name").fill(T.staffName);
  await tf.locator("#email").fill(T.staffEmail);
  await tf.locator("#role").selectOption("AREA_MANAGER");
  await act("team.addUser · no region", () => tf.getByRole("button", { name: "Add and create password" }).click(), () => alertIn(tf, "Area managers need a region").waitFor());
  await tf.locator("#role").selectOption("HQ_STAFF");
  await act("team.addUser", () => tf.getByRole("button", { name: "Add and create password" }).click(), () => notice(/can now sign in as/).waitFor());
  const pw1 = (await notice(/can now sign in as/).innerText()).match(/temporary password\s+(\S+)\s+—/)?.[1];
  const staff = await one(`select id, role, "mustChangePassword", active from "User" where email = $1`, [T.staffEmail]);
  assert(staff?.role === "HQ_STAFF" && staff.mustChangePassword && pw1, `${T.staffEmail} added as HQ team with a one-time password`);
  const row = page.getByRole("row").filter({ hasText: T.staffEmail });
  await row.getByRole("button", { name: "Reset password" }).click();
  const rpw = row.getByRole("group", { name: `Reset ${T.staffName}'s password?` });
  await act("team.resetPassword", () => rpw.getByRole("button", { name: "Reset password" }).click(), () => row.getByText(/New temporary password for/).waitFor());
  const pw2 = (await row.getByText(/New temporary password for/).innerText()).match(/:\s+(\S+)\s+—/)?.[1];
  assert(pw2 && pw2 !== pw1, "a new one-time password is shown once");
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  watch(p2, "staff");
  await p2.goto(`${BASE}/login`);
  await hydrated(p2.locator("form").first(), p2);
  await p2.locator("#email").fill(T.staffEmail);
  await p2.locator("#password").fill(pw1);
  await p2.getByRole("button", { name: "Sign in" }).click();
  await p2.getByText("That email and password don't match.").waitFor();
  assert((await p2.locator("#email").inputValue()) === T.staffEmail, "after a wrong password the email stays filled in (only the password needs retyping)");
  await p2.locator("#password").fill(pw2);
  await p2.getByRole("button", { name: "Sign in" }).click();
  await p2.waitForURL(/\/account\/password/);
  ok("the old password no longer works; the new one signs in and asks for a new password");
  await c2.close();
  await row.getByRole("button", { name: "Deactivate" }).click();
  const dp = row.getByRole("group", { name: `Deactivate ${T.staffName}?` });
  await act("team.setUserActive (deactivate)", () => dp.getByRole("button", { name: "Deactivate" }).click(), () => notice(`${T.staffName} has been signed out everywhere and can no longer sign in.`).waitFor());
  const deact = await one(`select active, (select count(*)::int from "Session" s where s."userId" = u.id) sessions from "User" u where id = $1`, [staff.id]);
  assert(deact.active === false && deact.sessions === 0, "deactivated and signed out everywhere");
  await act("team.setUserActive (reactivate)", () => page.getByRole("row").filter({ hasText: T.staffEmail }).getByRole("button", { name: "Reactivate" }).click(), () => notice(`${T.staffName} can sign in again.`).waitFor());
  assert((await one(`select active from "User" where id = $1`, [staff.id])).active === true, "reactivated");
  await shot("team");

  // ── Announcements ─────────────────────────────────────────────────────────
  step("Announcements: validation, then news for Express stores (removed straight after)");
  await open("/hq/announcements", formWith("#audience"));
  const af = formWith("#audience");
  await act("announcements.createAnnouncement · empty", () => af.getByRole("button", { name: "Publish to stores" }).click(), () => alertIn(af, "Give it a clear title").waitFor());
  await af.locator("#title").fill(T.annTitle);
  await af.locator("#body").fill("End-to-end test notice. Nothing to do: it is removed straight after the check.");
  await af.locator("#kind").selectOption("NEWS");
  await af.locator("#audience").selectOption("format:EXPRESS");
  await act("announcements.createAnnouncement", () => af.getByRole("button", { name: "Publish to stores" }).click(), () => notice(/^Published\. It shows on every store/).waitFor());
  const ann = await one(`select id, kind, audience, "requiresAck" from "Announcement" where title = $1`, [T.annTitle]);
  created.announcements.push(ann?.id);
  const express = (await one(`select count(*)::int n from "Store" where kind = 'RETAIL' and status <> 'CLOSED' and format = 'EXPRESS'`)).n;
  assert(ann && page.url().includes(`a=${ann.id}`) && ann.audience === "format:EXPRESS" && !ann.requiresAck, "news published to Express stores (no acknowledgement needed)");
  await page.getByText(`Not yet acknowledged (${express})`).waitFor();
  ok(`read receipts list the ${express} Express stores`);
  await q(`delete from "Announcement" where id = $1`, [ann.id]);

  // ── Loss prevention & commission ──────────────────────────────────────────
  step("Loss prevention: thresholds (validation, change, restore), run the checks now; commission rates (THC locked at 0%)");
  await open("/hq/loss-prevention", formWith("#lp-cashShort"));
  const lossForm = formWith("#lp-cashShort");
  const lossWas = { short: await lossForm.locator("#lp-cashShort").inputValue(), high: await lossForm.locator("#lp-cashShortHigh").inputValue() };
  await lossForm.locator("#lp-cashShortHigh").fill(lossWas.short);
  await act("loss.saveLossRules · invalid", () => lossForm.getByRole("button", { name: "Save rules" }).click(), () => alertIn(lossForm, "Must be more than the amount that raises an alert").waitFor());
  await lossForm.locator("#lp-cashShortHigh").fill(lossWas.high);
  const short = String(Number(lossWas.short) + 10);
  await lossForm.locator("#lp-cashShort").fill(short);
  await act("loss.saveLossRules", () => lossForm.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Saved 1 change/).waitFor());
  assert((await setting("loss"))?.cashShortCents === Number(short) * 100, `cash-up short alert from R${lossWas.short} → R${short}`);
  await lossForm.locator("#lp-cashShort").fill(lossWas.short);
  await act("loss.saveLossRules (restore)", () => lossForm.getByRole("button", { name: "Save rules" }).click(), () => notice(/^Saved 1 change/).waitFor());
  assert((await setting("loss"))?.cashShortCents === Number(lossWas.short) * 100, "restored");
  await restoreSetting("loss");
  await restoreSetting("banking");
  const ranAt = (await one(`select now() t`)).t;
  await act("loss.runChecks", () => page.getByRole("button", { name: "Run checks now" }).click(), () => notice(/^Checks run/).waitFor());
  assert((await one(`select count(*)::int n from "AuditLog" where action = 'loss.run' and "actorId" = $1 and at >= $2`, [admin.id, ranAt])).n === 1, "checks run (audited)");
  await open("/hq/commission", formWith("#rate_CBD_FOOD"));
  const rateForm = formWith("#rate_CBD_FOOD");
  const food = await rateForm.locator("#rate_CBD_FOOD").inputValue();
  assert(
    !(await rateForm.locator("#rate_THC").count()) && !(await rateForm.locator("#rate_CBD").count()) && (await rateForm.getByText("Medicines Act s18A").count()) >= 2,
    "THC and CBD supplements have no rate field: 0% (Medicines Act s18A)",
  );
  await rateForm.locator("#rate_CBD_FOOD").fill("12");
  await act("commission.saveRates · invalid", () => rateForm.getByRole("button", { name: "Save rates" }).click(), () => alertIn(rateForm, "0–10%").waitFor());
  const foodNew = String(Number(food) + 0.5);
  await rateForm.locator("#rate_CBD_FOOD").fill(foodNew);
  await act("commission.saveRates", () => rateForm.getByRole("button", { name: "Save rates" }).click(), () => notice(/^Rates saved/).waitFor());
  const bps = (await setting("commission"))?.bps;
  assert(bps?.CBD_FOOD === Math.round(Number(foodNew) * 100) && bps?.CBD === 0, `CBD food & drink commission ${food}% → ${foodNew}%; CBD supplements stay at 0%`);
  await rateForm.locator("#rate_CBD_FOOD").fill(food);
  await act("commission.saveRates (restore)", () => rateForm.getByRole("button", { name: "Save rates" }).click(), () => notice(/^Rates saved/).waitFor());
  await restoreSetting("commission");

  // ── Reports ───────────────────────────────────────────────────────────────
  step("Reports centre: open reports with different ranges and store filters, download a CSV");
  await open("/hq/reports", null);
  await page.getByRole("link", { name: /Sales by store/ }).first().click();
  await page.waitForURL(/\/hq\/reports\/sales-by-store/);
  await hydrated(page.getByRole("link", { name: "Download CSV" }));
  const storesSel = page.locator('[aria-label="Report filters"] label').filter({ hasText: "Stores" }).locator("select");
  await act("reports.sales-by-store (7 days)", () => page.getByRole("tab", { name: "7 days" }).click(), () => page.getByText(/\(7 days\)/).first().waitFor(), { action: false });
  await act("reports.sales-by-store (region filter)", () => storesSel.selectOption(`region:${area.code}`), () => page.getByText(`${area.name} region`).first().waitFor(), { action: false });
  const regionRows = await page.locator("table").first().innerText();
  const regionStores = await q(`select name from "Store" where "regionId" = $1 and kind = 'RETAIL' and status = 'ACTIVE'`, [area.regionId]);
  const elsewhere = await q(`select name from "Store" where "regionId" <> $1 and kind = 'RETAIL' and status = 'ACTIVE'`, [area.regionId]);
  assert(page.url().includes(`stores=region%3A${area.code}`) && regionStores.some((s) => regionRows.includes(s.name)) && !elsewhere.some((s) => regionRows.includes(s.name)), `sales by store, last 7 days, ${area.name} only`);
  await shot("report-region");
  let csv;
  await act("reports.csv export", async () => {
    [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).first().click()]);
  }, async () => csv.saveAs(`${out}/${csv.suggestedFilename()}`), { action: false });
  const lines = readFileSync(`${out}/${csv.suggestedFilename()}`, "utf8").trim().split(/\r?\n/);
  assert(lines.length >= 2 && /Store/i.test(lines[0]) && regionStores.some((s) => lines.join("\n").includes(s.name)), `CSV ${csv.suggestedFilename()}: ${lines.length - 1} rows under “${lines[0].slice(0, 60)}…”`);
  assert(await one(`select 1 from "AuditLog" where action = 'report.export' and "entityId" = 'sales-by-store' and at > now() - interval '5 minutes'`), "export audited");
  const oneStore = await one(`select code, name from "Store" where "regionId" = $1 and kind = 'RETAIL' and status = 'ACTIVE' order by code limit 1`, [area.regionId]);
  await open(`/hq/reports/sales-overview?stores=${oneStore.code}&range=90d`, page.getByRole("link", { name: "Download CSV" }));
  await page.getByText(`${oneStore.name} · ${oneStore.code}`).first().waitFor();
  await page.getByText(/\(90 days\)/).first().waitFor();
  ok(`sales overview: ${oneStore.name}, 90 days`);
  await act("reports.sales-overview (last month)", () => page.getByRole("tab", { name: "Last month" }).click(), () => page.waitForURL(/range=lastmonth/), { action: false });
  await page.getByText(`${oneStore.name} · ${oneStore.code}`).first().waitFor();
  ok("range changed to last month, store filter kept");
  await open("/hq/reports/stock-valuation", page.getByRole("link", { name: "Download CSV" }));
  await page.getByText("All stores", { exact: true }).first().waitFor();
  ok("stock valuation across the network");
  await open("/hq/reports/online-orders?range=30d", page.getByRole("link", { name: "Download CSV" }));
  ok("online orders, 30 days");
  await shot("report");

  // ── Area manager ──────────────────────────────────────────────────────────
  step(`Area manager (${area.name}): only their region, denied elsewhere and on admin-only actions`);
  const actx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const ap = await actx.newPage();
  ap.setDefaultTimeout(45_000);
  ap.setDefaultNavigationTimeout(120_000);
  watch(ap, "area");
  await ap.goto(`${BASE}/api/auth/demo?email=area.gpn@herbalholland.co.za&next=/hq/stores`);
  await ap.waitForURL(/\/hq\/stores$/);
  const listed = await ap.locator("table a[href^='/hq/stores/']").evaluateAll((els) => els.map((e) => e.getAttribute("href").split("/").pop()));
  const mine = (await q(`select code from "Store" where "regionId" = $1 and kind = 'RETAIL' order by code`, [area.regionId])).map((r) => r.code);
  assert(listed.length === mine.length && mine.every((c) => listed.includes(c)), `store list = the ${mine.length} ${area.name} stores (${mine.join(", ")})`);
  const foreign = await one(`select code, name from "Store" where "regionId" <> $1 and kind = 'RETAIL' order by code limit 1`, [area.regionId]);
  const awayHq = await ap.goto(`${BASE}/hq/stores/${foreign.code}`);
  await ap.getByRole("heading", { name: "Not found" }).waitFor();
  assert(awayHq.status() === 404 && ap.url().endsWith(`/hq/stores/${foreign.code}`), `${foreign.name} (${foreign.code}, another region) → not found (404) in the console, not the sign-in page`);
  const awayStore = await ap.goto(`${BASE}/store/${foreign.code}`);
  await ap.getByText("This store sits outside what you look after").waitFor();
  assert(awayStore.status() === 404 && ap.url().endsWith(`/store/${foreign.code}`), `its back office → not found (404) inside their own back office`);
  await open(`/hq/stores/${oneStore.code}`, ap.locator("form").first(), ap);
  assert(await ap.getByText("View only — changes are made by the HQ team.").first().isVisible(), `${oneStore.name}: profile is view-only`);
  assert(!(await ap.getByText("Franchisee owners").count()), "owner sign-ins: not shown (HQ administrator only)");
  await ap.goto(`${BASE}/hq/stores/new`);
  await ap.waitForURL(/\/hq\/stores$/);
  ok("onboarding a store (admin only) → sent back to the store list");
  await open("/hq/team", null, ap);
  await ap.getByText("Only the HQ administrator adds people.").waitFor();
  assert(!(await ap.getByRole("button", { name: /Deactivate|Reset password/ }).count()), "team: view only, no user actions");
  const inRegion = await one(`select c.id from "Customer" c join "Store" s on s.id = c."homeStoreId" where s."regionId" = $1 order by c."memberNo" limit 1`, [area.regionId]);
  const exportStatus = await ap.evaluate(async (u) => (await fetch(u, { redirect: "manual" })).status, `${BASE}/hq/customers/${inRegion.id}/export`);
  assert(exportStatus === 403, "POPIA export (HQ administrator only) → 403 for a member in their own region");
  await ap.goto(`${BASE}/hq/customers/${member.id}`);
  await ap.getByRole("heading", { name: "Not found" }).waitFor();
  ok("a member homed in another region → not found");
  await open("/hq/loyalty", ap.locator("form").filter({ has: ap.locator("#earnPer100") }), ap);
  const alr = ap.locator("form").filter({ has: ap.locator("#earnPer100") });
  assert((await alr.locator("fieldset").evaluate((f) => f.disabled)) && !(await alr.getByRole("button", { name: "Save rules" }).count()), "Rewards rules: read-only, no Save");
  const loyaltyBefore = await setting("loyalty");
  await act("loyalty.saveLoyalty (area manager, forced submit)", () => alr.evaluate((f) => ((f.querySelector("fieldset").disabled = false), f.requestSubmit())), () => alertIn(alr, "You don't have permission to do that.").waitFor(), { p: ap });
  assert(JSON.stringify(await setting("loyalty")) === JSON.stringify(loyaltyBefore), "a forced submit of an admin-only form is refused by the server");
  await open(`/hq/reports/sales-by-store`, ap.getByRole("link", { name: "Download CSV" }), ap);
  const opts = await ap.locator('[aria-label="Report filters"] label').filter({ hasText: "Stores" }).locator("option").allTextContents();
  const allNames = (await q(`select name from "Store" where "regionId" <> $1`, [area.regionId])).map((r) => r.name);
  assert(opts[0] === `All stores in ${area.name}` && !opts.some((o) => allNames.some((nm) => o.startsWith(`${nm} ·`))), `report store filter offers only ${area.name} stores`);
  await open("/hq/marketing/new", ap.locator("form").filter({ has: ap.locator("#segment") }), ap);
  const acf = ap.locator("form").filter({ has: ap.locator("#segment") });
  assert(!(await acf.getByRole("button", { name: "Send now" }).count()), "campaigns: drafts only (no Send now)");
  await acf.locator("#storeSearch").fill(oneStore.code);
  await acf.getByRole("list", { name: "Matching stores" }).getByRole("button", { name: new RegExp(`^${oneStore.name}`) }).click();
  await acf.locator("#name").fill(`${T.campaignName} (area)`);
  await acf.locator("#message").fill("Hi {{firstName}}, join us for a members' morning at the store this Saturday.");
  await act("marketing.saveCampaign (area manager draft)", () => acf.getByRole("button", { name: "Save draft" }).click(), () => notice("Draft saved.", ap).waitFor(), { p: ap });
  const areaDraft = await one(`select id, status, "storeId" from "Campaign" where name = $1`, [`${T.campaignName} (area)`]);
  created.campaigns.push(areaDraft?.id);
  assert(areaDraft?.status === "DRAFT" && (await one(`select 1 from "Store" where id = $1 and "regionId" = $2`, [areaDraft.storeId, area.regionId])), `draft for ${oneStore.name} saved for HQ to review`);
  await shot("area-manager", ap);
  await actx.close();

  if (problems.length) fail(`page errors:\n    ${problems.join("\n    ")}`);
  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n").slice(0, 3).join("\n  "));
  console.log("  at", page.url());
  await shot("FAILED");
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.log("  ! cleanup:", e.message));
  printTimings();
  if (problems.length) console.log("\nPage errors:\n  " + problems.join("\n  "));
  await browser.close();
  await db.end();
}

/** A form's inline result, whichever way it went (used where a success and a notice share wording). */
function alertOrStatus(scope, text) {
  return scope.getByRole("status").or(scope.getByRole("alert")).filter({ hasText: text }).first();
}

async function cleanup() {
  const run = async (what, sql, params) => {
    try {
      await q(sql, params);
    } catch (e) {
      console.log(`  ! cleanup (${what}): ${e.message.split("\n")[0]}`);
    }
  };
  for (const k of SETTING_KEYS) await restoreSetting(k).catch((e) => console.log(`  ! restoring ${k}: ${e.message}`));
  const drift = [];
  for (const k of SETTING_KEYS) if (JSON.stringify(await setting(k).catch(() => "?")) !== JSON.stringify(originalSettings.get(k) ?? null)) drift.push(k);
  if (drift.length) process.exitCode = 1;
  await run("deals", `delete from "MemberOffer" where id = any($1) and "redeemedAt" is null`, [created.offers]);
  await run("announcements", `delete from "Announcement" where id = any($1) or title = $2 or (kind = 'RECALL' and title like $3)`, [created.announcements.filter(Boolean), T.annTitle, `%batch ${T.batchCode}`]);
  await run("social post", `delete from "SocialPost" where content = $1`, [T.caption]);
  await run("campaign messages", `delete from "MessageLog" where "campaignId" in (select id from "Campaign" where name like $1)`, [`${T.campaignName}%`]);
  await run("campaigns", `delete from "Campaign" where name like $1`, [`${T.campaignName}%`]);
  await run("statement emails", `delete from "MessageLog" where id = any($1)`, [created.mails]);
  await run("promotion", `delete from "Promotion" where name = $1`, [T.promoName]);
  await run("price list", `delete from "PriceList" where name = $1`, [T.listName]);
  await run("drop", `delete from "Drop" where name = $1`, [T.dropName]);
  await run("event", `delete from "StoreEvent" where title = $1`, [T.eventTitle]);
  await run("do-not-contact", `delete from "Suppression" where value = any($1)`, [[T.dncPhone, T.dncEmail, member?.phone, member?.email].filter(Boolean)]);
  if (member) {
    await run("member messages", `delete from "MessageLog" where "customerId" = $1`, [member.id]);
    await run("member orders", `delete from "Order" where "customerId" = $1`, [member.id]);
    await run("member", `delete from "Customer" where id = $1`, [member.id]);
  }
  if (tradeAccount) {
    await run("trade messages", `delete from "MessageLog" where "to" in ($1, $2) or id like $3`, [tradeAccount.email, T.tradeBuyerEmail, `trade-statement-${tradeAccount.id}-%`]);
    await run("trade sale link", `update "Sale" set "tradeAccountId" = null where "tradeAccountId" = $1`, [tradeAccount.id]); // the WHOLESALE sale stays, like other trading records
    await run("trade orders", `delete from "TradeOrder" where "tradeAccountId" = $1`, [tradeAccount.id]);
    await run("trade licence documents", `delete from "Upload" where id in (select "uploadId" from "TradeLicence" where "tradeAccountId" = $1)`, [tradeAccount.id]);
    await run("trade account", `delete from "TradeAccount" where id = $1`, [tradeAccount.id]); // buyers, licences and ledger go with it
  }
  if (store) await run("stock orders", `delete from "StockOrder" where "buyerId" = $1`, [store.id]);
  if (variant) {
    await run("movements", `delete from "StockMovement" where "variantId" = $1`, [variant.id]);
    await run("stock", `delete from "StockLevel" where "variantId" = $1`, [variant.id]);
    await run("ranging", `delete from "StoreVariant" where "variantId" = $1`, [variant.id]);
    await run("variant stats", `delete from "DailyVariantStat" where "variantId" = $1`, [variant.id]);
  }
  await run("product", `delete from "Product" where name = $1`, [T.productName]); // variants and batches go with it
  const importVariants = `select v.id from "Variant" v join "Product" p on p.id = v."productId" where p.name = $1`;
  await run("import movements", `delete from "StockMovement" where "variantId" in (${importVariants})`, [T.importName]);
  await run("import stock", `delete from "StockLevel" where "variantId" in (${importVariants})`, [T.importName]);
  await run("import product", `delete from "Product" where name = $1`, [T.importName]);
  for (const u of await q(`select id, key from "Upload" where "fileName" = $1`, [T.importFile]).catch(() => [])) {
    if (!process.env.S3_BUCKET) rmSync(resolve(process.env.UPLOAD_DIR ?? ".data/uploads", u.key), { force: true });
    await run("import file", `delete from "Upload" where id = $1`, [u.id]);
  }
  await run("category", `delete from "Category" where name like $1 and not exists (select 1 from "Product" p where p."categoryId" = "Category".id)`, [`${T.categoryName}%`]);
  if (store) {
    await run("store range", `delete from "StoreVariant" where "storeId" = $1`, [store.id]);
    await run("store stats", `delete from "DailyStoreStat" where "storeId" = $1`, [store.id]);
    await run("store variant stats", `delete from "DailyVariantStat" where "storeId" = $1`, [store.id]);
    await run("checklist", `delete from "StoreTask" where "storeId" = $1`, [store.id]);
    await run("store", `delete from "Store" where id = $1`, [store.id]);
    await run("owner sign-in", `delete from "User" where email = $1`, [T.ownerEmail]);
    await run("owner company", `delete from "Company" where id = $1 and not exists (select 1 from "Store" where "companyId" = $1)`, [store.companyId]);
  }
  await run("team member", `delete from "User" where email = $1`, [T.staffEmail]);
  const left = await one(
    `select (select count(*) from "Store" where name = $1) + (select count(*) from "Product" where name = $2) + (select count(*) from "Customer" where email = $3 or "lastName" = $4 or id = $8)
       + (select count(*) from "User" where email in ($5, $10)) + (select count(*) from "Campaign" where name like $6) + (select count(*) from "Promotion" where name = $7) + (select count(*) from "TradeAccount" where name = $9) as n`,
    [T.storeName, T.productName, T.memberEmail, `Member ${sfx}`, T.staffEmail, `${T.campaignName}%`, T.promoName, member?.id ?? "", T.tradeName, T.ownerEmail],
  ).catch(() => ({ n: "?" }));
  if (Number(left.n)) process.exitCode = 1;
  console.log(`\nCleanup: test data removed (${left.n} left); settings ${drift.length ? `NOT as found: ${drift.join(", ")}` : "as found"}.`);
}

function printTimings() {
  if (!timings.length) return;
  writeFileSync(`${out}/timings.json`, JSON.stringify(timings, null, 2));
  const w = Math.max(...timings.map((t) => t.label.length));
  console.log(`\nAction timings — click → visible result (${BASE}):`);
  for (const t of timings) console.log(`  ${t.label.padEnd(w)}  ${String(t.ms).padStart(6)} ms${t.ms > 1500 ? "  ⚠ over 1.5 s" : ""}`);
  const slow = timings.filter((t) => t.ms > 1500);
  console.log(slow.length ? `\n${slow.length} action(s) over 1.5 s` : "\nEvery action under 1.5 s");
}
