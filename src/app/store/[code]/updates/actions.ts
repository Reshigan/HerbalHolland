"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";

export async function acknowledge(code: string, announcementId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const a = await db.announcement.findFirst({
      where: { id: announcementId, audience: { in: ["ALL", `format:${store.format}`, `region:${store.region.code}`] } },
    });
    if (!a) return fail("That update isn't addressed to this store");
    const existing = await db.announcementAck.findUnique({ where: { announcementId_storeId: { announcementId, storeId: store.id } } });
    if (existing) return done("Already acknowledged.");
    await db.announcementAck.create({ data: { announcementId, storeId: store.id, userId: user.id } });
    await audit(db, actor, "announcement.ack", { storeId: store.id, entity: "Announcement", entityId: announcementId, data: { title: a.title } });
    revalidatePath(`/store/${store.code}/updates`);
    revalidatePath(`/store/${store.code}`);
    return done(`Acknowledged for ${store.name}.`);
  });
}
