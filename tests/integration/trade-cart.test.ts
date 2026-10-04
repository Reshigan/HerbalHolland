// The trade cart lives on the account: every buyer sees the same lines, and changes made at the same moment all land
// (read-modify-write under the cart row's lock). A cart left in the old browser cookie is taken over on the next change.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { COOKIE } from "@/server/auth";
import { getTradeCart, saveTradeCart, updateTradeCart } from "@/app/trade/_lib/cart";
import { addTradeLine, TRADE_CART_COOKIE } from "@/lib/trade-cart";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let accountId: string;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const a = await db.tradeAccount.create({
    data: { number: "TA-CART01", name: "Cart Café", legalName: "Cart Café (Pty) Ltd", email: "accounts@cart.example", addressLine: "1 Main Rd", city: "Pretoria", province: "GP", postalCode: "0001", status: "APPROVED" },
  });
  accountId = a.id;
  const buyer = await db.tradeBuyer.create({ data: { tradeAccountId: a.id, name: "Thandi", email: "thandi@cart.example" } });
  await db.session.create({ data: { id: sha256("buyer-token"), tradeBuyerId: buyer.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.trade, "buyer-token");
});
afterAll(() => db.$disconnect());

describe("Trade cart on the account", () => {
  it("keeps every line when several changes arrive at once", async () => {
    const variants = await db.variant.findMany({ take: 4, select: { id: true } });
    await Promise.all(variants.map((v) => updateTradeCart((cur) => addTradeLine(cur, v.id, 6, 6))));
    const row = await db.tradeCart.findUniqueOrThrow({ where: { tradeAccountId: accountId } });
    expect((row.items as { variantId: string; qty: number }[]).map((l) => l.variantId).sort()).toEqual(variants.map((v) => v.id).sort());
    expect(await getTradeCart()).toHaveLength(variants.length);
  });

  it("takes over a cart left in the old cookie, then clears it", async () => {
    await db.tradeCart.delete({ where: { tradeAccountId: accountId } });
    const [v] = await db.variant.findMany({ take: 1, select: { id: true } });
    jar.set(TRADE_CART_COOKIE, `${v.id}_12`);
    expect(await getTradeCart()).toEqual([{ variantId: v.id, qty: 12 }]); // shown until the next change
    await updateTradeCart((cur) => cur);
    expect(jar.has(TRADE_CART_COOKIE)).toBe(false);
    expect((await db.tradeCart.findUniqueOrThrow({ where: { tradeAccountId: accountId } })).items).toEqual([{ variantId: v.id, qty: 12 }]);
    await saveTradeCart([]);
    expect(await getTradeCart()).toEqual([]);
  });

  it("is empty for nobody signed in, and goes with the account", async () => {
    jar.delete(COOKIE.trade);
    expect(await getTradeCart()).toEqual([]);
    expect(await updateTradeCart(() => [{ variantId: "x".repeat(20), qty: 1 }])).toEqual([]);
    await db.tradeAccount.delete({ where: { id: accountId } });
    expect(await db.tradeCart.count({ where: { tradeAccountId: accountId } })).toBe(0);
    expect(w.store.id).toBeTruthy();
  });
});
