// Stock lookup: on hand here and available at nearby stores in the region (domain: inventory.availability).
import { json, withStaff } from "@/server/pos/http";
import { stockLookup } from "@/server/pos/stock";

export const GET = withStaff(async (req, pos) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ results: await stockLookup(pos.device.storeId, q) });
});
