// Audit trail for sensitive till actions that have no record of their own: the cash drawer opened outside a sale
// (manager PIN), training mode started or ended, a queued offline sale discarded (manager PIN) after the server refused it. The till posts them at once when online and queues them in
// localStorage when offline (storage.QueuedAudit), replaying the queue on sync — each entry carries its own id so a
// retry never writes twice.
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf, json, readBody, withStaff } from "@/server/pos/http";
import { Uuid } from "@/server/pos/schemas";

const ACTIONS = { "drawer.open": "pos.drawer_open", "training.start": "pos.training_start", "training.end": "pos.training_end", "outbox.discard": "pos.outbox_discard" } as const;

const Entry = z.object({
  id: Uuid,
  action: z.enum(["drawer.open", "training.start", "training.end", "outbox.discard"]),
  at: z.string().datetime({ offset: true }),
  staffId: z.string().optional(), // who did it (offline entries sync under whoever is signed in)
  staffName: z.string().max(80).optional(),
  note: z.string().trim().max(200).optional(),
});
const Body = z.object({ entries: z.array(Entry).min(1).max(50) });

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const storeId = pos.device.storeId;
  let written = 0;
  for (const e of b.entries) {
    const dup = await db.auditLog.findFirst({ where: { entity: "Device", entityId: pos.device.id, action: ACTIONS[e.action], data: { path: ["clientId"], equals: e.id } }, select: { id: true } });
    if (dup) continue;
    let actor = actorOf(pos);
    if (e.staffId && e.staffId !== pos.user.id) {
      const u = await db.user.findFirst({ where: { id: e.staffId, storeId, active: true }, select: { id: true, name: true } });
      if (u) actor = { type: "USER", id: u.id, name: u.name };
    }
    const late = Date.now() - Date.parse(e.at) > 60_000;
    await audit(db, actor, ACTIONS[e.action], {
      storeId,
      entity: "Device",
      entityId: pos.device.id,
      data: { clientId: e.id, at: e.at, device: pos.device.name, ...(e.note && { note: e.note }), ...(late && { offline: true }) },
    });
    written++;
  }
  return json({ ok: true, written });
});
