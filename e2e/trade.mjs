// End-to-end test of the trade portal (Playwright + direct DB checks).
//   BASE_URL=http://127.0.0.1:3700 DATABASE_URL=postgresql://…/hh_ci SESSION_SECRET=… DEMO_MODE=true node e2e/trade.mjs [outdir]
// Landing → apply (every validation path once, then a good application; a second application with the same buyer
// email is refused) → sign in with the demo code while PENDING (browse, no prices, no ordering) → approved directly
// in SQL (ACCOUNT terms, R20,000 limit, every trade class) → range (search, two lines in whole cases) → cart (unit ex
// VAT, VAT per line, totals, case steppers) → checkout as click & collect at a store with stock, on account → the
// order page shows the collection code → "order again" → checkout by courier, EFT → the pro forma details → HQ marks
// the first order READY (SQL) → the tracker says "Ready to collect" → orders list and its filter → account page
// (balance, available credit, add and remove a buyer, edit the trading name) → statements → sign out.
// Everything it creates is removed and the two variants' case packs are put back. Prints click-to-result timings.
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-trade";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const DESKTOP = { viewport: { width: 1280, height: 860 } };
const problems = [];
const watch = (page, who) => {
  page.setDefaultTimeout(45_000);
  const at = () => new URL(page.url()).pathname;
  page.on("pageerror", (e) => problems.push(`${who} on ${at()}: pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|404|Failed to load resource|\/_next\/(webpack-)?hmr/.test(m.text()) && problems.push(`${who} on ${at()}: console error: ${m.text().slice(0, 300)}`));
  page.on("response", (r) => r.status() >= 500 && problems.push(`${who}: HTTP ${r.status()} ${r.request().method()} ${r.url()}`));
  return page;
};
let n = 0;
const shot = async (page, name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
};
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => console.log(`\n▸ ${s}`);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rand = () => Math.random().toString(36).slice(2, 7);
const zar = (cents) => `${cents < 0 ? "-" : ""}R${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vatHalfUp = (ex) => Math.floor((ex * 1500 + 5000) / 10000);
const timings = [];
const timed = async (label, act, done) => {
  const t0 = performance.now();
  await act();
  await done();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  return ms;
};

const t0 = new Date();
const undo = [];
let ctx, page;
const run = rand();
const billingEmail = `trade.${run}@example.co.za`;
const buyerEmail = `buyer.${run}@example.co.za`;
const extraBuyerEmail = `second.${run}@example.co.za`;

try {
  // ── What the journey needs from the seed (nothing hard-coded) ──────────────────────────────────────
  const settingsRow = await one(`select value from "Setting" where key = 'trade'`);
  const T = { minOrderCents: 200_000, deliveryCents: 15_000, freeDeliveryOverCents: 500_000, collectHandlingCents: 7_500, eftHoldDays: 3, ...(settingsRow?.value ?? {}) };
  const dc = await one(`select id, code, name from "Store" where kind = 'WAREHOUSE' and status = 'ACTIVE' order by code limit 1`);
  // A click & collect store holding at least 40 units of two trade-priced lines without quantity breaks (the seed's
  // "Trade 2026" list prices most lines, some with breaks), each line worth enough that two cases clear the minimum order.
  const pick = await one(
    `with avail as (
       select sl."storeId", sl."variantId", sum(sl."onHand") q from "StockLevel" sl join "Batch" b on b.id = sl."batchId" and b.status = 'RELEASED' group by 1, 2),
     lines as (
       select a."storeId", v.id, v.sku, v.name vname, p.name pname, v."wholesaleCents", v."caseQty", p."regClass", a.q
       from avail a join "Variant" v on v.id = a."variantId" and v.active and v."podSku" is null and v."wholesaleCents" between 6000 and 80000
       join "Product" p on p.id = v."productId" and p.status = 'ACTIVE' and p."regClass" <> 'THC'
       join "Store" s on s.id = a."storeId" and s.kind = 'RETAIL' and s.status = 'ACTIVE' and s."clickCollect"
       where a.q >= 40 and not exists (select 1 from "PriceListItem" i join "PriceList" l on l.id = i."priceListId" and l.kind = 'TRADE' where i."variantId" = v.id and i."minQty" > 1))
     select s.id "storeId", s.code, s.name, s.suburb, s.city, s.province, s."addressLine",
            (select json_agg(x) from (select id, sku, vname, pname, "wholesaleCents", "caseQty", "regClass", q from lines l where l."storeId" = s.id order by random() limit 2) x) lines
     from "Store" s where (select count(*) from lines l where l."storeId" = s.id) >= 2 order by random() limit 1`,
  );
  if (!dc || !pick) fail("seed data: no DC, or no click & collect store with stock of two trade-priced lines");
  const [A, B] = pick.lines;
  // The trade price each line shows: the live TRADE list's base price when there is one, else the wholesale price.
  for (const L of [A, B]) {
    const listed = await one(
      `select i."priceCents" from "PriceListItem" i join "PriceList" l on l.id = i."priceListId"
       where i."variantId" = $1 and l.kind = 'TRADE' and l.active and (l."startsAt" is null or l."startsAt" <= now()) and (l."endsAt" is null or l."endsAt" >= now()) and i."minQty" = 1
       order by l.priority desc, l."createdAt" desc limit 1`,
      [L.id],
    );
    if (listed) L.wholesaleCents = listed.priceCents;
  }
  const store = pick;
  const dcQty = async (id) => (await one(`select coalesce(sum(sl."onHand"), 0)::int q from "StockLevel" sl join "Batch" b on b.id = sl."batchId" and b.status = 'RELEASED' where sl."storeId" = $1 and sl."variantId" = $2`, [dc.id, id])).q;
  if ((await dcQty(A.id)) < 40 || (await dcQty(B.id)) < 40) fail(`seed data: ${dc.name} holds too little of ${A.sku} / ${B.sku}`);
  // Real case packs for the two lines (the seed sells singly): restored afterwards.
  await q(`update "Variant" set "caseQty" = 6 where id = $1`, [A.id]);
  await q(`update "Variant" set "caseQty" = 12 where id = $1`, [B.id]);
  undo.push(() => q(`update "Variant" set "caseQty" = $2 where id = $1`, [A.id, A.caseQty]));
  undo.push(() => q(`update "Variant" set "caseQty" = $2 where id = $1`, [B.id, B.caseQty]));
  A.caseQty = 6;
  B.caseQty = 12;
  const aName = `${A.pname} ${A.vname}`;
  const bName = `${B.pname} ${B.vname}`;
  console.log(`Lines: ${A.sku} (${zar(A.wholesaleCents)} ex VAT, case of 6) and ${B.sku} (${zar(B.wholesaleCents)} ex VAT, case of 12) · collect at ${store.name} (${store.code}) · DC ${dc.name}`);

  // ── 1. Landing ──────────────────────────────────────────────────────────────────────────────────────
  step("Landing page: who it's for, the range by category, apply and sign in");
  ctx = await browser.newContext(DESKTOP);
  page = watch(await ctx.newPage(), "visitor");
  await page.goto(`${BASE}/trade`);
  await page.getByRole("heading", { level: 1, name: /Stock the range/ }).waitFor();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  assert(ld.some((t) => /"@type":"Organization"/.test(t)) && !ld.some((t) => /"WebSite"|"Product"/.test(t)), "Organization JSON-LD only");
  assert(!(await page.locator('meta[name="robots"][content*="noindex"]').count()), "landing is indexable");
  await page.getByRole("link", { name: /Apply for a trade account/ }).first().waitFor();
  await page.getByRole("link", { name: "Sign in", exact: true }).first().waitFor();
  assert((await page.getByRole("heading", { level: 3 }).count()) >= 8, "who it's for, what you get, categories and steps listed");
  await shot(page, "landing");

  // ── 2. Apply ────────────────────────────────────────────────────────────────────────────────────────
  step("Apply: every validation path, then a good application");
  await page.getByRole("link", { name: /Apply for a trade account/ }).first().click();
  await page.getByRole("heading", { level: 1, name: "Apply for a trade account" }).waitFor();
  assert(!(await page.locator('meta[name="robots"][content*="noindex"]').count()), "application page is indexable");
  const send = () => page.getByRole("button", { name: "Send the application" }).click();
  const summary = page.getByRole("alert").filter({ hasText: /Please check/ });
  await timed("Apply: empty form → errors", send, () => summary.waitFor());
  const errs = await summary.textContent();
  for (const want of ["registered (legal) name", "kind of business", "billing email", "phone number", "street address", "city or town", "Choose the province", "four-digit postal code", "Tick at least one range", "place orders", "18 or older", "Accept the trade terms"])
    assert(errs.includes(want), `empty form: “${want}”`);
  assert(!/legal name under|already signs in/.test(errs), "no stray errors on an empty form");
  await shot(page, "apply-errors");

  const fill = async (o = {}) => {
    const v = {
      legalName: `E2E Pharmacy ${run} (Pty) Ltd`, name: `E2E Pharmacy ${run}`, kind: "PHARMACY", regNumber: "", vatNumber: "", email: billingEmail, phone: "012 345 6789",
      addressLine: "12 Test Street", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083",
      buyerName: `Thandi E2E ${run}`, buyerEmail, buyerPhone: "", notes: "", ...o,
    };
    for (const [label, key] of [["Registered (legal) name", "legalName"], ["Trading name (optional)", "name"], ["Company registration number (optional)", "regNumber"], ["VAT number (optional)", "vatNumber"], ["Billing email", "email"], ["Business phone", "phone"], ["Street address", "addressLine"], ["Suburb (optional)", "suburb"], ["City or town", "city"], ["Postal code", "postalCode"], ["Buyer's name", "buyerName"], ["Buyer's email", "buyerEmail"], ["Buyer's mobile (optional)", "buyerPhone"], ["Anything we should know? (optional)", "notes"]])
      await page.getByLabel(label, { exact: true }).fill(v[key]);
    await page.getByLabel("Kind of business").selectOption(v.kind);
    await page.getByLabel("Province", { exact: true }).selectOption(v.province);
  };
  await fill({ regNumber: "123", vatNumber: "999", buyerPhone: "12" });
  await page.getByRole("checkbox", { name: /Deliver somewhere else/ }).check();
  await page.getByLabel("Delivery street address").fill("Unit 4, 9 Depot Road");
  for (const c of ["CBD supplements", "CBD skin care", "Accessories"]) await page.getByRole("checkbox", { name: new RegExp(`^${esc(c)}`) }).check();
  await page.getByRole("checkbox", { name: /Every buyer who orders/ }).check();
  await page.getByRole("checkbox", { name: /I accept the/ }).check();
  // The first refusal's summary is still on the page: wait for the new one (it names the registration number format).
  const summary2 = page.getByRole("alert").filter({ hasText: /Please check/ }).filter({ hasText: "2015/123456/07" });
  await timed("Apply: bad numbers and a half delivery address → errors", send, () => summary2.waitFor());
  const errs2 = await summary2.textContent();
  for (const want of ["2015/123456/07", "ten digits starting with 4", "Enter a South African phone number, or leave it blank", "delivery city", "delivery province", "delivery postal code"]) assert(errs2.includes(want), `refused: “${want}”`);
  assert((await page.getByLabel("Registered (legal) name", { exact: true }).inputValue()) === `E2E Pharmacy ${run} (Pty) Ltd`, "a refused submit keeps what was typed");
  assert(await page.getByRole("checkbox", { name: /^CBD supplements/ }).isChecked(), "…and the ticks");

  await page.getByLabel("Company registration number (optional)").fill("2015/123456/07");
  await page.getByLabel("VAT number (optional)").fill("4123456789");
  await page.getByLabel("Buyer's mobile (optional)").fill("082 123 4567");
  await page.getByLabel("Delivery suburb (optional)").fill("Silverton");
  await page.getByLabel("Delivery city or town").fill("Pretoria");
  await page.getByLabel("Delivery province").selectOption("GP");
  await page.getByLabel("Delivery postal code").fill("0184");
  await timed("Apply: send → received", send, () => page.getByTestId("apply-done").waitFor());
  await page.getByText("We'll be in touch within one business day.").waitFor();
  const account = await one(`select a.*, b.id "buyerId", b.role from "TradeAccount" a join "TradeBuyer" b on b."tradeAccountId" = a.id where b.email = $1`, [buyerEmail]);
  if (!account) fail("the application wasn't stored");
  // Clean-up first, so a failed check below still leaves nothing behind (orders before the account: no cascade there).
  undo.push(() => q(`delete from "MessageLog" where "createdAt" >= $1 and ("to" in ($2, $3, $4) or body like $5)`, [t0, billingEmail, buyerEmail, extraBuyerEmail, `%${account.number}%`]));
  undo.push(() => q(`delete from "AuditLog" where at >= $1 and ("entityId" = $2 or "actorId" in (select id from "TradeBuyer" where "tradeAccountId" = $2) or "entityId" in (select id from "TradeOrder" where "tradeAccountId" = $2))`, [t0, account.id]));
  undo.push(() => q(`delete from "TradeAccount" where id = $1`, [account.id])); // buyers, sessions and ledger go with it
  undo.push(() => q(`delete from "TradeOrder" where "tradeAccountId" = $1`, [account.id]));
  undo.push(() => q(`delete from "Otp" where email in ($1, $2)`, [buyerEmail, extraBuyerEmail]));
  assert(account.status === "PENDING" && /^TA-\d{6}$/.test(account.number) && account.role === "OWNER", `application ${account.number} is PENDING with its OWNER buyer`);
  assert(account.regNumber === "2015/123456/07" && account.vatNumber === "4123456789" && account.deliveryLine === "Unit 4, 9 Depot Road" && account.deliveryCity === "Pretoria" && account.adultAttestedAt && account.termsAcceptedAt, "numbers tidied, delivery address kept, 18+ and terms recorded");
  // pg hands an enum[] column back as "{CBD,CBD_TOPICAL,ACCESSORY}".
  const classes = Array.isArray(account.classes) ? account.classes : String(account.classes).replace(/[{}"]/g, "").split(",").filter(Boolean);
  assert(classes.length === 3 && classes.includes("CBD_TOPICAL"), `three ranges requested (${classes.join(", ")})`);
  await page.getByText(account.number).waitFor();
  const ack = await one(`select 1 from "MessageLog" where "to" = $1 and body like $2 and "createdAt" >= $3`, [buyerEmail, `%application ${account.number} received%`, t0]);
  const notice = await one(`select "to" from "MessageLog" where "to" <> $1 and body like $2 and "createdAt" >= $3`, [buyerEmail, `%new application ${account.number}%`, t0]);
  assert(ack && notice, `acknowledgement emailed to the buyer, notice to the trade team (${notice?.to})`);
  await shot(page, "apply-done");

  step("The same buyer email can't apply twice");
  await page.goto(`${BASE}/trade/apply`);
  await fill({ legalName: `Another Shop ${run}` });
  await page.getByRole("checkbox", { name: /^Accessories/ }).check();
  await page.getByRole("checkbox", { name: /Every buyer who orders/ }).check();
  await page.getByRole("checkbox", { name: /I accept the/ }).check();
  await timed("Apply: duplicate buyer email → refused", send, () => page.getByText("already signs in to a trade account").first().waitFor());
  assert((await one(`select count(*)::int n from "TradeAccount" where "legalName" = $1`, [`Another Shop ${run}`])).n === 0, "refused by field; nothing created");

  // ── 3. Sign in while pending ───────────────────────────────────────────────────────────────────────
  step("Sign in with the demo code while the application is pending");
  await page.goto(`${BASE}/trade/login`);
  await page.getByLabel("Email address").fill(buyerEmail);
  await timed("Login: send code", () => page.getByRole("button", { name: "Send my code" }).click(), () => page.getByText("Demo mode").waitFor());
  const otp = await one(`select "expiresAt" from "Otp" where email = $1 order by "createdAt" desc limit 1`, [buyerEmail]);
  assert(otp && otp.expiresAt > new Date(), "a one-time code was issued");
  const codeMail = await one(`select body from "MessageLog" where "to" = $1 and body like '%sign-in code%' and "createdAt" >= $2`, [buyerEmail, t0]);
  assert(codeMail && !/\d{6}/.test(codeMail.body), "the code email is logged without the code");
  await page.getByRole("button", { name: "Fill it in" }).click();
  await timed("Login: sign in → range", () => page.getByRole("button", { name: "Sign in", exact: true }).click(), () => page.waitForURL((u) => u.pathname === "/trade/range"));
  assert((await ctx.cookies()).some((c) => c.name === "hh_trade" && c.httpOnly), "hh_trade session cookie set (httpOnly)");
  const session = await one(`select 1 from "Session" where "tradeBuyerId" = $1 and "expiresAt" > now()`, [account.buyerId]);
  assert(session, "session recorded for the buyer");
  await page.getByText("Your application is being reviewed").waitFor();
  assert((await page.getByRole("button", { name: /^Add / }).count()) === 0 && (await page.getByText("Trade price after approval").count()) > 0, "pending: can browse, no prices, nothing to add");
  await shot(page, "range-pending");

  // ── 4. Approve in SQL ───────────────────────────────────────────────────────────────────────────────
  step("HQ approves the account (SQL): on account, R20,000 limit, 30 days, every trade range");
  await q(`update "TradeAccount" set status = 'APPROVED', terms = 'ACCOUNT', "creditLimitCents" = 2000000, "paymentDays" = 30, "approvedAt" = now(), classes = array['CBD','CBD_FOOD','CBD_TOPICAL','HEMP','SUPPLEMENT','ACCESSORY','APPAREL','GROW']::"RegClass"[] where id = $1`, [account.id]);
  ok("approved");

  // ── 5. Range ────────────────────────────────────────────────────────────────────────────────────────
  step("Range: search two lines and add them in whole cases");
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "The trade range" }).waitFor();
  assert((await page.getByText("Your application is being reviewed").count()) === 0, "approval shows at once");
  const search = page.getByLabel("Search the range");
  await search.fill(A.sku);
  await timed("Range: search by SKU", () => search.press("Enter"), () => page.waitForURL((u) => new URL(u).searchParams.get("q") === A.sku));
  const rowA = page.locator(`li[data-sku="${A.sku}"]`);
  await rowA.waitFor();
  const rowText = await rowA.textContent();
  assert(rowText.includes(`${zar(A.wholesaleCents)} ex VAT each`) && rowText.includes("case of 6") && rowText.includes(`${zar(A.wholesaleCents * 6)} a case`), `${A.sku}: ${zar(A.wholesaleCents)} ex VAT each · case of 6 · ${zar(A.wholesaleCents * 6)} a case`);
  assert(/In stock|Low stock/.test(rowText), "availability shown");
  await rowA.getByRole("button", { name: "One case more" }).click();
  await rowA.getByText("2 cases = 12 units").waitFor();
  await timed("Range: add 2 cases → cart bar", () => rowA.getByRole("button", { name: /^Add 2 cases of/ }).click(), () => page.getByTestId("cart-bar").waitFor());
  await rowA.getByText("in cart: 2 cases (12 units)").waitFor();
  const bar1 = await page.getByTestId("cart-bar").textContent();
  const short = T.minOrderCents - 12 * A.wholesaleCents;
  assert(bar1.includes("1 line") && bar1.includes(zar(12 * A.wholesaleCents)) && bar1.includes(short > 0 ? `${zar(short)} more to reach the ${zar(T.minOrderCents)} minimum` : "Minimum order reached"), `cart bar: 1 line · ${zar(12 * A.wholesaleCents)} ex VAT · ${short > 0 ? `${zar(short)} short of the minimum` : "minimum reached"}`);
  await search.fill(B.sku);
  await search.press("Enter");
  const rowB = page.locator(`li[data-sku="${B.sku}"]`);
  await rowB.waitFor();
  await timed("Range: add 1 case of 12 → cart bar", () => rowB.getByRole("button", { name: /^Add 1 case of/ }).click(), () => page.getByTestId("cart-bar").getByText("2 lines").waitFor());
  const subtotal = 12 * A.wholesaleCents + 12 * B.wholesaleCents;
  const bar2 = await page.getByTestId("cart-bar").textContent();
  assert(bar2.includes(zar(subtotal)) && bar2.includes("Minimum order reached"), `cart bar: 2 lines · ${zar(subtotal)} ex VAT · minimum reached`);
  await shot(page, "range-added");

  // ── 6. Cart ─────────────────────────────────────────────────────────────────────────────────────────
  step("Cart: unit prices ex VAT, VAT per line, totals, case steppers");
  await timed("Cart bar → cart", () => page.getByRole("link", { name: "View cart" }).click(), () => page.getByRole("heading", { level: 1, name: "Your cart" }).waitFor());
  const lineA = page.locator(`li[data-sku="${A.sku}"]`);
  const lineB = page.locator(`li[data-sku="${B.sku}"]`);
  const exA = 12 * A.wholesaleCents;
  const exB = 12 * B.wholesaleCents;
  const vat = vatHalfUp(exA) + vatHalfUp(exB);
  assert((await lineA.getByTestId("line-unit").textContent()).includes(`${zar(A.wholesaleCents)} ex VAT each · 2 cases (12 units)`), `line A: ${zar(A.wholesaleCents)} ex VAT each · 2 cases (12 units)`);
  assert((await lineA.getByTestId("line-ex").textContent()) === zar(exA) && (await lineA.getByTestId("line-vat").textContent()) === zar(vatHalfUp(exA)) && (await lineA.getByTestId("line-incl").textContent()) === zar(exA + vatHalfUp(exA)), `line A: ${zar(exA)} ex · ${zar(vatHalfUp(exA))} VAT · ${zar(exA + vatHalfUp(exA))} incl.`);
  assert((await lineB.getByTestId("line-ex").textContent()) === zar(exB) && (await lineB.getByTestId("line-vat").textContent()) === zar(vatHalfUp(exB)), `line B: ${zar(exB)} ex · ${zar(vatHalfUp(exB))} VAT`);
  assert((await page.getByTestId("subtotal-ex").textContent()) === zar(subtotal) && (await page.getByTestId("total-vat").textContent()) === zar(vat) && (await page.getByTestId("total-incl").textContent()) === zar(subtotal + vat), `totals: ${zar(subtotal)} ex VAT · ${zar(vat)} VAT · ${zar(subtotal + vat)} incl.`);
  const stepperA = lineA.getByRole("group", { name: /^Cases of/ });
  await timed("Cart: one case more", () => stepperA.getByRole("button", { name: "One case more" }).click(), () => stepperA.getByText("3 cases", { exact: true }).waitFor());
  await page.getByTestId("subtotal-ex").filter({ hasText: zar(subtotal + 6 * A.wholesaleCents) }).waitFor();
  ok(`3 cases (18 units): subtotal ${zar(subtotal + 6 * A.wholesaleCents)}`);
  await timed("Cart: one case fewer", () => stepperA.getByRole("button", { name: "One case fewer" }).click(), () => stepperA.getByText("2 cases", { exact: true }).waitFor());
  await page.getByTestId("subtotal-ex").filter({ hasText: zar(subtotal) }).waitFor();
  const cookie = (await ctx.cookies()).find((c) => c.name === "hh_trade_cart");
  assert(cookie && cookie.value.includes(`${A.id}_12`) && cookie.value.includes(`${B.id}_12`), "hh_trade_cart holds both lines in units (12 + 12)");
  await shot(page, "cart");

  // ── 7. Checkout: click & collect, on account ────────────────────────────────────────────────────────
  step(`Checkout 1: click & collect at ${store.name}, on account`);
  await timed("Cart → checkout", () => page.getByRole("link", { name: "Checkout" }).click(), () => page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor());
  await page.getByRole("radio", { name: /Click & collect at a store/ }).check();
  await page.getByLabel("Search stores").fill(store.name);
  const storeRadio = page.getByRole("radio", { name: new RegExp(`Herbal Holland ${esc(store.name)}`) });
  await timed("Checkout: search stores", () => page.getByRole("button", { name: "Search", exact: true }).click(), () => storeRadio.waitFor());
  const storeRow = page.locator('[data-testid="collect-stores"] li').filter({ has: storeRadio });
  assert((await storeRow.textContent()).includes("All lines in stock"), `${store.name} has every line in stock`);
  await storeRadio.check();
  const onAccount = page.getByRole("radio", { name: /On account/ });
  assert(await onAccount.isEnabled(), "on account offered (ACCOUNT terms, within the limit)");
  await page.getByText(`${zar(2_000_000)} available of your ${zar(2_000_000)} limit`).waitFor();
  await onAccount.check();
  await page.getByLabel("Your reference (optional)").fill(`PO-E2E-${run}-1`);
  const total1 = subtotal + T.collectHandlingCents + vat + vatHalfUp(T.collectHandlingCents);
  assert((await page.getByTestId("fee").textContent()) === zar(T.collectHandlingCents) && (await page.getByTestId("checkout-total").textContent()) === zar(total1), `handling ${zar(T.collectHandlingCents)} ex VAT · total ${zar(total1)} incl. VAT`);
  await shot(page, "checkout-collect");
  await timed("Checkout: place on account → order page", () => page.getByRole("button", { name: /^Place order on account/ }).click(), () => page.waitForURL(/\/trade\/orders\/[^/]+\?placed=1$/));
  const order1 = await one(`select * from "TradeOrder" where "tradeAccountId" = $1 order by "createdAt" desc limit 1`, [account.id]);
  assert(order1 && order1.status === "PLACED" && order1.payMethod === "ACCOUNT" && order1.fulfilment === "COLLECT" && order1.storeId === store.storeId, `${order1?.number}: PLACED · on account · collect at ${store.name}`);
  assert(order1.subtotalCents === subtotal && order1.handlingCents === T.collectHandlingCents && order1.deliveryCents === 0 && order1.vatCents === vat + vatHalfUp(T.collectHandlingCents) && order1.totalCents === total1, "order totals match the checkout");
  assert(/^\d{6}$/.test(order1.collectionCode) && order1.reservedAt && order1.reference === `PO-E2E-${run}-1` && order1.buyerId === account.buyerId, "collection code, reservation, reference and buyer recorded");
  const lines1 = await q(`select "variantId", qty, "unitCents", "vatCents" from "TradeOrderLine" where "tradeOrderId" = $1`, [order1.id]);
  assert(lines1.length === 2 && lines1.every((l) => l.qty === 12 && l.unitCents === (l.variantId === A.id ? A.wholesaleCents : B.wholesaleCents) && l.vatCents === vatHalfUp(12 * l.unitCents)), "two lines of 12 at the trade price, VAT per line");
  assert(await one(`select 1 from "AuditLog" where action = 'trade.order' and "entityId" = $1`, [order1.id]), "audited (trade.order)");
  assert(await one(`select 1 from "MessageLog" where "to" = $1 and body like $2 and "createdAt" >= $3`, [billingEmail, `%${order1.number} is confirmed%`, t0]), "confirmation emailed to the billing address");
  assert(!(await ctx.cookies()).some((c) => c.name === "hh_trade_cart"), "cart cleared");
  await page.getByText(`Thank you — order ${order1.number} is in.`).waitFor();
  assert((await page.getByTestId("collection-code").textContent()).trim() === order1.collectionCode, `order page shows the collection code ${order1.collectionCode}`);
  await page.getByText("Bring your ID (18+) and this code.").waitFor();
  await page.getByText(store.addressLine).first().waitFor();
  assert((await page.getByTestId("order-total").textContent()) === zar(total1), "order total shown");
  await page.getByTestId("timeline").getByText("Confirmed — stock reserved").waitFor();
  await shot(page, "order-collect");

  // ── 8. Order again → courier, EFT ───────────────────────────────────────────────────────────────────
  step("Order again → checkout 2: courier from the DC, EFT");
  await timed("Order page: order again", () => page.getByRole("button", { name: "Order again" }).click(), () => page.getByRole("button", { name: "Added to cart" }).waitFor());
  await page.getByRole("link", { name: "View cart (2)" }).click();
  await page.getByRole("heading", { level: 1, name: "Your cart" }).waitFor();
  await page.getByTestId("subtotal-ex").filter({ hasText: zar(subtotal) }).waitFor();
  ok("the same two lines are back in the cart (12 + 12)");
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByRole("heading", { level: 1, name: "Checkout" }).waitFor();
  assert(await page.getByRole("radio", { name: /Courier from our DC/ }).isChecked(), "courier is the default");
  const deliveryChip = page.getByRole("radio", { name: /Delivery address/ });
  assert((await deliveryChip.isChecked()) && (await page.getByText("Unit 4, 9 Depot Road").count()) > 0, "delivers to the account's delivery address by default");
  await page.getByRole("radio", { name: /Billing address/ }).check();
  await page.getByRole("radio", { name: /EFT \(pro forma\)/ }).check();
  await page.getByLabel("Your reference (optional)").fill(`PO-E2E-${run}-2`);
  const deliveryFee = T.freeDeliveryOverCents > 0 && subtotal >= T.freeDeliveryOverCents ? 0 : T.deliveryCents;
  const total2 = subtotal + deliveryFee + vat + vatHalfUp(deliveryFee);
  assert((await page.getByTestId("fee").textContent()) === (deliveryFee ? zar(deliveryFee) : "Free") && (await page.getByTestId("checkout-total").textContent()) === zar(total2), `courier ${deliveryFee ? zar(deliveryFee) : "free"} · total ${zar(total2)}`);
  await timed("Checkout: place with EFT → order page", () => page.getByRole("button", { name: /^Place order · pay/ }).click(), () => page.waitForURL(/\/trade\/orders\/[^/]+\?placed=1$/));
  const order2 = await one(`select * from "TradeOrder" where "tradeAccountId" = $1 and id <> $2 order by "createdAt" desc limit 1`, [account.id, order1.id]);
  assert(order2 && order2.status === "PENDING_PAYMENT" && order2.payMethod === "EFT" && order2.fulfilment === "COURIER" && order2.storeId === dc.id && !order2.reservedAt, `${order2?.number}: awaiting EFT · courier from ${dc.name} · nothing reserved`);
  assert(order2.deliveryCents === deliveryFee && order2.totalCents === total2 && order2.addressLine === "12 Test Street" && order2.city === "Pretoria", "courier fee, totals and the billing address on the order");
  assert(await one(`select 1 from "MessageLog" where "to" = $1 and body like $2 and "createdAt" >= $3`, [billingEmail, `%Pro forma ${order2.number}%`, t0]), "pro forma emailed to the billing address");
  await page.getByRole("heading", { level: 1, name: `Pay ${zar(total2)} by EFT` }).waitFor();
  const pf = await page.getByTestId("pro-forma").textContent();
  assert((await page.getByTestId("eft-reference").textContent()) === `HH-${order2.number}` && pf.includes(`Unpaid orders lapse after ${T.eftHoldDays} days`), `pro forma: pay ${zar(total2)} with reference HH-${order2.number} within ${T.eftHoldDays} days`);
  await page.getByText("Awaiting EFT").first().waitFor();
  await shot(page, "order-eft");

  // ── 9. HQ marks the first order ready (SQL) → the tracker ──────────────────────────────────────────
  step("HQ marks the collect order ready (SQL): the tracker says so");
  await q(`update "TradeOrder" set status = 'READY', "readyAt" = now(), events = events || jsonb_build_array(jsonb_build_object('status', 'READY', 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = $1`, [order1.id]);
  await page.goto(`${BASE}/trade/orders/${order1.id}`);
  await page.getByRole("heading", { level: 1, name: `Ready to collect at ${store.name}` }).waitFor();
  await page.getByTestId("timeline").getByText("Ready to collect").waitFor();
  assert((await page.getByTestId("collection-code").textContent()).trim() === order1.collectionCode, "ready: the code, the store and “bring your ID” on the tracker");
  await shot(page, "order-ready");

  step("Orders list and its status filter");
  await page.getByRole("link", { name: "← All orders" }).click();
  await page.getByRole("heading", { level: 1, name: "Orders" }).waitFor();
  const list = page.getByTestId("orders");
  await list.getByText(order1.number).waitFor();
  await list.getByText(order2.number).waitFor();
  assert((await list.locator("li").count()) === 2, "both orders listed, newest first");
  await timed("Orders: filter → awaiting EFT", () => page.getByRole("navigation", { name: "Order status" }).getByRole("link", { name: "Awaiting EFT" }).click(), () => page.waitForURL(/status=PENDING_PAYMENT/));
  await list.getByText(order2.number).waitFor();
  assert((await list.locator("li").count()) === 1, "filter shows the EFT order only");
  await shot(page, "orders");

  // ── 10. Account ─────────────────────────────────────────────────────────────────────────────────────
  step("Account: balance, available credit, buyers, details");
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Account" }).click();
  await page.getByRole("heading", { level: 1, name: `E2E Pharmacy ${run}` }).waitFor();
  assert((await page.getByTestId("balance").textContent()).trim() === zar(0) && (await page.getByTestId("available").textContent()).trim() === zar(2_000_000 - total1), `balance ${zar(0)} · available ${zar(2_000_000 - total1)} (the open on-account order counts)`);
  await page.getByText("On account").first().waitFor();
  const buyers = page.getByTestId("buyers");
  assert((await buyers.locator("li").count()) === 1 && (await buyers.textContent()).includes("You"), "the owner is the only buyer");
  const addForm = page.locator("form").filter({ hasText: "Add a buyer" });
  await addForm.getByLabel("Name", { exact: true }).fill(`Sipho E2E ${run}`);
  await addForm.getByLabel("Email", { exact: true }).fill(extraBuyerEmail);
  await timed("Account: add a buyer", () => addForm.getByRole("button", { name: "Add buyer" }).click(), () => buyers.getByText(`Sipho E2E ${run}`).waitFor());
  const extra = await one(`select id, role, active from "TradeBuyer" where email = $1`, [extraBuyerEmail]);
  assert(extra?.role === "BUYER" && extra.active, "second buyer created (BUYER)");
  const extraRow = buyers.locator("li").filter({ hasText: `Sipho E2E ${run}` });
  await extraRow.getByRole("button", { name: `Remove Sipho E2E ${run}` }).click();
  await timed("Account: remove the buyer", () => extraRow.getByRole("button", { name: "Yes, remove" }).click(), () => extraRow.getByText("Removed").waitFor());
  assert((await one(`select active from "TradeBuyer" where id = $1`, [extra.id])).active === false, "deactivated, not deleted");
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Trading name").fill(`E2E Pharmacy ${run} Renamed`);
  await timed("Account: save details", () => page.getByRole("button", { name: "Save details" }).click(), () => page.getByRole("heading", { level: 1, name: `E2E Pharmacy ${run} Renamed` }).waitFor());
  assert((await one(`select name from "TradeAccount" where id = $1`, [account.id])).name === `E2E Pharmacy ${run} Renamed`, "trading name saved (audited by updateTradeAccount)");
  await shot(page, "account");

  // ── 11. Statements ──────────────────────────────────────────────────────────────────────────────────
  step("Statements: nothing invoiced yet, and this month's document renders");
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Statements" }).click();
  await page.getByRole("heading", { level: 1, name: "Statements" }).waitFor();
  await page.getByTestId("statements-empty").waitFor();
  ok("no ledger entries: the empty state explains the first statement follows the first invoice");
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date());
  await page.goto(`${BASE}/trade/statements/${month}`);
  await page.getByRole("heading", { level: 1, name: /^Statement · / }).waitFor();
  assert((await page.getByTestId("st-opening").textContent()) === zar(0) && (await page.getByTestId("st-closing").textContent()) === zar(0), "statement document: opening and closing R0.00, age analysis shown");
  await shot(page, "statement");

  // ── 12. Sign out ────────────────────────────────────────────────────────────────────────────────────
  step("Sign out");
  await timed("Sign out → landing", () => page.getByRole("button", { name: "Sign out" }).click(), () => page.waitForURL((u) => u.pathname === "/trade"));
  assert(!(await one(`select 1 from "Session" where "tradeBuyerId" = $1`, [account.buyerId])), "session ended");
  await page.goto(`${BASE}/trade/range`);
  await page.waitForURL(/\/trade\/login\?next=/);
  ok("the range asks for a sign-in again (and remembers where to go)");

  if (problems.length) fail(`${problems.length} page error(s) — see below`);
  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n")[0]);
  if (page) await shot(page, "FAILED").catch(() => undefined);
  process.exitCode = 1;
} finally {
  for (const f of undo.reverse()) await f().catch((e) => console.log("  (clean-up)", e.message));
  if (problems.length) console.log("\nPage errors:\n" + [...new Set(problems)].join("\n"));
  if (timings.length) {
    console.log("\nAction timings (click → visible result)");
    const w = Math.max(...timings.map((t) => t.label.length));
    for (const t of timings) console.log(`  ${t.label.padEnd(w)}  ${String(t.ms).padStart(6)} ms${t.ms > 1500 ? "  ⚠ > 1500 ms" : ""}`);
  }
  await browser.close();
  await db.end();
}
