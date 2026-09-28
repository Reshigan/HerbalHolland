"use server";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { addPoints } from "@/server/loyalty";
import { guard, DENIED, fail, flashTo, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import type { MsgChannel } from "@/generated/prisma/client";

const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

/**
 * POPIA s24 erasure. Irreversible: personal details are replaced, marketing consent is
 * withdrawn and contact details go on the do-not-contact list (the Regulator requires a
 * record of objections). Sales, tax invoices, the points ledger and dispensing records
 * are kept for their statutory retention periods, detached from the person.
 */
export async function anonymiseCustomer(customerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (str(fd, "confirm").toUpperCase() !== "ANONYMISE") return fail("Type ANONYMISE to confirm.");
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c) return fail("Member not found.");
  if (c.phone.startsWith("anon-")) return fail("This member has already been anonymised.");
  const reason = str(fd, "reason") || "Data subject request";

  await tx(async (t) => {
    if (c.points > 0) await addPoints(t, { customerId, points: -c.points, kind: "EXPIRE", note: "Forfeited on POPIA erasure request" });
    await t.suppression.createMany({
      data: [c.phone, c.email].filter((v): v is string => !!v).map((value) => ({ value, channel: null, source: "REFUSED" })),
      skipDuplicates: true,
    });
    await t.customer.update({
      where: { id: customerId },
      data: {
        phone: `anon-${c.id}`, email: null, firstName: "Anonymised", lastName: null, dob: null, idHash: null, idLast4: null,
        consentWhatsapp: false, consentSms: false, consentEmail: false, consentPush: false, consentAt: new Date(), lastSeenAt: null, referredById: null,
      },
    });
    await t.consentEvent.createMany({ data: CHANNELS.map((channel) => ({ customerId, channel, granted: false, source: "ADMIN", wording: "Withdrawn — personal information erased on request (POPIA s24)" })) });
    await t.session.deleteMany({ where: { customerId } });
    await t.otp.deleteMany({ where: { phone: c.phone } });
    await t.stockAlert.deleteMany({ where: { customerId } });
    await t.messageLog.updateMany({ where: { customerId }, data: { to: "[erased]", body: "[erased on POPIA request]" } });
    await t.order.updateMany({ where: { customerId }, data: { addressLine: null, suburb: null, postalCode: null, deliveryNotes: null } });
    await t.sale.updateMany({ where: { customerId }, data: { invoiceEmail: null } });
    await t.review.updateMany({ where: { customerId }, data: { title: null, body: null } });
    await t.patientAuth.updateMany({ where: { customerId }, data: { documentRef: null, status: "REVOKED" } });
    await audit(t, g.actor, "customer.anonymise", { entity: "Customer", entityId: customerId, data: { memberNo: c.memberNo, reason, pointsForfeited: Math.max(0, c.points) } });
  });
  revalidatePath(`/hq/customers/${customerId}`);
  flashTo(`/hq/customers/${customerId}`, "Personal information erased. Financial and dispensing records remain, detached from the person.");
}
