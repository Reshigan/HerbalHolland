"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { DENIED, done, fail, guard, type ActionState } from "@/server/hq/guard";
import { opt, slugify, str } from "@/server/hq/form";
import { partnerKey } from "@/server/partners";

const httpsUrl = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** Adds a partner, or edits one when the form carries its id. The slug is fixed once set: printed QR codes and the key both use it. */
export async function savePartner(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const id = opt(fd, "id");
  const name = str(fd, "name");
  const agreement = str(fd, "agreement");
  const joinUrl = opt(fd, "joinUrl");
  if (!name) return fail("Enter the partner's name.", { name: "Required" });
  if (!agreement) return fail("Record the data-sharing agreement first.", { agreement: "Required" });
  if (joinUrl && !httpsUrl(joinUrl)) return fail("The join page must be an https link.", { joinUrl: "Must start with https://" });

  if (id) {
    await db.partnerBrand.update({ where: { id }, data: { name, agreement, joinUrl } });
    await audit(db, g.actor, "partner.update", { entity: "PartnerBrand", entityId: id, data: { name, joinUrl } });
  } else {
    const slug = slugify(str(fd, "slug") || name).slice(0, 32);
    if (!slug) return fail("Enter a link name with letters or numbers.", { slug: "Required" });
    if (await db.partnerBrand.findUnique({ where: { slug } })) return fail("Another partner already uses that link name.", { slug: "Already in use" });
    const p = await db.partnerBrand.create({ data: { slug, name, agreement, joinUrl } });
    await audit(db, g.actor, "partner.create", { entity: "PartnerBrand", entityId: p.id, data: { slug, name, joinUrl } });
  }
  revalidatePath("/hq/partners");
  return done(id ? "Partner saved" : "Partner added");
}

export async function togglePartner(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const p = await db.partnerBrand.findUnique({ where: { id: str(fd, "id") } });
  if (!p) return fail("That partner no longer exists.");
  await db.partnerBrand.update({ where: { id: p.id }, data: { active: !p.active } });
  await audit(db, g.actor, p.active ? "partner.pause" : "partner.resume", { entity: "PartnerBrand", entityId: p.id, data: { name: p.name } });
  revalidatePath("/hq/partners");
  return done(p.active ? `${p.name} paused` : `${p.name} resumed`);
}

/** The key leaves the system here and only here, so every reveal is audited. */
export async function revealPartnerKey(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const p = await db.partnerBrand.findUnique({ where: { id: str(fd, "id") } });
  if (!p) return fail("That partner no longer exists.");
  await audit(db, g.actor, "partner.key_reveal", { entity: "PartnerBrand", entityId: p.id, data: { name: p.name, keyVersion: p.keyVersion } });
  return done(`Key for ${p.name}: ${partnerKey(p).toString("hex")}`);
}

export async function rotatePartnerKey(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const p = await db.partnerBrand.findUnique({ where: { id: str(fd, "id") } });
  if (!p) return fail("That partner no longer exists.");
  await db.partnerBrand.update({ where: { id: p.id }, data: { keyVersion: { increment: 1 } } });
  await audit(db, g.actor, "partner.key_rotate", { entity: "PartnerBrand", entityId: p.id, data: { name: p.name, keyVersion: p.keyVersion + 1 } });
  revalidatePath("/hq/partners");
  return done(`New key set for ${p.name}. Their old links stop carrying member details until they have it.`);
}
