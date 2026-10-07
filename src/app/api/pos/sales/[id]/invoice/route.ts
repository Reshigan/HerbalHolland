// Emails the tax invoice for a sale — e.g. a walk-in customer who asks for it at the counter.
import { z } from "zod";
import { db } from "@/server/db";
import { emailSaleInvoice } from "@/server/invoices";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ email: z.string().trim().toLowerCase().email("That email doesn't look right") });

export const POST = withStaff<Ctx>(async (req, pos, { params }) => {
  const { id } = await params;
  const { email } = await readBody(req, Body);
  const sale = await db.sale.findUnique({ where: { id }, select: { storeId: true } });
  if (!sale || sale.storeId !== pos.device.storeId) throw new PosError("Sale not found at this store", 404);
  try {
    await emailSaleInvoice(id, email);
  } catch (e) {
    console.error("[pos] invoice email failed", id, e);
    throw new PosError("We couldn't send the email just now. Try again in a moment", 502);
  }
  return json({ ok: true, email });
});
