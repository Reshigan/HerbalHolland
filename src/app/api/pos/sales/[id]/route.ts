// A sale's receipt (with refundable quantities) for re-printing and refunds.
import { json, withStaff } from "@/server/pos/http";
import { receipt } from "@/server/pos/receipts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withStaff<Ctx>(async (_req, pos, { params }) => {
  const { id } = await params;
  return json({ receipt: await receipt(id, pos.device.storeId) });
});
