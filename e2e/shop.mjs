// End-to-end test of what shoppers, members and staff do outside checkout (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://…/hh_dev node e2e/shop.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// First visit (18+ gate) → browse (mood, category, search) → product → bag (quantity, remove) → header store picker
// (list, search, choose) → an existing member signs in by phone → Rewards (card, orders → tracking, points, invoices →
// tax invoice, settings: profile, marketing consent, personalised deals) → verified review → restock alert → drop
// alert → ask for help (a support request, then a reply from Rewards → Help) → return an item from a delivered order →
// event RSVP + cancel → sign out → a friend opens the member's share link and joins with the referral (with a
// passport; a refused first try keeps everything filled in) → Learn quest (points once only) → unsubscribe link →
// age verification with an SA ID number → staff sign-in (wrong and right password), forced password change on a
// throwaway user → sign out (/logout).
// Everything it changes on seeded records is put back, and what it creates is removed (the friend stays a member,
// like the checkout test's new members). Prints how long each action takes from click to visible result.
import { chromium } from "@playwright/test";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-shop";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const PHONE = { viewport: { width: 390, height: 844 } };
const problems = [];
// A hydration warning's useful part is its "+ client / - server" lines.
const diffOf = (t) => {
  const d = t.split("\n").filter((l) => /^\s*[+-]\s/.test(l)).slice(0, 8);
  return d.length ? ` [${d.map((l) => l.trim()).join(" | ")}]` : "";
};
const watch = (page, who) => {
  page.setDefaultTimeout(45_000);
  const at = () => new URL(page.url()).pathname;
  page.on("pageerror", (e) => problems.push(`${who} on ${at()}: pageerror: ${e.message}`));
  // (The dev server's hot-reload socket is not the app: it drops whenever the dev server restarts.)
  page.on("console", (m) => m.type() === "error" && !/favicon|404|Failed to load resource|\/_next\/(webpack-)?hmr/.test(m.text()) && problems.push(`${who} on ${at()}: console error: ${m.text().slice(0, 300)}${diffOf(m.text())}`));
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
const rand = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const localPhone = (e164) => `0${e164.slice(3)}`; // +27821234567 → 0821234567
const until = async (fn, what, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
};

// Click-to-visible-result timings, printed as a table at the end.
const timings = [];
const timed = async (label, act, done) => {
  const t0 = performance.now();
  await act();
  await done();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  return ms;
};

// An SA ID number for an adult, with a valid Luhn check digit.
const luhnOk = (d) => {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let x = +d[d.length - 1 - i];
    if (i % 2 === 1) (x *= 2), x > 9 && (x -= 9);
    s += x;
  }
  return s % 10 === 0;
};
const saId = () => {
  const pad = (v, l) => String(v).padStart(l, "0");
  const base = `${pad(70 + Math.floor(Math.random() * 30), 2)}${pad(1 + Math.floor(Math.random() * 12), 2)}${pad(1 + Math.floor(Math.random() * 28), 2)}${pad(Math.floor(Math.random() * 10000), 4)}08`;
  return [...Array(10).keys()].map((z) => base + z).find(luhnOk);
};

/** Signs in (or joins) with a mobile number on a page showing the phone sign-in form, using the on-screen demo code. */
async function phoneCode(page, phone, label) {
  await page.getByLabel("Mobile number").fill(phone);
  await timed(`${label}: send code`, () => page.getByRole("button", { name: /Send my code/ }).click(), () => page.getByText("Demo mode").waitFor());
  await page.getByRole("button", { name: "Fill it in" }).click();
}

const t0 = new Date();
const undo = []; // clean-up, run last-in first-out
let ctx, page, friendCtx, staffCtx;

try {
  // ── Look up what the journeys need (random seed data: nothing is hard-coded) ──────────────────────────
  const inStock = `with avail as (
      select sl."variantId", sum(sl."onHand") qty from "StockLevel" sl join "Batch" b on b.id = sl."batchId" and b.status = 'RELEASED'
      join "Store" s on s.id = sl."storeId" and s.status = 'ACTIVE' group by 1)
    select p.id, p.slug, p.name, p."categoryId", c.slug cat, c.name "catName", v.id "variantId"
    from "Product" p join "Category" c on c.id = p."categoryId" join "Variant" v on v."productId" = p.id and v.active join avail a on a."variantId" = v.id
    where p.status = 'ACTIVE' and p."regClass" in ('CBD', 'HEMP', 'ACCESSORY', 'GROW') and not p."tobaccoRelated" and v."podSku" is null and a.qty >= 10
      and (select count(*) from "Variant" x where x."productId" = p.id and x.active) = 1
      and not exists (select 1 from "Drop" d where v.id = any(d."variantIds") and (d."endsAt" is null or d."endsAt" > now()))`;
  const target = await one(`${inStock} order by random() limit 1`);
  const extra = await one(`${inStock} and p."categoryId" = $1 and p.id <> $2 order by random() limit 1`, [target.categoryId, target.id]);
  // A member with online orders who bought something they haven't reviewed yet (and no recent sign-in codes).
  const member = await one(
    `select c.id, c.phone, c."firstName", c."lastName", c.email, c."homeStoreId", c."memberNo", c.points, c."referralCode",
            c."consentSms", c."consentAt", c."personalisedOffers", p.id "productId", p.slug "productSlug", p.name "productName"
     from "Customer" c
     join lateral (
       select p.id, p.slug, p.name from "Sale" s join "SaleLine" l on l."saleId" = s.id join "Variant" v on v.id = l."variantId" join "Product" p on p.id = v."productId"
       where s."customerId" = c.id and s.kind = 'SALE' and p.status = 'ACTIVE' and p."regClass" in ('CBD', 'HEMP', 'ACCESSORY', 'GROW', 'APPAREL')
         and exists (select 1 from "Variant" x where x."productId" = p.id and x.active)
         and not exists (select 1 from "Review" r where r."productId" = p.id and r."customerId" = c.id)
       limit 1) p on true
     where exists (select 1 from "Order" o where o."customerId" = c.id)
       and (select count(*) from "Otp" where phone = c.phone and "createdAt" > now() - interval '10 minutes') = 0
     order by random() limit 1`,
  );
  if (!target || !member) fail("seed data: no in-stock product or no member with orders and purchases");

  // ── 1. First visit ─────────────────────────────────────────────────────────────────────────────────
  step("First visit: the 18+ age gate");
  ctx = await browser.newContext(PHONE);
  page = watch(await ctx.newPage(), "shopper");
  await page.goto(`${BASE}/`);
  const gate = page.getByRole("dialog", { name: "Are you 18 or older?" });
  await gate.waitFor();
  await shot(page, "age-gate");
  ok("gate shown before anything else");
  await timed("Age gate: I'm 18 or older", () => gate.getByRole("button", { name: "I'm 18 or older" }).click(), () => gate.waitFor({ state: "detached" }));
  const age = (await ctx.cookies()).find((c) => c.name === "hh_age");
  assert(age?.value === "1" && age.expires > Date.now() / 1000 + 300 * 86_400, "confirmed: remembered for a year (hh_age=1)");
  await page.getByRole("heading", { name: "Shop by category" }).waitFor();
  ok("home page content visible");

  const minorCtx = await browser.newContext(PHONE);
  const minor = watch(await minorCtx.newPage(), "under-18");
  await minor.goto(`${BASE}/shop`);
  await minor.getByRole("button", { name: "I'm under 18" }).click();
  await minor.getByRole("heading", { name: "Sorry, this site is for adults" }).waitFor();
  assert((await minor.locator("article").count()) === 0, "an under-18 answer shows a neutral page with no products");
  await minorCtx.close();
  await page.bringToFront();

  // ── 2. Browse ──────────────────────────────────────────────────────────────────────────────────────
  step("Browse: a mood from the home page, a category, then search");
  const moodTile = page.locator('main a[href^="/shop?mood="]').first();
  const mood = new URL(await moodTile.getAttribute("href"), BASE).searchParams.get("mood");
  await timed("Home → mood tile → shop", () => moodTile.click(), () => page.getByRole("heading", { level: 1, name: `For ${mood}` }).waitFor());
  const moodResults = await page.locator("main article").count();
  assert(moodResults > 0 && (await page.getByText(/\d+ results? for/).isVisible()), `/shop?mood=${mood}: ${moodResults} products, filter shown`);
  await page.getByRole("link", { name: new RegExp(`^Remove filter ${esc(mood)}`, "i") }).click();
  await page.getByRole("heading", { level: 1, name: "The range" }).waitFor();
  await timed("Shop: category chip", () => page.getByLabel("Categories").getByRole("link", { name: new RegExp(`^${esc(target.catName)}`) }).click(), () => page.getByRole("heading", { level: 1, name: target.catName }).waitFor());
  assert(page.url().includes(`category=${target.cat}`), `category ${target.catName} (${await page.locator("main article").count()} products)`);
  await shot(page, "category");

  if (extra) {
    const quick = page.getByRole("button", { name: `Add ${extra.name} to bag` });
    await timed("Card quick-add → toast", () => quick.click(), () => page.getByRole("link", { name: /^View bag \(1\)/ }).waitFor());
    await page.getByRole("link", { name: "Bag, 1 item" }).waitFor();
    ok(`quick-added ${extra.name} from its card; header bag shows 1`);
  }

  const box = page.getByLabel("Search the range");
  await box.fill(target.name);
  await timed("Shop: search", () => box.press("Enter"), () => page.waitForURL((u) => new URL(u).searchParams.get("q") === target.name));
  const card = page.getByRole("link", { name: target.name, exact: true });
  await card.waitFor();
  assert(await page.getByText(/\d+ results? for/).isVisible(), `search “${target.name}” finds it`);
  await shot(page, "search");
  await timed("Product card → product page", () => card.click(), () => page.getByRole("heading", { level: 1, name: target.name }).waitFor());
  await page.getByRole("group", { name: "Quantity" }).getByRole("button", { name: "One more" }).click();
  const before = extra ? 1 : 0;
  await timed("Product: Add to bag (2) → toast", () => page.getByRole("button", { name: "Add to bag", exact: true }).click(), () => page.getByRole("link", { name: `View bag (${before + 2})` }).waitFor());
  await page.getByRole("link", { name: `Bag, ${before + 2} items` }).waitFor();
  ok(`added 2 × ${target.name}; header bag shows ${before + 2}`);
  await shot(page, "product-added");

  step("Bag: change the quantity, remove lines");
  await timed("Toast → bag page", () => page.getByRole("link", { name: `View bag (${before + 2})` }).click(), () => page.getByRole("heading", { level: 1, name: "Your bag" }).waitFor());
  const line = page.locator("main li").filter({ has: page.getByRole("link", { name: target.name, exact: true }) });
  const qtyOf = async () => Number((await line.getByRole("group").textContent()).replace(/\D/g, ""));
  assert((await qtyOf()) === 2, "bag line shows quantity 2");
  await timed("Bag: + one more", () => line.getByRole("button", { name: "One more" }).click(), () => page.getByRole("link", { name: `Bag, ${before + 3} items` }).waitFor());
  assert((await qtyOf()) === 3, "quantity 3 after “one more”");
  await timed("Bag: − one less", () => line.getByRole("button", { name: "One less" }).click(), () => page.getByRole("link", { name: `Bag, ${before + 2} items` }).waitFor());
  assert((await qtyOf()) === 2, "quantity 2 after “one less”");
  await shot(page, "bag");
  if (extra) {
    const other = page.locator("main li").filter({ has: page.getByRole("link", { name: extra.name, exact: true }) });
    await timed("Bag: remove a line", () => other.getByRole("button", { name: "Remove" }).click(), () => other.waitFor({ state: "detached" }));
    ok(`${extra.name} removed`);
  }
  await timed("Bag: remove the last line", () => line.getByRole("button", { name: "Remove" }).click(), () => page.getByRole("heading", { name: "Your bag is empty" }).waitFor());
  assert(!(await ctx.cookies()).some((c) => c.name === "hh_cart"), "bag empty (cookie cleared)");

  step("Header store picker: list, search, choose a store");
  const header = page.getByRole("banner");
  const pickerBtn = header.getByRole("button", { name: "Choose your store" }); // the phone-width bar under the header
  const picker = page.getByRole("dialog", { name: "Choose your store" });
  const storeRows = picker.locator("li button");
  const listed = (await one(`select count(*)::int n from "Store" where kind = 'RETAIL' and status in ('ACTIVE', 'OPENING_SOON')`)).n;
  const choice = await one(`select code, name, suburb, city from "Store" where kind = 'RETAIL' and status = 'ACTIVE' order by random() limit 1`);
  await timed("Store picker: open → stores listed", () => pickerBtn.click(), () => picker.getByText(`${choice.suburb}, ${choice.city}`).first().waitFor());
  assert((await storeRows.count()) === listed, `picker lists every store (${listed}, trading and opening soon)`);
  const storeSearch = picker.getByRole("textbox", { name: "Search stores" });
  await storeSearch.fill("zzqx");
  await picker.getByText("No stores match “zzqx”.").waitFor();
  await timed("Store picker: search", () => storeSearch.fill(choice.suburb), () => picker.getByText(`${choice.suburb}, ${choice.city}`).first().waitFor());
  const found = await storeRows.allTextContents();
  const term = choice.suburb.toLowerCase();
  assert(found.length >= 1 && found.length < listed && found.every((t) => t.toLowerCase().includes(term)), `search “${choice.suburb}”: ${found.length} store(s), all matching`);
  await shot(page, "store-picker");
  const row = storeRows.filter({ hasText: `${choice.suburb}, ${choice.city}` }).filter({ hasText: choice.name }).first();
  await timed("Store picker: choose → header shows it", () => row.click(), () => header.getByRole("button", { name: new RegExp(`^${esc(choice.name)}\\s*·`) }).waitFor());
  await picker.waitFor({ state: "hidden" });
  assert((await ctx.cookies()).find((c) => c.name === "hh_store")?.value === choice.code, `${choice.name} (${choice.code}) chosen: saved for next time, and the header shows it`);

  // ── 3. Existing member signs in by phone ────────────────────────────────────────────────────────────
  step(`Member ${member.memberNo} (${member.firstName}) signs in with their mobile number`);
  await page.getByRole("link", { name: "Sign in to Herbal Holland Rewards" }).click();
  await page.getByRole("heading", { name: "Sign in or join" }).waitFor();
  await phoneCode(page, localPhone(member.phone), "Member sign-in");
  await timed("Member sign-in: verify → card", () => page.getByRole("button", { name: "Verify" }).click(), () => page.getByRole("heading", { level: 1, name: `Hi ${member.firstName}` }).waitFor());
  const session = await one(`select id from "Session" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]);
  assert(session, "signed straight in (no registration step), session created");
  await page.getByText(member.memberNo).first().waitFor();
  await shot(page, "club");
  ok(`Rewards card shows member ${member.memberNo}`);

  // The member's share card, for the friend later on (the share sheet falls back to a panel on desktop browsers).
  let shareUrl = `/s/${member.referralCode}`;
  await page.getByRole("button", { name: "Share your tier" }).click();
  const preview = page.getByRole("link", { name: "Preview the card" });
  if (await preview.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    const u = new URL(await preview.getAttribute("href"));
    shareUrl = `${u.pathname}${u.search}`;
    await page.keyboard.press("Escape");
  }
  assert(shareUrl.startsWith(`/s/${member.referralCode}`), `share link ${shareUrl.split("&k=")[0]}…`);

  step("Rewards: orders → tracking, points, invoices → tax invoice");
  const nav = page.getByRole("navigation", { name: "Rewards" });
  await timed("Rewards tab: Orders", () => nav.getByRole("link", { name: "Orders" }).click(), () => page.getByRole("heading", { name: "Your orders" }).waitFor());
  const orderLink = page.locator('main a[href^="/orders/"]').first();
  const code = (await orderLink.getAttribute("href")).split("/").pop();
  const order = await one(`select "customerId", status from "Order" where code = $1`, [code]);
  assert(order?.customerId === member.id, `orders list shows their order ${code} (${order?.status})`);
  // (“Order <code>” is on the list too: wait for the tracking page's own “Placed … · how” line.)
  await timed("Order → tracking page", () => orderLink.click(), async () => {
    await page.waitForURL(`**/orders/${code}`);
    await page.getByText(/^Placed .+ · (Click & collect|Same-day delivery|Courier delivery)$/).waitFor();
  });
  await shot(page, "order-tracking");
  ok(`tracking page for ${code}`);
  await page.goBack();
  await page.getByRole("heading", { name: "Your orders" }).waitFor();

  await timed("Rewards tab: Points", () => nav.getByRole("link", { name: "Points" }).click(), () => page.getByRole("heading", { name: "Points activity" }).waitFor());
  const { points, ledger, lines } = await one(
    `select points, (select coalesce(sum(points), 0)::int from "LoyaltyEntry" where "customerId" = $1) ledger, (select count(*)::int from "LoyaltyEntry" where "customerId" = $1) lines from "Customer" where id = $1`,
    [member.id],
  );
  await page.getByText(`${points.toLocaleString("en-US")} pts`, { exact: true }).first().waitFor();
  const entries = await page.locator("main li").filter({ hasText: /[+−][\d,]+ pts$/ }).count();
  assert(points === ledger && entries === Math.min(lines, 20), `balance ${points} pts shown, equal to the ledger total; ${entries} of ${lines} entries listed (20 a page)`);

  await timed("Rewards tab: Invoices", () => nav.getByRole("link", { name: "Invoices" }).click(), () => page.getByRole("heading", { name: "Invoices & receipts" }).waitFor());
  const invLink = page.locator('main a[href^="/invoice/"]').first();
  const invHref = await invLink.getAttribute("href");
  const saleId = invHref.split("/").pop().split("?")[0];
  const sale = await one(`select number, "customerId" from "Sale" where id = $1`, [saleId]);
  assert(sale?.customerId === member.id && invHref.includes("?t="), `invoices list links their sale ${sale?.number} with a signed token`);
  // (The list shows the number too: wait for the invoice document's own title.)
  const docTitle = page.getByRole("heading", { level: 1, name: /^(Tax Invoice|Invoice|Credit Note|Refund)$/ });
  await timed("Invoice → tax invoice page", () => invLink.click(), async () => {
    await page.waitForURL(`**/invoice/${saleId}?t=*`);
    await docTitle.waitFor();
  });
  await page.getByText(sale.number, { exact: true }).first().waitFor();
  ok(`${await docTitle.textContent()} ${sale.number} opens (signed link)`);
  await shot(page, "tax-invoice");
  const bad = await page.goto(`${BASE}/invoice/${saleId}?t=${"x".repeat(22)}`);
  assert(bad.status() === 404, "a tampered invoice link is refused (404)");

  step("Rewards: settings (details, marketing consent, personalised deals)");
  await page.goto(`${BASE}/club/settings`);
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  undo.push(async () => {
    await q(`update "Customer" set "firstName" = $2, "lastName" = $3, email = $4, "homeStoreId" = $5, "consentSms" = $6, "consentAt" = $7, "personalisedOffers" = $8 where id = $1`, [
      member.id, member.firstName, member.lastName, member.email, member.homeStoreId, member.consentSms, member.consentAt, member.personalisedOffers,
    ]);
    await q(`delete from "ConsentEvent" where "customerId" = $1 and source = 'CLUB_APP' and "createdAt" >= $2`, [member.id, t0]);
  });
  // Someone else's email address: refused, and what the member typed stays in the box.
  const taken = (await one(`select email from "Customer" where email is not null and id <> $1 limit 1`, [member.id])).email;
  const email = page.getByLabel("Email for invoices");
  await email.fill(taken);
  await timed("Settings: save details (email taken)", () => page.getByRole("button", { name: "Save details" }).click(), () => page.getByText("That email is already linked to another member").waitFor());
  assert((await email.inputValue()) === taken, "email already in use: inline error, typed value kept");
  const lastName = `E2E-${rand()}`;
  await email.fill(member.email ?? "");
  await page.getByLabel("Last name (optional)").fill(lastName);
  await timed("Settings: save details", () => page.getByRole("button", { name: "Save details" }).click(), () => page.getByRole("status").filter({ hasText: "Saved" }).waitFor());
  assert((await one(`select "lastName" from "Customer" where id = $1`, [member.id])).lastName === lastName, `profile saved (last name ${lastName})`);

  const sms = page.getByRole("switch", { name: "SMS marketing messages" });
  for (const want of [!member.consentSms, member.consentSms]) {
    await timed(`Settings: SMS consent ${want ? "on" : "off"}`, () => sms.click(), async () => {
      await page.waitForFunction(([el, on]) => el.getAttribute("aria-checked") === String(on) && !el.disabled, [await sms.elementHandle(), want]);
      await until(async () => (await one(`select "consentSms" from "Customer" where id = $1`, [member.id])).consentSms === want, "SMS consent saved");
    });
    const ev = await one(`select granted, source from "ConsentEvent" where "customerId" = $1 and channel = 'SMS' order by "createdAt" desc limit 1`, [member.id]);
    assert(ev?.granted === want && ev.source === "CLUB_APP", `SMS marketing ${want ? "on" : "off"}: saved and written to the consent ledger`);
  }
  const deals = page.getByRole("switch", { name: "Personalised deals" });
  for (const want of [!member.personalisedOffers, member.personalisedOffers]) {
    await timed(`Settings: personalised deals ${want ? "on" : "off"}`, () => deals.click(), async () => {
      await page.waitForFunction(([el, on]) => el.getAttribute("aria-checked") === String(on) && !el.disabled, [await deals.elementHandle(), want]);
      await until(async () => (await one(`select "personalisedOffers" from "Customer" where id = $1`, [member.id])).personalisedOffers === want, "personalised deals saved");
    });
    ok(`personalised deals ${want ? "on" : "off"}`);
  }
  const push = page.getByRole("switch", { name: "App notifications on this device" });
  if (await push.isDisabled()) ok(`app notifications: “${(await page.locator("#notifications [aria-live]").textContent()).trim()}” (no VAPID keys / push service here, so enablePush/disablePush aren't exercised)`);
  await shot(page, "settings");

  // ── 4. Product: review, restock alert ───────────────────────────────────────────────────────────────
  step(`Verified review of ${member.productName} (the member bought it)`);
  undo.push(() => q(`delete from "Review" where "productId" = $1 and "customerId" = $2 and "createdAt" >= $3`, [member.productId, member.id, t0]));
  await page.goto(`${BASE}/p/${member.productSlug}#reviews`);
  await page.getByRole("heading", { name: "Write a review" }).waitFor();
  const stars = page.getByRole("radio", { name: "4 stars" });
  await stars.check({ force: true });
  const headline = `Exactly as described ${rand()}`;
  await page.getByLabel("Headline (optional)").fill(headline);
  const body = page.getByLabel("Your review");
  const claim = "Lovely quality and it cures my stress every evening.";
  await body.fill(claim);
  await timed("Review: post (medical claim)", () => page.getByRole("button", { name: "Post review" }).click(), () => page.getByText(/We can't publish that as written/).waitFor());
  assert((await body.inputValue()) === claim && (await page.getByLabel("Headline (optional)").inputValue()) === headline, "a medical claim is refused with the reason; the headline and text are kept to edit");
  assert(await stars.isChecked(), "the 4-star rating is still selected");
  await body.fill("Lovely quality, smooth and exactly as described. Would buy again.");
  const thanks = page.getByText("You've reviewed this product. Thank you.");
  await timed("Review: post", () => page.getByRole("button", { name: "Post review" }).click(), () => thanks.waitFor());
  const review = await one(`select rating, verified, title from "Review" where "productId" = $1 and "customerId" = $2`, [member.productId, member.id]);
  assert(review?.rating === 4 && review.verified && review.title === headline, "review saved: 4 stars, verified purchase");
  await page.getByRole("heading", { name: headline }).waitFor();
  ok("the form gives way to a thank-you and the review is listed first");
  await page.reload();
  await thanks.waitFor();
  await page.getByRole("heading", { name: headline }).waitFor();
  ok("still there after a reload");

  step("Restock alert on an out-of-stock item");
  const slug = `e2e-restock-${Date.now().toString(36)}`;
  const temp = await one(
    `with p as (insert into "Product" (id, slug, name, "categoryId", description, "regClass", "updatedAt")
       values (gen_random_uuid()::text, $1, 'E2E Restock Pouch', $2, 'A throwaway product for the end-to-end restock alert.', 'ACCESSORY', now()) returning id)
     insert into "Variant" (id, "productId", sku, name, "priceCents", "wholesaleCents", "costCents") select gen_random_uuid()::text, id, $3, 'One size', 9900, 5000, 3000 from p returning id, "productId"`,
    [slug, target.categoryId, `E2E-${Date.now().toString(36).toUpperCase()}`],
  );
  undo.push(() => q(`delete from "Product" where id = $1`, [temp.productId])); // its variant and alerts go with it
  await page.goto(`${BASE}/p/${slug}`);
  const notify = page.getByRole("button", { name: "Notify me when it's back" });
  await notify.waitFor();
  await timed("Restock alert: notify me", () => notify.click(), () => page.getByText("We'll send you an SMS as soon as it's back in stock.").waitFor());
  assert(await one(`select 1 from "StockAlert" where "customerId" = $1 and "variantId" = $2 and "notifiedAt" is null`, [member.id, temp.id]), "stock alert saved");
  await page.reload();
  await page.getByText("We'll send you an SMS as soon as it's back in stock.").waitFor();
  ok("still shown as set after a reload");

  // ── 4a. Wishlist, a reorder reminder, buy again ────────────────────────────────────────────────────
  step("Wishlist: the heart on a product page, then Rewards → Wishlist");
  undo.push(() => q(`delete from "Wishlist" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]));
  await page.goto(`${BASE}/p/${member.productSlug}`);
  const buyBox = page.locator("#buy-box"); // (the related products' cards carry hearts of their own)
  const heart = buyBox.getByRole("button", { name: "Save to your wishlist", exact: true });
  await heart.waitFor();
  await timed("Wishlist: save", () => heart.click(), () => buyBox.getByRole("button", { name: "Remove from your wishlist", exact: true }).waitFor());
  assert(await one(`select 1 from "Wishlist" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]), "saved to the wishlist");
  await page.goto(`${BASE}/club/wishlist`);
  await page.getByRole("heading", { name: "Your wishlist" }).waitFor();
  await page.getByRole("link", { name: member.productName, exact: true }).first().waitFor();
  await shot(page, "wishlist");
  ok("listed under Rewards → Wishlist");
  await timed("Wishlist: remove", () => page.getByRole("button", { name: `Remove ${member.productName} from your wishlist` }).first().click(), () => page.getByRole("heading", { name: "Nothing saved yet" }).waitFor());
  assert(!(await one(`select 1 from "Wishlist" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0])), "removed again");

  step("Reorder reminder on an everyday product (every 30 days by SMS), then stop it");
  const everyday = await one(
    `select p.slug, p.name from "Product" p
     where p.status = 'ACTIVE' and p."regClass" = 'CBD_FOOD' and exists (select 1 from "Variant" v where v."productId" = p.id and v.active)
       and not exists (select 1 from "ReorderReminder" r join "Variant" v on v.id = r."variantId" where v."productId" = p.id and r."customerId" = $1 and r.active)
     order by p.name limit 1`,
    [member.id],
  );
  if (everyday) {
    undo.push(() => q(`delete from "ReorderReminder" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]));
    await page.goto(`${BASE}/p/${everyday.slug}`);
    await timed("Reminder: open", () => page.getByRole("button", { name: "Remind me to reorder" }).click(), () => page.getByRole("button", { name: "Set reminder" }).waitFor());
    await timed("Reminder: set", () => page.getByRole("button", { name: "Set reminder" }).click(), () => page.getByText(/We'll remind you every 30 days by SMS/).waitFor());
    const rem = await one(`select id, "everyDays", channel, active from "ReorderReminder" where "customerId" = $1 and "createdAt" >= $2 order by "createdAt" desc limit 1`, [member.id, t0]);
    assert(rem?.everyDays === 30 && rem.channel === "SMS" && rem.active, `reminder saved for ${everyday.name}: every 30 days by SMS`);
    await page.goto(`${BASE}/club/reminders`);
    await page.getByRole("heading", { name: "Reorder reminders" }).waitFor();
    await shot(page, "reminders");
    await timed("Reminder: stop", () => page.getByRole("button", { name: `Stop the reminder for ${everyday.name}` }).first().click(), () => page.getByText(/Every 30 days by SMS/).waitFor({ state: "detached" }));
    assert(!(await one(`select 1 from "ReorderReminder" where id = $1 and active`, [rem.id])), "reminder stopped");
  } else ok("(skipped: no CBD food & drink product to remind about)");

  step("Buy again from an order's tracking page");
  await page.goto(`${BASE}/orders/${code}`);
  const again = page.getByRole("button", { name: "Buy again" });
  await again.waitFor();
  const outcome = page.getByRole("status").filter({ hasText: /Added \d+ items? to your bag|Nothing could be added/ }).first();
  await timed("Order: buy again", () => again.click(), () => outcome.waitFor());
  const outcomeText = (await outcome.textContent()).trim().replace(/\s+/g, " ");
  const bagCookie = (await ctx.cookies()).find((c) => c.name === "hh_cart");
  assert(!/^Added/.test(outcomeText) || !!bagCookie, `buy again: ${outcomeText.slice(0, 140)}`);
  await ctx.clearCookies({ name: "hh_cart" });

  // ── 4b. Support: ask for help, then reply from Rewards → Help ───────────────────────────────────────
  step("Support: a request from /support (details filled in for the signed-in member), then a reply on it");
  undo.push(async () => {
    await q(`delete from "MessageLog" where id like 'support-%' and "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]);
    await q(`delete from "SupportTicket" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]); // messages go with it
  });
  await page.goto(`${BASE}/support`);
  await page.getByRole("heading", { level: 1, name: "How can we help?" }).waitFor();
  assert((await page.getByLabel("Your name").inputValue()).startsWith(member.firstName), "the member's name is filled in");
  assert((await page.getByRole("dialog", { name: "Are you 18 or older?" }).count()) === 0, "no age gate on the help page");
  const subject = `E2E points question ${rand()}`;
  await page.getByLabel("What's it about?").selectOption("REWARDS");
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("What happened?").fill("I bought a grinder on Saturday and the points never showed up on my card.");
  await shot(page, "support-form");
  await timed("Support: send → my request", () => page.getByRole("button", { name: "Send", exact: true }).click(), async () => {
    await page.waitForURL(/\/club\/support\/[^/?]+\?sent=1/);
    await page.getByRole("heading", { level: 1, name: subject }).waitFor();
  });
  const ticket = await one(`select id, number, status, "firstResponseDueAt", "resolveDueAt", "customerId", email, phone from "SupportTicket" where subject = $1`, [subject]);
  assert(ticket?.customerId === member.id && ticket.status === "OPEN" && ticket.firstResponseDueAt > t0 && ticket.resolveDueAt > ticket.firstResponseDueAt, `ticket ${ticket?.number} opened: SLA deadlines set`);
  const ack = await one(`select channel from "MessageLog" where "customerId" = $1 and body like $2 and "createdAt" >= $3`, [member.id, `%${ticket.number}%`, t0]);
  assert(ack && (ticket.email ? ack.channel === "EMAIL" : ack.channel === "SMS"), `acknowledged by ${ack?.channel}`);
  await shot(page, "support-ticket");
  await page.getByLabel("Your reply").fill("Also, the till slip shows the card was scanned.");
  await timed("Support: reply", () => page.getByRole("button", { name: "Send reply" }).click(), () => page.getByText("Sent. We'll reply within one business day.").waitFor());
  const msgs = (await one(`select count(*)::int n from "SupportMessage" where "ticketId" = $1`, [ticket.id])).n;
  assert(msgs === 2, "the reply is on the thread (2 messages)");
  await page.goto(`${BASE}/club/support`);
  await page.getByRole("heading", { level: 1, name: "Help & returns" }).waitFor();
  await page.getByRole("link", { name: new RegExp(esc(subject)) }).waitFor();
  ok("listed under Rewards → Help");

  // ── 4c. Returns: report a problem with a delivered order ─────────────────────────────────────────
  const returnable = await one(
    `select o.code from "Order" o where o."customerId" = $1 and o.status = 'COMPLETED' and o."completedAt" > now() - interval '150 days'
       and not exists (select 1 from "ReturnRequest" r where r."orderId" = o.id)
       and exists (select 1 from "OrderLine" l join "Variant" v on v.id = l."variantId" join "Product" p on p.id = v."productId" where l."orderId" = o.id and p."regClass" <> 'THC')
     order by o."completedAt" desc limit 1`,
    [member.id],
  );
  if (returnable) {
    step(`Returns: report a faulty item on delivered order ${returnable.code}`);
    undo.push(async () => {
      await q(`delete from "MessageLog" where id like 'return-%' and "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]);
      await q(`delete from "ReturnRequest" where "customerId" = $1 and "createdAt" >= $2`, [member.id, t0]);
    });
    await page.goto(`${BASE}/orders/${returnable.code}`);
    await timed("Order → return form", () => page.getByRole("link", { name: "Return or report a problem" }).click(), () => page.getByRole("heading", { level: 1, name: "Return or report a problem" }).waitFor());
    assert(await page.getByRole("radio", { name: /It's faulty/ }).isChecked(), "“It's faulty” is the default reason (6 months, CPA s56)");
    const qtyBox = page.getByRole("combobox", { name: /^Quantity of / }).first();
    await qtyBox.selectOption("1");
    await page.getByLabel(/Anything we should know/).fill("The seal was broken when it arrived.");
    await shot(page, "return-form");
    await timed("Return: send request", () => page.getByRole("button", { name: "Send return request" }).click(), () => page.waitForURL(/\/return\?done=RT-\d+/));
    const rt = await one(`select r.number, r.status, r.reason, r.items, r."storeId" = o."storeId" "sameStore" from "ReturnRequest" r join "Order" o on o.id = r."orderId" where o.code = $1 and r."customerId" = $2`, [returnable.code, member.id]);
    assert(rt?.status === "REQUESTED" && rt.reason === "DEFECTIVE" && rt.items.length === 1 && rt.items[0].qty === 1 && rt.sameStore, `${rt?.number} requested: one unit, faulty, filed with the fulfilling store`);
    await page.getByText(`Thanks. Your return request is ${rt.number}.`).waitFor();
    await shot(page, "return-requested");
  } else step("Returns: skipped (this member has no delivered order to return)");

  // ── 5. Drops and events ─────────────────────────────────────────────────────────────────────────────
  step("Drops: “notify me” for an upcoming drop");
  let drop = await one(
    `select id, slug, name from "Drop" d where d."startsAt" - make_interval(mins => d."earlyMinutes") > now() + interval '1 hour'
       and not exists (select 1 from "DropWatch" w where w."dropId" = d.id and w."customerId" = $1) order by d."startsAt" limit 1`,
    [member.id],
  );
  if (!drop) {
    drop = await one(`insert into "Drop" (id, slug, name, blurb, "startsAt") values (gen_random_uuid()::text, $1, 'E2E test drop', 'A throwaway drop for the end-to-end test.', now() + interval '7 days') returning id, slug, name`, [`e2e-drop-${Date.now().toString(36)}`]);
    undo.push(() => q(`delete from "Drop" where id = $1`, [drop.id]));
  }
  undo.push(() => q(`delete from "DropWatch" where "dropId" = $1 and "customerId" = $2`, [drop.id, member.id]));
  await page.goto(`${BASE}/drops`);
  await timed("Drops → drop page", () => page.locator(`main a[href="/drops/${drop.slug}"]`).first().click(), () => page.getByRole("heading", { level: 1, name: drop.name }).waitFor());
  await timed("Drop: notify me", () => page.getByRole("button", { name: "Notify me when it opens" }).click(), () => page.getByText("You're on the list", { exact: true }).waitFor());
  assert(await one(`select 1 from "DropWatch" where "dropId" = $1 and "customerId" = $2`, [drop.id, member.id]), `watching “${drop.name}”`);
  await shot(page, "drop-watch");

  step("Events: reserve a place, then give it back");
  let event = await one(
    `select e.id, e.slug, e.title from "StoreEvent" e where e."endsAt" > now() + interval '1 hour' and e.capacity > (select count(*) from "Rsvp" r where r."eventId" = e.id)
       and not exists (select 1 from "Rsvp" r where r."eventId" = e.id and r."customerId" = $1) order by e."startsAt" limit 1`,
    [member.id],
  );
  if (!event) {
    event = await one(
      `insert into "StoreEvent" (id, slug, "storeId", title, blurb, "startsAt", "endsAt", capacity)
       select gen_random_uuid()::text, $1, id, 'E2E members'' evening', 'A throwaway event for the end-to-end test.', now() + interval '3 days', now() + interval '3 days 2 hours', 20
       from "Store" where kind = 'RETAIL' and status = 'ACTIVE' order by code limit 1 returning id, slug, title`,
      [`e2e-event-${Date.now().toString(36)}`],
    );
    undo.push(() => q(`delete from "StoreEvent" where id = $1`, [event.id]));
  }
  undo.push(() => q(`delete from "Rsvp" where "eventId" = $1 and "customerId" = $2`, [event.id, member.id]));
  await page.goto(`${BASE}/events/${event.slug}`);
  await timed("Event: reserve my place", () => page.getByRole("button", { name: "Reserve my place" }).click(), () => page.getByText("Your ticket", { exact: true }).waitFor());
  const rsvp = await one(`select code from "Rsvp" where "eventId" = $1 and "customerId" = $2`, [event.id, member.id]);
  assert(rsvp && (await page.getByText(rsvp.code, { exact: true }).isVisible()), `place reserved at “${event.title}”: ticket ${rsvp?.code} shown`);
  await shot(page, "event-ticket");
  await page.getByRole("button", { name: "Cancel my place" }).click();
  await timed("Event: cancel my place", () => page.getByRole("button", { name: "Yes, cancel my place" }).click(), () => page.getByRole("heading", { name: "Reserve your place" }).waitFor());
  assert(!(await one(`select 1 from "Rsvp" where "eventId" = $1 and "customerId" = $2`, [event.id, member.id])), "place given back (ticket removed)");

  step("Member signs out");
  await page.goto(`${BASE}/club/settings`);
  await timed("Sign out → home", () => page.getByRole("button", { name: "Sign out" }).click(), () => page.getByRole("link", { name: "Sign in to Herbal Holland Rewards" }).waitFor());
  assert(!(await one(`select 1 from "Session" where id = $1`, [session.id])), "session ended");
  await page.goto(`${BASE}/club/orders`);
  await page.waitForURL(/\/club\/join\?next=/);
  ok("Rewards pages ask them to sign in again");
  await ctx.close(); // one browser, one live context at a time

  // ── 6. A friend joins with the member's link ────────────────────────────────────────────────────────
  step("A friend opens the member's share link and joins with the referral");
  friendCtx = await browser.newContext(PHONE);
  const friend = watch(await friendCtx.newPage(), "friend");
  await friend.goto(`${BASE}${shareUrl}`);
  const fgate = friend.getByRole("dialog", { name: "Are you 18 or older?" });
  await fgate.getByRole("button", { name: "I'm 18 or older" }).click();
  await fgate.waitFor({ state: "detached" });
  await friend.getByText(`An invite from ${member.firstName}`).waitFor();
  await shot(friend, "share-card");
  await timed("Share card → join page", () => friend.getByRole("link", { name: `Join with ${member.firstName}'s link` }).click(), () => friend.getByRole("heading", { level: 1, name: `${member.firstName} invited you` }).waitFor());
  const phone = `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  await phoneCode(friend, phone, "Join");
  await timed("Join: verify → details step", () => friend.getByRole("button", { name: "Verify" }).click(), () => friend.getByText("Welcome: one quick step").waitFor());
  // First try with an email address another member already uses (with a passport, so the age check waits for later).
  const homes = await friend.getByLabel("Home store").locator("option:not([disabled])").evaluateAll((els) => els.map((o) => o.value));
  const home = homes[Math.floor(Math.random() * homes.length)];
  const dob = "1994-05-17";
  const friendEmail = friend.getByLabel(/Email for invoices/);
  await friend.getByLabel("First name").fill("Zanele");
  await friendEmail.fill(taken);
  await friend.getByRole("radio", { name: "Passport" }).click();
  await friend.getByLabel("Date of birth").fill(dob);
  await friend.getByLabel("Home store").selectOption(home);
  await friend.getByLabel("SMS").check();
  await friend.getByLabel("Email", { exact: true }).check();
  await friend.getByLabel("CBD & wellness").check();
  await friend.getByText(`Invited by ${member.firstName}`).waitFor();
  await friend.getByLabel(/I'm 18 or older and I accept/).check();
  await shot(friend, "join-referral");
  await timed("Join: create account (email taken)", () => friend.getByRole("button", { name: /Join and continue/ }).click(), () => friend.getByText("That email is already linked to another member").waitFor());
  const kept = [
    (await friend.getByLabel("First name").inputValue()) === "Zanele",
    (await friendEmail.inputValue()) === taken,
    (await friend.getByLabel("Date of birth").inputValue()) === dob,
    (await friend.getByLabel("Home store").inputValue()) === home,
    await friend.getByLabel("SMS").isChecked(),
    await friend.getByLabel("Email", { exact: true }).isChecked(),
    !(await friend.getByLabel("WhatsApp").isChecked()),
    await friend.getByLabel("CBD & wellness").isChecked(),
    await friend.getByLabel(/I'm 18 or older and I accept/).isChecked(),
  ];
  assert(kept.every(Boolean), `email already in use: inline error; name, date of birth, home store, opt-ins, interests and terms tick all kept (${kept.map(Number).join("")})`);
  await friendEmail.fill(`zanele.${phone}@example.co.za`);
  await timed("Join: create account → card", () => friend.getByRole("button", { name: /Join and continue/ }).click(), () => friend.getByText("Welcome to Herbal Holland Rewards, Zanele!").waitFor());
  const pal = await one(`select id, "referredById", source, "consentSms", "consentEmail", "consentWhatsapp", interests, "homeStoreId", points, "termsVersion", "ageVerifiedAt" from "Customer" where phone = $1`, [`+27${phone.slice(1)}`]);
  assert(pal?.referredById === member.id && pal.source === "REFERRAL", `joined as a referral of ${member.memberNo} (referredById + source REFERRAL)`);
  assert(pal.consentSms && pal.consentEmail && !pal.consentWhatsapp && pal.interests.includes("CBD") && pal.homeStoreId === home && pal.termsVersion, "SMS and email marketing opted in, into CBD, home store as chosen; membership terms recorded");
  assert(!pal.ageVerifiedAt, "joined with a passport: age not verified yet");
  await shot(friend, "friend-club");

  // ── 7. Learn quest: points once only ───────────────────────────────────────────────────────────────
  const { QUESTS } = await import(new URL("../src/lib/quests.ts", import.meta.url));
  const [key, quest] = Object.entries(QUESTS).sort((a, b) => a[1].questions.length - b[1].questions.length)[0];
  step(`Learn quest “${quest.title}”: wrong answer, then right, then again from a second tab`);
  const answer = async (p, picks) => {
    for (const [i, pick] of picks.entries()) {
      const btn = p.getByRole("button", { name: new RegExp(`^[A-Z]?\\s*${esc(quest.questions[i].options[pick])}$`) });
      if (i < picks.length - 1) await btn.click();
      else return btn;
    }
  };
  const right = quest.questions.map((x) => x.answer);
  const wrong = right.map((a, i) => (i === right.length - 1 ? (a + 1) % quest.questions[i].options.length : a));
  const tab2 = watch(await friendCtx.newPage(), "friend tab 2");
  await tab2.goto(`${BASE}/learn/${key}`);
  await tab2.getByRole("heading", { name: `Quick quiz: ${quest.title}` }).waitFor();
  await friend.goto(`${BASE}/learn/${key}`);
  await friend.getByRole("heading", { name: `Quick quiz: ${quest.title}` }).waitFor();
  // Two tabs: drive whichever is in front (Chromium throttles a background tab's rendering, which isn't the app's time).
  await friend.bringToFront();
  const last = await answer(friend, wrong);
  await timed("Quest: submit (wrong)", () => last.click(), () => friend.getByRole("heading", { name: "Not quite, try again" }).waitFor());
  assert(!(await one(`select 1 from "QuestCompletion" where "customerId" = $1`, [pal.id])), "a wrong answer earns nothing");
  await friend.getByRole("button", { name: "Try again" }).click();
  const last2 = await answer(friend, right);
  await timed("Quest: submit (right)", () => last2.click(), () => friend.getByRole("heading", { name: `+${quest.points} points` }).waitFor());
  await shot(friend, "quest-passed");
  const after1 = await one(`select points from "Customer" where id = $1`, [pal.id]);
  assert(after1.points === pal.points + quest.points, `+${quest.points} points on the card (${pal.points} → ${after1.points})`);
  await tab2.bringToFront();
  const last3 = await answer(tab2, right);
  await timed("Quest: submit again (second tab)", () => last3.click(), () => tab2.getByText("you've already earned the points for this one").waitFor());
  const after2 = await one(`select points, (select count(*)::int from "LoyaltyEntry" where "customerId" = $1 and kind = 'BONUS') bonus from "Customer" where id = $1`, [pal.id]);
  assert(after2.points === after1.points && after2.bonus === 1, "the same quiz again earns nothing (one completion, one bonus entry)");
  await friend.reload();
  await friend.getByRole("heading", { name: "Quest complete" }).waitFor();
  ok("the guide now shows the quest as complete");
  await tab2.close();
  await friend.bringToFront();

  // ── 8. Unsubscribe link ─────────────────────────────────────────────────────────────────────────────
  step("Unsubscribe links (signed the way campaign emails sign them)");
  // The app's own helper makes the tokens (same SESSION_SECRET as the server: the environment, else .env).
  const tokens = JSON.parse(
    execFileSync(`${ROOT}node_modules/.bin/tsx`, ["--env-file-if-exists=.env", "-e", `import { optOutToken } from "./src/server/messaging.ts"; const id = process.argv.at(-1); console.log(JSON.stringify({ SMS: optOutToken(id, "SMS"), EMAIL: optOutToken(id, "EMAIL") }));`, pal.id], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").pop(),
  );
  await friend.goto(`${BASE}/unsubscribe?c=${pal.id}&ch=SMS&t=${tokens.SMS.slice(0, -1)}x`);
  await friend.getByRole("heading", { name: "This link has expired" }).waitFor();
  ok("a tampered link is refused");
  await friend.goto(`${BASE}/unsubscribe?c=${pal.id}&ch=SMS&t=${tokens.SMS}`);
  const heading = await friend.getByRole("heading", { level: 1 }).textContent();
  if (/expired/.test(heading)) fail("the unsubscribe token isn't accepted. Is SESSION_SECRET the same for this script and the server?");
  await timed("Unsubscribe: stop texts", () => friend.getByRole("button", { name: "Stop marketing texts" }).click(), () => friend.getByText(/Done\. You won't get marketing texts/).waitFor());
  const smsNow = await one(`select c."consentSms", e.source from "Customer" c join "ConsentEvent" e on e."customerId" = c.id and e.channel = 'SMS' where c.id = $1 order by e."createdAt" desc limit 1`, [pal.id]);
  assert(smsNow.consentSms === false && smsNow.source === "UNSUBSCRIBE_LINK", "SMS marketing withdrawn, recorded as UNSUBSCRIBE_LINK");
  await shot(friend, "unsubscribed");
  const oneClick = await friendCtx.request.post(`${BASE}/api/unsubscribe?c=${pal.id}&ch=EMAIL&t=${tokens.EMAIL}`, { form: { "List-Unsubscribe": "One-Click" } });
  assert(oneClick.ok() && (await one(`select "consentEmail" from "Customer" where id = $1`, [pal.id])).consentEmail === false, "one-click (RFC 8058) POST withdraws email marketing");

  step("Age verification in Rewards settings: an SA ID number with a typo, then the right one");
  await friend.goto(`${BASE}/club/settings`);
  const idBox = friend.getByLabel("SA ID number");
  const goodId = saId();
  const typo = `${goodId.slice(0, 12)}${(Number(goodId[12]) + 1) % 10}`;
  await idBox.fill(typo);
  await timed("Settings: verify age (typo)", () => friend.getByRole("button", { name: "Verify", exact: true }).click(), () => friend.getByText("Check digit does not match. Please re-check the number.").waitFor());
  assert((await idBox.inputValue()) === typo, "a wrong check digit is refused; the number stays in the box to correct");
  await idBox.fill(goodId);
  await timed("Settings: verify age", () => friend.getByRole("button", { name: "Verify", exact: true }).click(), () => friend.getByText(`SA ID number checked (••••${goodId.slice(-4)})`).waitFor());
  const aged = await one(`select "ageCheck", "ageVerifiedAt", "idLast4" from "Customer" where id = $1`, [pal.id]);
  assert(aged.ageCheck === "ID_NUMBER" && aged.ageVerifiedAt && aged.idLast4 === goodId.slice(-4), "age verified from the ID number (only the last four digits kept)");
  await shot(friend, "age-verified");
  await friendCtx.close();

  // ── 9. Staff sign-in ────────────────────────────────────────────────────────────────────────────────
  step("Staff sign-in: wrong password, right password → home, sign out");
  const demoHash = (await one(`select "passwordHash" from "User" where email = 'hq@herbalholland.co.za'`))?.passwordHash;
  const manager = await one(
    `select u.id, u.email, u.name, s.code from "User" u join "Store" s on s.id = u."storeId" where u.role = 'MANAGER' and u.active and not u."mustChangePassword" and u."passwordHash" = $1 and s.status = 'ACTIVE' order by random() limit 1`,
    [demoHash],
  );
  if (!manager) fail("seed data: no store manager with the demo password");
  const tempEmail = `e2e.${Date.now().toString(36)}@example.co.za`;
  const tempUser = await one(
    `insert into "User" (id, name, email, "passwordHash", "mustChangePassword", role, "storeId", "companyId")
     select gen_random_uuid()::text, 'E2E Temporary Manager', $1, "passwordHash", true, role, "storeId", "companyId" from "User" where id = $2 returning id`,
    [tempEmail, manager.id],
  );
  undo.push(() => q(`delete from "User" where id = $1`, [tempUser.id]));
  staffCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const staff = watch(await staffCtx.newPage(), "staff");
  const signIn = async (who, pw) => {
    await staff.getByLabel("Work email").fill(who);
    await staff.getByLabel("Password").fill(pw);
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await staff.goto(`${BASE}/login`);
  await timed("Staff sign-in: wrong password", () => signIn(tempEmail, "not-the-password"), () => staff.getByText("That email and password don't match.").waitFor());
  assert((await staff.getByLabel("Work email").inputValue()) === tempEmail, "wrong password: error shown, email kept");
  await shot(staff, "login-error");
  await timed("Staff sign-in: manager → store", () => signIn(manager.email, "holland"), () => staff.waitForURL(new RegExp(`/store/${manager.code}(\\?|$)`)));
  const staffSession = await one(`select id from "Session" where "userId" = $1 and "createdAt" >= $2 order by "createdAt" desc limit 1`, [manager.id, t0]);
  assert(staffSession, `${manager.name} lands on their store /store/${manager.code}`);
  await timed("Staff: sign out", () => staff.getByRole("button", { name: "Sign out" }).click(), () => staff.waitForURL(`${BASE}/login`));
  assert(!(await one(`select 1 from "Session" where id = $1`, [staffSession.id])), "signed out: session ended");
  await staff.goto(`${BASE}/store/${manager.code}`);
  await staff.waitForURL(/\/login/);
  ok("the back office asks for a sign-in again");

  step("First sign-in with a temporary password: choose your own (throwaway user)");
  await timed("Staff sign-in: temporary password", () => signIn(tempEmail, "holland"), () => staff.getByRole("heading", { name: "Choose your own password" }).waitFor());
  ok("sent to choose a password before anything else");
  const newPw = `E2E-${rand()}-${rand()}`;
  const pw = (label) => staff.getByLabel(label, { exact: true });
  await pw("Current password").fill("holland");
  await pw("New password").fill(newPw);
  await pw("Confirm new password").fill(`${newPw}x`);
  await timed("Password: save (mismatch)", () => staff.getByRole("button", { name: "Save password" }).click(), () => staff.getByText("The two new passwords don't match.").waitFor());
  ok("mismatched confirmation refused");
  await pw("Current password").fill("holland");
  await pw("New password").fill(newPw);
  await pw("Confirm new password").fill(newPw);
  await timed("Password: save → store", () => staff.getByRole("button", { name: "Save password" }).click(), () => staff.waitForURL(new RegExp(`/store/${manager.code}(\\?|$)`)));
  const changed = await one(`select "mustChangePassword", "passwordHash" <> $2 changed from "User" where id = $1`, [tempUser.id, demoHash]);
  assert(changed.mustChangePassword === false && changed.changed, "password changed; no longer forced; lands on the store");
  await staff.getByRole("button", { name: "Sign out" }).click();
  await staff.waitForURL(`${BASE}/login`);
  await signIn(tempEmail, "holland");
  await staff.getByText("That email and password don't match.").waitFor();
  ok("the temporary password no longer works");
  await signIn(tempEmail, newPw);
  await staff.waitForURL(new RegExp(`/store/${manager.code}(\\?|$)`));
  ok("the new password signs straight in");
  await staff.getByRole("button", { name: "Sign out" }).click();
  await staff.waitForURL(`${BASE}/login`);

  if (problems.length) fail(`${problems.length} page error(s), listed below`);
  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n")[0]);
  for (const p of [page, ...(friendCtx?.pages() ?? []), ...(staffCtx?.pages() ?? [])].filter(Boolean)) await shot(p, "FAILED").catch(() => undefined);
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
