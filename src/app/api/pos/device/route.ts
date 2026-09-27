// Unpairs this till (manager only). The device token stops working immediately.
import { db } from "@/server/db";
import { cookies } from "next/headers";
import { COOKIE, endSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { json, withStaff, actorOf, PosError } from "@/server/pos/http";

export const DELETE = withStaff(async (_req, pos) => {
  if (pos.user.role !== "MANAGER") throw new PosError("Only a store manager can unpair this till", 403);
  const open = await db.shift.count({ where: { deviceId: pos.device.id, closedAt: null } });
  if (open) throw new PosError("Close the shift before unpairing this till", 409);
  await db.device.update({ where: { id: pos.device.id }, data: { active: false } });
  await audit(db, actorOf(pos), "device.unpair", { storeId: pos.device.storeId, entity: "Device", entityId: pos.device.id });
  await endSession("pos");
  (await cookies()).delete(COOKIE.device);
  return json({ ok: true });
});
