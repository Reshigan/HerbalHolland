// The stamped slip of one deposit, served through the app (never a storage link): staff who can see the store only,
// the deposit must belong to it, and every view is audited.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/store/context";
import { getObject } from "@/server/storage";
import { extFor, type UploadType } from "@/lib/files";

// Only the types the upload check lets in are shown inline; anything else downloads as plain bytes.
const INLINE: UploadType[] = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const d = await db.cashDeposit.findFirst({ where: { id, storeId: store.id }, select: { id: true, number: true, slip: { select: { id: true, key: true, contentType: true } } } });
  if (!d) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = await getObject(d.slip.key);
  } catch (e) {
    console.error("[banking] slip read failed", d.number, e);
    return notFound();
  }
  await audit(db, actorOf(user), "deposit.slip_view", { storeId: store.id, entity: "CashDeposit", entityId: d.id, data: { number: d.number, uploadId: d.slip.id } });
  const type = INLINE.find((t) => t === d.slip.contentType);
  // The name is built from the deposit number, never from what was uploaded.
  const fileName = `${d.number}-slip.${type ? extFor(type) : "bin"}`;
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
