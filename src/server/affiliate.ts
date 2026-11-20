// The affiliate scheme: a member earns affiliatePct of what each friend they referred pays (before VAT, less points and
// medicines), as rand credit on one wallet voucher of their own (GiftVoucher.affiliateOfId). The wallet is spent at the
// till like a gift voucher, only by its member and not on medicines (checkVoucherTenders). Each top-up or clawback is an
// AffiliateCredit row, written first: its unique saleId makes a re-run skip, so a stop halfway misses a credit, never
// doubles one. HQ funds the credit (ledger source "affiliate"); what expires unspent is breakage, as for any voucher.
import { prismaCode, type Tx } from "./db";
import { queuePosting } from "./ledger/core";
import { affiliateClawback } from "@/lib/loyalty-rules";
import { makeVoucherCode, voucherExpiry } from "@/lib/vouchers";

/** The member's wallet voucher, made on first use. */
export async function walletTx(t: Tx, customerId: string) {
  const found = await t.giftVoucher.findUnique({ where: { affiliateOfId: customerId } });
  if (found) return found;
  const now = new Date();
  try {
    return await t.giftVoucher.create({
      data: { code: makeVoucherCode(), amountCents: 0, balanceCents: 0, status: "ACTIVE", issuedAt: now, expiresAt: voucherExpiry(now), affiliateOfId: customerId, purchasedByCustomerId: customerId },
    });
  } catch (e) {
    if (prismaCode(e) !== "P2002") throw e;
    return t.giftVoucher.findUniqueOrThrow({ where: { affiliateOfId: customerId } }); // made by a sale at the same moment
  }
}

/** Puts a friend's share into the referrer's wallet. An erased (POPIA) referrer earns nothing more. */
export async function creditAffiliateTx(t: Tx, a: { referrerId: string; friendId: string; saleId: string; orderId?: string; cents: number }) {
  if (a.cents <= 0) return;
  const referrer = await t.customer.findUnique({ where: { id: a.referrerId }, select: { phone: true } });
  if (!referrer || referrer.phone.startsWith("anon-")) return;
  if (await t.affiliateCredit.findUnique({ where: { saleId: a.saleId }, select: { id: true } })) return;
  const wallet = await walletTx(t, a.referrerId);
  const credit = await t.affiliateCredit.create({ data: { customerId: a.referrerId, friendId: a.friendId, voucherId: wallet.id, saleId: a.saleId, orderId: a.orderId, cents: a.cents } });
  await t.giftVoucher.update({
    where: { id: wallet.id },
    data: { amountCents: { increment: a.cents }, balanceCents: { increment: a.cents }, status: "ACTIVE", expiresAt: voucherExpiry(new Date()) },
  });
  await queuePosting(t, "affiliate", credit.id);
}

/** A refund of the friend's sale takes the share back in proportion, up to what is still in the wallet. */
export async function clawbackAffiliateTx(t: Tx, a: { origSaleId: string; refundSaleId: string; refundCents: number; origTotalCents: number }) {
  const credit = await t.affiliateCredit.findUnique({ where: { saleId: a.origSaleId } });
  if (!credit || credit.cents <= 0) return;
  if (await t.affiliateCredit.findUnique({ where: { saleId: a.refundSaleId }, select: { id: true } })) return;
  const wallet = await t.giftVoucher.findUnique({ where: { id: credit.voucherId }, select: { balanceCents: true } });
  const back = Math.min(affiliateClawback(credit.cents, a.refundCents, a.origTotalCents), wallet?.balanceCents ?? 0);
  if (back <= 0) return;
  const row = await t.affiliateCredit.create({ data: { customerId: credit.customerId, friendId: credit.friendId, voucherId: credit.voucherId, saleId: a.refundSaleId, cents: -back } });
  await t.giftVoucher.update({ where: { id: credit.voucherId }, data: { balanceCents: { decrement: back }, amountCents: { decrement: back } } });
  await queuePosting(t, "affiliate", row.id);
}
