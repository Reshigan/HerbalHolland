// Partner brands (Goldrush, Medellin Barbers and the like): members cross over one at a time, by their own choice.
// Inbound, a partner's link marks the join and may carry the member's details; the member still confirms their number,
// date of birth and terms here. Outbound, the member agrees and we send them to the partner's join page with a token.
// There's no bulk import: a partner's list carries no consent to us, and POPIA s69 needs one for direct marketing.
import { createHmac } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { appSecret } from "./secret";
import { normalisePhone } from "@/lib/sa";
import { openMember } from "@/lib/partner-token";
import type { PartnerDirection } from "@/generated/prisma/client";

/** Derived, so no key sits in the database. Depends on SESSION_SECRET: changing that changes every partner key. */
export const partnerKey = (p: { slug: string; keyVersion: number }) => createHmac("sha256", appSecret()).update(`partner-key:${p.slug}:${p.keyVersion}`).digest();

export const shareWording = (name: string) => `Share my name, mobile number, email address and Herbal Holland member number with ${name} so I can join their programme. My date of birth, ID number, purchases and any patient information are never shared. I can stop this any time.`;

export const arrivalWording = (name: string) => `Came through ${name}'s link and confirmed their mobile number.`;

/** Both arguments come straight from a URL or a form. A bad token still counts as a plain partner join. */
export async function partnerArrival(slug: unknown, token: unknown) {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const partner = await db.partnerBrand.findFirst({ where: { slug: slug.trim().toLowerCase(), active: true } });
  if (!partner) return null;
  const opened = typeof token === "string" && token ? openMember(token, partnerKey(partner)) : null;
  const phone = opened && normalisePhone(opened.phone);
  return { partner, member: opened && phone ? { ...opened, phone } : null };
}

export async function recordLink(member: { id: string; firstName: string }, partner: { id: string; name: string }, direction: PartnerDirection, { wording, externalId }: { wording: string; externalId?: string }) {
  const link = await db.partnerLink.upsert({
    where: { customerId_partnerId_direction: { customerId: member.id, partnerId: partner.id, direction } },
    create: { customerId: member.id, partnerId: partner.id, direction, wording, externalId },
    update: { wording, revokedAt: null, ...(externalId && { externalId }) },
  });
  await audit(db, { type: "CUSTOMER", id: member.id, name: member.firstName }, "partner.link", { entity: "PartnerLink", entityId: link.id, data: { partner: partner.name, direction } });
}

/** The partners a member can join from here, each with the wording they'd be agreeing to. */
export async function partnerOffers(exceptId?: string) {
  const partners = await db.partnerBrand.findMany({ where: { active: true, joinUrl: { not: null }, ...(exceptId && { id: { not: exceptId } }) }, orderBy: { name: "asc" } });
  return partners.map((p) => ({ id: p.id, name: p.name, wording: shareWording(p.name) }));
}
