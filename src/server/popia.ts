// POPIA for members: everything we hold about one member (s23 access: HQ → the member → Export data) and erasure on a
// verified request (s24: Anonymise member). Between them they cover every table that holds a member's personal
// information, so keep them in step: when a model gains a customerId, or a member's contact details, add it to both.
// Erasure keeps what the law makes us keep (sales and tax invoices, the points ledger, dispensing records, returns and
// refunds, gift vouchers' money), detached from the person: the member row becomes "Anonymised" (mobile anon-<id>).
// What only served the member is deleted; what they wrote or sent us is blanked, and their photos come down.
import { db, tx, type Prisma } from "./db";
import { audit, type Actor } from "./audit";
import { addPoints } from "./loyalty";
import { deleteObject } from "./storage";
import type { MsgChannel } from "@/generated/prisma/client";
import { asList, inBatches } from "@/lib/json-list";
import { likeTerm } from "@/lib/search";

/** An expected refusal, shown to HQ as it is. */
export class ErasureError extends Error {}

const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];
/** What erased text reads as. */
export const ERASED = "[erased on POPIA request]";
const ANONYMISED = "Anonymised";
const isAnonymised = (c: { phone: string }) => c.phone.startsWith("anon-");

type Member = { id: string; phone: string; email: string | null };
// SQLite compares `=` case-sensitively but LIKE not (for ASCII): a string that both starts and ends with the email is the email, any case.
// (An address too long for a D1 LIKE pattern, 49 bytes, is matched exactly instead.)
const insensitive = (email: string) => (likeTerm(email, 49) === email ? { startsWith: email, endsWith: email } : { equals: email });
/** Their mobile and email, as the do-not-contact list keeps them. */
const contactOf = (c: Member) => (c.email ? [c.phone, c.email] : [c.phone]);
// Their herbalholland.com first-access sign-up, if it hasn't been told and deleted yet (src/server/early-access.ts).
const firstAccessOf = (c: Member): Prisma.EarlyAccessContactWhereInput => ({ OR: [{ mobile: c.phone }, ...(c.email ? [{ email: c.email.toLowerCase() }] : [])] });
// Support requests, messages and vouchers can be theirs without their member id: a sign-in code, a request sent before
// they signed in, a voucher someone bought them.
const ticketsOf = (c: Member): Prisma.SupportTicketWhereInput => ({ OR: [{ customerId: c.id }, { phone: c.phone }, ...(c.email ? [{ email: insensitive(c.email) }] : [])] });
const messagesOf = (c: Member): Prisma.MessageLogWhereInput => ({ OR: [{ customerId: c.id }, { to: c.phone }, ...(c.email ? [{ to: insensitive(c.email) }] : [])] });
const vouchersOf = (c: Member): Prisma.GiftVoucherWhereInput => ({ OR: [{ purchasedByCustomerId: c.id }, ...(c.email ? [{ recipientEmail: insensitive(c.email) }] : [])] });

/** POPIA s23: everything held about one member, for HQ's download. Null when there's no such member. */
export async function memberExport(customerId: string) {
  const c = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      homeStore: { select: { code: true, name: true } },
      sessions: { orderBy: { createdAt: "asc" }, select: { createdAt: true, lastSeenAt: true, expiresAt: true } },
      consentEvents: { orderBy: { createdAt: "asc" }, select: { channel: true, granted: true, source: true, wording: true, createdAt: true } },
      loyalty: { orderBy: { createdAt: "asc" }, select: { points: true, kind: true, note: true, createdAt: true, store: { select: { code: true } } } },
      sales: {
        orderBy: { createdAt: "asc" },
        select: {
          number: true, kind: true, channel: true, createdAt: true, totalCents: true, vatCents: true, discountCents: true, pointsEarned: true, invoiceEmail: true, buyer: true,
          store: { select: { code: true, name: true } },
          lines: { select: { qty: true, unitPriceCents: true, totalCents: true, variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
          payments: { select: { method: true, amountCents: true, cardLast4: true } },
        },
      },
      orders: {
        orderBy: { createdAt: "asc" },
        select: {
          code: true, status: true, fulfilment: true, createdAt: true, totalCents: true, addressLine: true, suburb: true, city: true, province: true, postalCode: true, deliveryNotes: true, courier: true, trackingNo: true,
          lines: { select: { qty: true, totalCents: true, variant: { select: { sku: true } } } },
        },
      },
      patientAuths: { select: { authNumber: true, prescriber: true, prescriberRegNo: true, scope: true, monthlyLimitGrams: true, validFrom: true, validTo: true, documentRef: true, status: true } },
      reviews: { select: { rating: true, title: true, body: true, photoUploadIds: true, hidden: true, createdAt: true, product: { select: { name: true } } } },
      alerts: { select: { createdAt: true, notifiedAt: true, variant: { select: { sku: true } } } },
      pushSubs: { select: { endpoint: true, createdAt: true } },
      offers: { orderBy: { createdAt: "asc" }, select: { title: true, kind: true, value: true, startsAt: true, endsAt: true, redeemedAt: true } },
      rsvps: { select: { createdAt: true, checkedInAt: true, event: { select: { title: true, startsAt: true } } } },
      dropWatches: { select: { createdAt: true, drop: { select: { name: true } } } },
      quests: { select: { key: true, createdAt: true } },
    },
  });
  if (!c) return null;
  const [messages, addresses, wishlist, reminders, tickets, returns, vouchers, photos, doNotContact, activity, firstAccess] = await Promise.all([
    db.messageLog.findMany({ where: messagesOf(c), orderBy: { createdAt: "asc" }, select: { channel: true, kind: true, to: true, body: true, status: true, createdAt: true } }),
    db.address.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { label: true, line: true, suburb: true, city: true, province: true, postalCode: true, notes: true, isDefault: true, createdAt: true } }),
    db.wishlist.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { variantId: true, createdAt: true } }),
    db.reorderReminder.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { variantId: true, everyDays: true, channel: true, active: true, nextAt: true, lastSentAt: true, createdAt: true } }),
    db.supportTicket.findMany({
      where: ticketsOf(c),
      orderBy: { createdAt: "asc" },
      select: {
        number: true, name: true, email: true, phone: true, subject: true, category: true, orderCode: true, body: true, status: true, createdAt: true, resolvedAt: true,
        messages: { orderBy: { createdAt: "asc" }, select: { authorType: true, authorName: true, body: true, attachmentUploadId: true, createdAt: true } },
      },
    }),
    db.returnRequest.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { number: true, orderId: true, reason: true, items: true, note: true, photoUploadIds: true, status: true, refundCents: true, decisionNote: true, createdAt: true, decidedAt: true } }),
    db.giftVoucher.findMany({ where: vouchersOf(c), orderBy: { createdAt: "asc" }, select: { code: true, purchasedByCustomerId: true, amountCents: true, balanceCents: true, recipientName: true, recipientEmail: true, message: true, status: true, issuedAt: true, expiresAt: true } }),
    db.upload.findMany({ where: { uploadedById: customerId }, orderBy: { createdAt: "asc" }, select: { fileName: true, contentType: true, sizeBytes: true, createdAt: true } }),
    db.suppression.findMany({ where: { value: { in: contactOf(c) } }, select: { value: true, channel: true, source: true, createdAt: true } }),
    db.auditLog.findMany({ where: { actorType: "CUSTOMER", actorId: customerId }, orderBy: { at: "asc" }, select: { at: true, action: true } }),
    db.earlyAccessContact.findMany({ where: firstAccessOf(c), select: { firstName: true, email: true, mobile: true, province: true, source: true, signedUpAt: true } }),
  ]);
  const [variants, orderCodes] = await Promise.all([
    inBatches([...wishlist, ...reminders].map((w) => w.variantId), (part) => db.variant.findMany({ where: { id: { in: part } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } })),
    inBatches(returns.map((r) => r.orderId), (part) => db.order.findMany({ where: { id: { in: part } }, select: { id: true, code: true } })),
  ]);
  const item = (variantId: string) => {
    const v = variants.find((x) => x.id === variantId);
    return v ? { sku: v.sku, product: v.product.name, variant: v.name } : { sku: null, product: null, variant: null };
  };
  const { idHash: _hash, reviews, ...profile } = c;
  void _hash;
  return {
    ...profile,
    reviews: reviews.map(({ photoUploadIds, ...r }) => ({ ...r, photos: asList(photoUploadIds).length })),
    messages,
    addresses,
    wishlist: wishlist.map((w) => ({ ...item(w.variantId), addedAt: w.createdAt })),
    reorderReminders: reminders.map(({ variantId, ...r }) => ({ ...item(variantId), ...r })),
    supportRequests: tickets.map(({ messages: thread, ...t }) => ({ ...t, messages: thread.map(({ attachmentUploadId, ...m }) => ({ ...m, photo: !!attachmentUploadId })) })),
    returns: returns.map(({ orderId, photoUploadIds, ...r }) => ({ ...r, order: orderCodes.find((o) => o.id === orderId)?.code ?? null, photos: asList(photoUploadIds).length })),
    giftVouchers: vouchers.map(({ purchasedByCustomerId, ...v }) => ({ ...v, boughtByThem: purchasedByCustomerId === c.id })),
    photos,
    doNotContact,
    activity,
    firstAccess,
  };
}

/**
 * POPIA s24 erasure, irreversible: one transaction, then their photos come out of storage. Marketing consent is
 * withdrawn and their mobile and email go on the do-not-contact list (the Regulator requires a record of objections);
 * unused points are forfeited on the ledger. Audited as customer.anonymise.
 */
export async function eraseMember(customerId: string, actor: Actor, reason: string) {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c) throw new ErasureError("Member not found.");
  if (isAnonymised(c)) throw new ErasureError("This member has already been anonymised.");
  const now = new Date();
  const keys = await tx(async (t) => {
    if (c.points > 0) await addPoints(t, { customerId, points: -c.points, kind: "EXPIRE", note: "Forfeited on POPIA erasure request" });
    const listed = new Set((await t.suppression.findMany({ where: { value: { in: contactOf(c) }, source: "REFUSED" }, select: { value: true } })).map((s) => s.value));
    await t.suppression.createMany({ data: contactOf(c).filter((value) => !listed.has(value)).map((value) => ({ value, channel: null, source: "REFUSED" })) });
    await t.customer.update({
      where: { id: customerId },
      data: {
        phone: `anon-${c.id}`, email: null, firstName: ANONYMISED, lastName: null, dob: null, idHash: null, idLast4: null, referralCode: `anon-${c.id}`, interests: [],
        consentWhatsapp: false, consentSms: false, consentEmail: false, consentPush: false, consentAt: now, personalisedOffers: false, lastSeenAt: null, referredById: null,
      },
    });
    await t.consentEvent.createMany({ data: CHANNELS.map((channel) => ({ customerId, channel, granted: false, source: "ADMIN", wording: "Withdrawn: personal information erased on request (POPIA s24)" })) });

    // What only served the member: deleted.
    await t.session.deleteMany({ where: { customerId } });
    await t.otp.deleteMany({ where: { OR: [{ phone: c.phone }, ...(c.email ? [{ email: c.email }] : [])] } });
    await t.earlyAccessContact.deleteMany({ where: firstAccessOf(c) });
    await t.throttle.deleteMany({ where: { key: { in: [`collision:phone:${c.phone}`, `collision:member:${c.id}`] } } });
    await t.address.deleteMany({ where: { customerId } });
    await t.wishlist.deleteMany({ where: { customerId } });
    await t.reorderReminder.deleteMany({ where: { customerId } });
    await t.stockAlert.deleteMany({ where: { customerId } });
    await t.dropWatch.deleteMany({ where: { customerId } });
    await t.pushSubscription.deleteMany({ where: { customerId } });
    await t.questCompletion.deleteMany({ where: { customerId } });
    await t.memberOffer.deleteMany({ where: { customerId, redeemedAt: null } }); // a used deal stays with the sale it discounted
    await t.rsvp.deleteMany({ where: { customerId, event: { endsAt: { gt: now } } } }); // their tickets; past attendance stays
    await t.user.updateMany({ where: { memberId: customerId }, data: { memberId: null } }); // a staff member's own card

    // What they wrote or sent us, where the record itself stays: blanked.
    await t.order.updateMany({ where: { customerId }, data: { addressLine: null, suburb: null, postalCode: null, deliveryNotes: null } });
    await t.sale.updateMany({ where: { customerId }, data: { invoiceEmail: null } }); // a full tax invoice's buyer details stay (VAT Act s20)
    const reviews = await t.review.findMany({ where: { customerId }, select: { photoUploadIds: true } });
    await t.review.updateMany({ where: { customerId }, data: { title: null, body: null, photoUploadIds: [] } });
    const returns = await t.returnRequest.findMany({ where: { customerId }, select: { photoUploadIds: true } });
    await t.returnRequest.updateMany({ where: { customerId }, data: { note: null, photoUploadIds: [] } });
    // Support requests outlive the member (numbers and categories feed the service figures); nobody is left to answer.
    const ticketIds = (await t.supportTicket.findMany({ where: ticketsOf(c), select: { id: true } })).map((x) => x.id);
    const attachments = await inBatches(ticketIds, (part) => t.supportMessage.findMany({ where: { ticketId: { in: part }, attachmentUploadId: { not: null } }, select: { attachmentUploadId: true } }));
    await inBatches(ticketIds, (part) => t.supportMessage.updateMany({ where: { ticketId: { in: part } }, data: { body: ERASED, attachmentUploadId: null } }).then((r) => [r]));
    await inBatches(ticketIds, (part) => t.supportMessage.updateMany({ where: { ticketId: { in: part }, authorType: "MEMBER" }, data: { authorName: ANONYMISED } }).then((r) => [r]));
    await inBatches(ticketIds, (part) => t.supportTicket.updateMany({ where: { id: { in: part } }, data: { name: ANONYMISED, email: null, phone: null, subject: ERASED, body: ERASED, ipHash: null } }).then((r) => [r]));
    await inBatches(ticketIds, (part) => t.supportTicket.updateMany({ where: { id: { in: part }, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: now } }).then((r) => [r]));
    await t.giftVoucher.updateMany({ where: vouchersOf(c), data: { recipientName: null, recipientEmail: null, message: null } }); // the money stays on the code
    await t.messageLog.updateMany({ where: messagesOf(c), data: { to: "[erased]", body: ERASED } });
    if (c.referredById) await t.loyaltyEntry.updateMany({ where: { customerId: c.referredById, kind: "REFERRAL", note: `Referral: ${c.firstName}` }, data: { note: `Referral: ${ANONYMISED}` } });
    await t.patientAuth.updateMany({ where: { customerId }, data: { documentRef: null, status: "REVOKED" } });
    // The audit trail keeps what happened, not who: their name comes off what they did, and their mobile off the
    // "already linked to another member" checks made while they joined.
    await t.auditLog.updateMany({ where: { actorType: "CUSTOMER", actorId: customerId }, data: { actorName: ANONYMISED } });
    const probes = await t.auditLog.findMany({ where: { action: "member.collision", data: { path: "$.by", equals: `phone:${c.phone}` } }, select: { id: true, data: true } });
    for (const p of probes) await t.auditLog.update({ where: { id: p.id }, data: { actorName: ANONYMISED, data: { ...(p.data as Prisma.JsonObject), by: "phone:[erased]" } } });

    // Their photos (reviews, returns, support): the rows here, the stored files once this commits.
    const ids = [...reviews, ...returns].flatMap((r) => asList<string>(r.photoUploadIds)).concat(attachments.flatMap((m) => (m.attachmentUploadId ? [m.attachmentUploadId] : [])));
    const files = [...new Map([
      ...(await inBatches([...new Set(ids)], (part) => t.upload.findMany({ where: { id: { in: part } }, select: { id: true, key: true } }))),
      ...(await t.upload.findMany({ where: { uploadedById: customerId }, select: { id: true, key: true } })),
    ].map((f) => [f.id, f])).values()];
    await inBatches(files.map((f) => f.id), (part) => t.upload.deleteMany({ where: { id: { in: part } } }).then((r) => [r]));
    await audit(t, actor, "customer.anonymise", { entity: "Customer", entityId: customerId, data: { memberNo: c.memberNo, reason, pointsForfeited: Math.max(0, c.points), files: files.length, supportRequests: ticketIds.length } });
    return files.map((f) => f.key);
  });
  for (const key of keys) await deleteObject(key).catch((e) => console.error("[popia] file delete failed", key, e));
  return { memberNo: c.memberNo, files: keys.length };
}
