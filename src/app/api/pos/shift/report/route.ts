// Z-report for a shift on this till (defaults to the most recent) — for re-printing.
import { db } from "@/server/db";
import { json, withStaff, PosError } from "@/server/pos/http";
import { lastShiftId, zReport } from "@/server/pos/shift";

export const GET = withStaff(async (req, pos) => {
  const id = new URL(req.url).searchParams.get("id") ?? (await lastShiftId(pos.device));
  if (!id) throw new PosError("No shifts on this till yet", 404);
  const shift = await db.shift.findUnique({ where: { id }, select: { storeId: true } });
  if (!shift || shift.storeId !== pos.device.storeId) throw new PosError("Shift not found at this store", 404);
  return json({ report: await zReport(id) });
});
