"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, type ActionState } from "@/server/hq/guard";
import { str, bool } from "@/server/hq/form";

const KINDS = ["NEWS", "LAUNCH", "POLICY", "RECALL"];

export async function createAnnouncement(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const title = str(fd, "title");
  const body = str(fd, "body");
  const kind = str(fd, "kind");
  const audience = str(fd, "audience") || "ALL";
  if (title.length < 4) fields.title = "Give it a clear title";
  if (body.length < 10) fields.body = "Tell stores what they need to know";
  if (!KINDS.includes(kind)) fields.kind = "Choose a type";
  if (audience !== "ALL") {
    const [type, value] = audience.split(":");
    const ok = type === "region" ? await db.region.count({ where: { code: value } }) : type === "format" ? ["FLAGSHIP", "STANDARD", "EXPRESS"].includes(value) : false;
    if (!ok) fields.audience = "Choose who should see it";
  }
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const requiresAck = kind === "RECALL" || kind === "POLICY" ? true : bool(fd, "requiresAck");
  const a = await db.announcement.create({ data: { title, body, kind, audience, requiresAck } });
  await audit(db, g.actor, "announcement.create", { entity: "Announcement", entityId: a.id, data: { title, kind, audience, requiresAck } });
  revalidatePath("/hq/announcements");
  redirect(`/hq/announcements?a=${a.id}&created=1`);
}
