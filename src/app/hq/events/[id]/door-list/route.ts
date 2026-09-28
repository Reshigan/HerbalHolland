// Door list for an event as CSV: name and member number only. Scoped like the event page; every export is audited.
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf, inScope, scopeOf } from "@/server/hq/guard";
import { doorListCsv } from "@/server/hq/events";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(HQ_ROLES);
  const e = await db.storeEvent.findUnique({ where: { id }, include: { store: { select: { code: true } } } });
  if (!e || !(await inScope(scopeOf(user), e.storeId))) return new Response("Not found", { status: 404 });
  const { rows, response } = await doorListCsv(e);
  await audit(db, actorOf(user), "event.door_list", { storeId: e.storeId, entity: "StoreEvent", entityId: e.id, data: { rows } });
  return response;
}
