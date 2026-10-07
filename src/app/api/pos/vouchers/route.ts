// Gift voucher lookup for the till's "Gift voucher" tender: the code (typed or scanned) → what's on it, or why it can't
// pay right now (lib/vouchers.voucherProblem, in plain English). Read-only: the voucher is redeemed when the sale posts
// (sales.postPosSale), so this and the tender need the connection — a queued offline sale never carries one.
import { z } from "zod";
import { voucherForCheckout } from "@/server/shop/vouchers";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";
import type { VoucherLookupDTO } from "@/server/pos/types";

const Body = z.object({ code: z.string().trim().min(1, "Enter the voucher code").max(80) });

export const POST = withStaff(async (req) => {
  const b = await readBody(req, Body);
  const r = await voucherForCheckout(b.code);
  if (!r.ok) throw new PosError(r.error, 422, "VOUCHER");
  const v = r.voucher;
  const voucher: VoucherLookupDTO = { code: v.code, balanceCents: v.balanceCents, amountCents: v.amountCents, expiresAt: v.expiresAt.toISOString() };
  return json({ voucher });
});
