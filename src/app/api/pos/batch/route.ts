// Batch lookup for a scanned pack code or lab-certificate QR (read-only; domain: pos/batch.batchLookup).
import { fail, json, withStaff } from "@/server/pos/http";
import { batchLookup } from "@/server/pos/batch";

export const GET = withStaff(async (req, pos) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const batch = await batchLookup(pos.device.storeId, code);
  if (!batch) return fail(404, `No batch matches “${code.trim().toUpperCase()}”. Check the code on the pack`);
  return json({ batch });
});
