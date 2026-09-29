// Members' photos, served through the app (never a storage link). A photo on a published review is public (cached a
// day); a photo on a return request or a support message is shown only to the member it belongs to and to the staff
// who may see that record (HQ, or the fulfilling store's team). Anything else is a 404, so ids can't be guessed into.
import { getCustomer, getStaff, isHq } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getObject } from "@/server/storage";
import { PHOTO_TYPES } from "@/server/uploads";
import { extFor } from "@/lib/files";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });

/** "public" for a live review's photo; "private" when the viewer may see the record it belongs to; null otherwise. */
async function access(uploadId: string): Promise<"public" | "private" | null> {
  const review = await db.review.findFirst({ where: { photoUploadIds: { has: uploadId } }, select: { hidden: true, customerId: true } });
  if (review && !review.hidden) return "public";
  const [customer, staff] = await Promise.all([getCustomer(), getStaff()]);
  if (review) return (customer && customer.id === review.customerId) || (staff && isHq(staff)) ? "private" : null;
  const ret = await db.returnRequest.findFirst({ where: { photoUploadIds: { has: uploadId } }, select: { customerId: true, storeId: true } });
  if (ret) {
    if (customer && customer.id === ret.customerId) return "private";
    if (staff && (isHq(staff) || (await scopedStoreIds(scopeOf(staff))).includes(ret.storeId))) return "private";
    return null;
  }
  const msg = await db.supportMessage.findFirst({ where: { attachmentUploadId: uploadId }, select: { ticket: { select: { customerId: true, storeId: true } } } });
  if (msg) {
    if (customer && customer.id === msg.ticket.customerId) return "private";
    if (staff && (isHq(staff) || (msg.ticket.storeId && (await scopedStoreIds(scopeOf(staff))).includes(msg.ticket.storeId)))) return "private";
  }
  return null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound();
  const u = await db.upload.findUnique({ where: { id }, select: { id: true, key: true, contentType: true } });
  const type = u && PHOTO_TYPES.find((t) => t === u.contentType);
  if (!u || !type) return notFound();
  const level = await access(id);
  if (!level) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = await getObject(u.key);
  } catch (e) {
    console.error("[media] read failed", u.id, e);
    return notFound();
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": type,
      "content-length": String(bytes.byteLength),
      "content-disposition": `inline; filename="photo-${u.id.slice(-8)}.${extFor(type)}"`,
      "cache-control": level === "public" ? "public, max-age=86400" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
