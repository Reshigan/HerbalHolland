// Who the crawl and the controls check sign in as: each role, how it signs in, which pages are its own and where it starts.
// The trade role makes a throwaway approved account and removes it in cleanup.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

export function makeRoles(db) {
  const staff = (email) => async (page) => {
    await page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}`);
  };
  async function member(page) {
    // A member with online orders and till sales, so their Rewards pages have history.
    const m = (await db.query(`select c.phone from "Customer" c where exists (select 1 from "Order" o where o."customerId" = c.id and o."paymentStatus" = 'PAID')
      and exists (select 1 from "Sale" s where s."customerId" = c.id) order by c."memberNo" limit 1`)).rows[0];
    await page.goto(`${BASE}/club/join?next=/club`);
    await page.getByLabel("Mobile number").fill(`0${m.phone.slice(3)}`);
    await page.getByRole("button", { name: /Send my code/ }).click();
    await page.getByRole("button", { name: "Fill it in" }).click();
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => u.pathname === "/club", { timeout: 30_000 });
  }

  /** The trade portal: a throwaway approved account (on account, every trade range, licences verified) signs in with the demo code. */
  let tradeAccountId = null;
  async function trade(page) {
    const email = `crawl.${Date.now().toString(36)}@example.co.za`;
    const row = (await db.query(
      `insert into "TradeAccount" (id, number, name, "legalName", kind, "regNumber", email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, "paymentDays", "creditLimitCents", classes, "adultAttestedAt", "termsVersion", "termsAcceptedAt", "approvedAt", "updatedAt")
       values (gen_random_uuid()::text, $1, 'Crawl Trade Co', 'Crawl Trade Co (Pty) Ltd', 'RETAILER', '2020/000001/07', $2, '+27123456789', '1 Crawl Street', 'Hatfield', 'Pretoria', 'GP', '0083', 'APPROVED', 'ACCOUNT', 30, 2000000,
         array['CBD','CBD_FOOD','CBD_TOPICAL','HEMP','SUPPLEMENT','ACCESSORY','APPAREL','GROW']::"RegClass"[], now(), 'trade-1', now(), now(), now()) returning id`,
      [`TA-9${String(Date.now() % 100000).padStart(5, "0")}`, email],
    )).rows[0];
    tradeAccountId = row.id;
    // What a retailer buying every range needs, verified; the document is a seeded one (the account page links to it).
    await db.query(
      `insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId", status, "reviewedAt")
       select gen_random_uuid()::text, $1, k::"TradeLicenceKind", 'E2E/' || k, (select "uploadId" from "TradeLicence" order by "createdAt" limit 1), 'VERIFIED', now() from unnest($2::text[]) k`,
      [row.id, ["CIPC_REGISTRATION", "FOOD_COA"]],
    );
    await db.query(`insert into "TradeBuyer" (id, "tradeAccountId", name, email, role) values (gen_random_uuid()::text, $1, 'Crawl Buyer', $2, 'OWNER')`, [row.id, email]);
    await page.goto(`${BASE}/trade/login`);
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send my code" }).click();
    await page.getByRole("button", { name: "Fill it in" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/trade/range", { timeout: 30_000 });
  }
  async function tradeCleanup() {
    if (!tradeAccountId) return;
    await db.query(`delete from "AuditLog" where "entityId" = $1 or "actorId" in (select id from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
    await db.query(`delete from "MessageLog" where "to" in (select email from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
    await db.query(`delete from "Otp" where email in (select email from "TradeBuyer" where "tradeAccountId" = $1)`, [tradeAccountId]);
    await db.query(`delete from "TradeAccount" where id = $1`, [tradeAccountId]); // buyers and sessions go with it
    tradeAccountId = null;
  }

  const SHOP = /^\/(?!(hq|store|account|menu|brand)(\/|$))/;
  const ROLES = [
    { name: "shopper", scope: SHOP, start: ["/", "/shop", "/stores", "/learn", "/drops", "/dispensary", "/club/join", "/cart", "/checkout", "/login", "/legal/terms", "/trade", "/trade/apply", "/trade/login", "/trade/terms"] },
    { name: "member", login: member, scope: SHOP, start: ["/club", "/club/orders", "/club/points", "/club/invoices", "/club/settings"] },
    { name: "manager", login: staff("manager.pta01@herbalholland.com"), scope: /^\/(store|account|menu|invoice|labels)(\/|$)/, start: ["/store/PTA01", "/labels/PTA01", "/labels/PTA01?size=talker"] },
    { name: "owner", login: staff("thabo@mokoenaretail.co.za"), scope: /^\/(store|account|books)(\/|$)/, start: ["/store"] },
    { name: "area", login: staff("area.gpn@herbalholland.com"), scope: /^\/(hq|store|books|insights)(\/|$)/, start: ["/hq"] },
    { name: "hq", login: staff("hq@herbalholland.com"), scope: /^\/(hq|store|menu|invoice|brand|books|insights)(\/|$)/, start: ["/hq"] },
    { name: "trade", login: trade, cleanup: tradeCleanup, scope: /^\/(trade|invoice)(\/|$)/, start: ["/trade/range", "/trade/cart", "/trade/checkout", "/trade/orders", "/trade/account", "/trade/statements"] },
    { name: "accountant", login: staff("books@mokoenaretail.co.za"), scope: /^\/(books|account)(\/|$)/, start: ["/books"] },
  ];
  return ROLES;
}
