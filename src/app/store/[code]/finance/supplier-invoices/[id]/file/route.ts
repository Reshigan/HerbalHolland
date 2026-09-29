// The photo or PDF of one supplier invoice, served through the app (never a storage link): staff who can see the
// store only, the invoice must belong to it, and every view is audited.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/store/context";
import { getObject } from "@/server/storage";
import { extFor, type UploadType } from "@/lib/files";

const INLINE: UploadType[] = ["image/jpeg", "image/png", "application/pdf"];
const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const inv = await db.supplierInvoice.findFirst({ where: { id, storeId: store.id }, select: { id: true, number: true, supplierName: true, uploadId: true } });
  if (!inv) return notFound();
  const file = await db.upload.findUnique({ where: { id: inv.uploadId }, select: { key: true, contentType: true } });
  if (!file) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = await getObject(file.key);
  } catch (e) {
    console.error("[supplier-invoices] file read failed", inv.number, e);
    return notFound();
  }
  await audit(db, actorOf(user), "supplier_invoice.file_view", { storeId: store.id, entity: "SupplierInvoice", entityId: inv.id, data: { number: inv.number, uploadId: inv.uploadId } });
  const type = INLINE.find((t) => t === file.contentType);
  // The name is built from the invoice, never from what was uploaded.
  const fileName = `${inv.supplierName.replace(/[^A-Za-z0-9-]+/g, "-")}-${inv.number.replace(/[^A-Za-z0-9-]+/g, "-")}.${type ? extFor(type) : "bin"}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": type ?? "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "content-disposition": `${type ? "inline" : "attachment"}; filename="${fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
