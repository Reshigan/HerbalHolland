// Referral credit paid out of the till in cash: the wallet goes down, the drawer expects less, the books post it, and
// the guards (balance, drawer, no wallet, own card) hold.
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { processLedgerQueue } from "@/server/ledger/core";
import { shiftCash } from "@/server/finance";
import { referralPayout } from "@/server/pos/shift";
import type { PosStaff } from "@/server/pos/http";
import { makeVoucherCode, voucherExpiry } from "@/lib/vouchers";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let pos: PosStaff;
let walletId: string;
const SHIFT = "shift-ref";

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db.shift.create({ data: { id: SHIFT, storeId: w.store.id, deviceId: w.device.id, openedById: w.manager.id, openingFloatCents: 50_000 } });
  const now = new Date();
  walletId = (await db.giftVoucher.create({ data: { code: makeVoucherCode(), amountCents: 30_000, balanceCents: 30_000, status: "ACTIVE", issuedAt: now, expiresAt: voucherExpiry(now), affiliateOfId: w.walkIn.id } })).id;
  pos = { user: await db.user.findUniqueOrThrow({ where: { id: w.manager.id } }), device: await db.device.findUniqueOrThrow({ where: { id: w.device.id }, include: { store: true } }) } as unknown as PosStaff;
});

describe("referral cash payout at the till", () => {
  it("pays out, lowers the wallet and the drawer, audits and posts", async () => {
    const paid = await referralPayout(pos, SHIFT, w.walkIn.id, 12_000);
    expect(paid.balanceCents).toBe(18_000);
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: walletId } })).balanceCents).toBe(18_000);
    expect(await shiftCash(SHIFT)).toMatchObject({ expectedCents: 38_000, paidOutCents: 12_000 });
    expect(await db.voucherRedemption.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({ voucherId: walletId, cents: 12_000 });
    expect(await db.cashMovement.findUniqueOrThrow({ where: { id: paid.id } })).toMatchObject({ kind: "PAID_OUT", expenseId: null });
    expect(await db.auditLog.count({ where: { action: "referral.cash_payout", entityId: SHIFT } })).toBe(1);
    expect(await db.alert.count({ where: { rule: "REFERRAL_PAYOUT" } })).toBe(0);
    await processLedgerQueue();
    expect(await db.ledgerQueue.count({ where: { source: "referral-payout" } })).toBe(0);
    expect(await db.journal.count({ where: { source: "referral-payout", sourceId: paid.id, status: "POSTED" } })).toBeGreaterThan(0);
  });

  it("refuses more than the balance or the drawer, and a member with no wallet", async () => {
    await expect(referralPayout(pos, SHIFT, w.walkIn.id, 18_001)).rejects.toMatchObject({ status: 422 });
    await expect(referralPayout(pos, SHIFT, w.walkIn.id, 4_999)).rejects.toMatchObject({ status: 422 }); // under the R50 least payout
    await db.cashMovement.create({ data: { shiftId: SHIFT, kind: "DROP", amountCents: 30_000, reason: "Safe", byId: w.manager.id } });
    await expect(referralPayout(pos, SHIFT, w.walkIn.id, 9_000)).rejects.toMatchObject({ status: 422 });
    await expect(referralPayout(pos, SHIFT, w.patient.id, 100)).rejects.toMatchObject({ status: 404 });
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: walletId } })).balanceCents).toBe(18_000);
  });

  it("raises a high alert when a manager pays out to their own card", async () => {
    await db.user.update({ where: { id: w.manager.id }, data: { memberId: w.walkIn.id } });
    const me = { ...pos, user: { ...pos.user, memberId: w.walkIn.id } } as PosStaff;
    await referralPayout(me, SHIFT, w.walkIn.id, 5_000);
    expect(await db.alert.findFirst({ where: { rule: "REFERRAL_PAYOUT" } })).toMatchObject({ severity: "HIGH", userId: w.manager.id });
  });
});
