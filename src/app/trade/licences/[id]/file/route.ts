// A trade licence document, served through the app (never a storage link): to HQ (admin, staff, and area managers) and
// to the account's own active buyers. Every view is audited; anything else is a 404, so ids can't be guessed into.
import { getStaff, getTradeBuyer, isHq } from "@/server/auth";
import { tradeActor } from "@/server/trade/accounts";
import { db } from "@/server/db";
import { audit, type Actor } from "@/server/audit";
import { getObject } from "@/server/storage";
import { extFor, type UploadType } from "@/lib/files";
import { LICENCE_FILE_TYPES, TRADE_LICENCES } from "@/lib/trade-licences";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{10,40}$/i.test(id)) return notFound(); // cuids, and the seed's uuids
  const licence = await db.tradeLicence.findUnique({ where: { id }, include: { account: { select: { id: true, number: true } } } });
  if (!licence) return notFound();
  const [staff, buyer] = await Promise.all([getStaff(), getTradeBuyer()]);
  let actor: Actor | null = null;
  if (staff && isHq(staff)) actor = { type: "USER", id: staff.id, name: staff.name };
  else if (buyer && buyer.active && buyer.tradeAccountId === licence.tradeAccountId) actor = tradeActor(buyer);
  if (!actor) return notFound();
  const file = await db.upload.findUnique({ where: { id: licence.uploadId }, select: { key: true, contentType: true } });
  if (!file) return notFound();
  const type = (LICENCE_FILE_TYPES as readonly string[]).includes(file.contentType) ? (file.contentType as UploadType) : null;
  if (!type) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = await getObject(file.key);
  } catch (e) {
    console.error("[trade licences] file read failed", licence.id, e);
    return notFound();
  }
  await audit(db, actor, "trade.licence.file_view", { entity: "TradeLicence", entityId: licence.id, data: { account: licence.account.number, kind: licence.kind } });
  // The name is built from the record, never from what was uploaded.
  const name = `${licence.account.number}-${TRADE_LICENCES[licence.kind].name.replace(/[^A-Za-z0-9]+/g, "-")}.${extFor(type)}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": type,
      "content-length": String(bytes.byteLength),
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
