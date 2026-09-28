// Offline bootstrap: everything the till caches to keep selling without a connection.
import { json, withStaff } from "@/server/pos/http";
import { buildBootstrap } from "@/server/pos/bootstrap";
import { db } from "@/server/db";

export const GET = withStaff(async (req, pos) => {
  await db.device.update({ where: { id: pos.device.id }, data: { lastSeenAt: new Date() } });
  return json(await buildBootstrap(pos.device, new URL(req.url).origin));
});
