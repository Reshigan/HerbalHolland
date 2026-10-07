// Online orders for this store's pick board (new, picking, ready, handed over today), or
// (with ?scan=) the single order behind a customer's collection QR, verified against its code.
import { json, withStaff } from "@/server/pos/http";
import { orderBoard, orderFromScan } from "@/server/pos/orders";

export const GET = withStaff(async (req, pos) => {
  const scan = new URL(req.url).searchParams.get("scan");
  if (scan) return json({ order: await orderFromScan(pos.device.storeId, scan) });
  return json({ orders: await orderBoard(pos.device.storeId), at: new Date().toISOString() });
});
