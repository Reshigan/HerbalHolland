// Member detail for the till's customer panel: tier, points, age check, patient authorisation,
// Founding Member status, My Deals and this store's visits.
import { json, withStaff } from "@/server/pos/http";
import { customerDetail } from "@/server/pos/customers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withStaff<Ctx>(async (_req, pos, { params }) => {
  const { id } = await params;
  return json({ customer: await customerDetail(id, pos.device.storeId) });
});
