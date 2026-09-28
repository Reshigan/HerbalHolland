// Door list for one of the store's events as CSV: name and member number only. Managers and owners; audited.
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/store/context";
import { doorListCsv } from "@/server/hq/events";

export async function GET(_: Request, { params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  if (!canManageStore(user)) return new Response("Managers and owners can download the door list.", { status: 403 });
  const e = await db.storeEvent.findFirst({ where: { id, storeId: store.id }, include: { store: { select: { code: true } } } });
  if (!e) return new Response("Not found", { status: 404 });
  const { rows, response } = await doorListCsv(e);
  await audit(db, actorOf(user), "event.door_list", { storeId: store.id, entity: "StoreEvent", entityId: e.id, data: { rows } });
  return response;
}
