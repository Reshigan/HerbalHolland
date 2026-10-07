// The QR maker's inputs, read the same way by its page and its SVG download.
import { db } from "@/server/db";
import { APP_URL } from "@/server/invoices";
import { joinTag } from "@/server/customers";
import { qrLink, QR_KINDS, type QrKind } from "@/lib/studio";

export type QrParams = { kind?: string; code?: string; tag?: string };

export async function qrFor(sp: QrParams) {
  const kind: QrKind = sp.kind && Object.hasOwn(QR_KINDS, sp.kind) ? (sp.kind as QrKind) : "join";
  const code = sp.code?.trim().toUpperCase().slice(0, 20) || "";
  const tag = joinTag(sp.tag);
  const store = code ? await db.store.findUnique({ where: { code }, select: { code: true, slug: true, name: true, whatsapp: true } }) : null;
  const problem = code && !store ? `There's no store ${code}.` : kind === "whatsapp" && !store?.whatsapp ? (store ? `${store.name} has no WhatsApp number yet (HQ → Stores).` : "Choose the store.") : kind === "store" && !store ? "Choose the store." : null;
  return { kind, code, tag, rawTag: sp.tag ?? "", store, link: problem ? null : qrLink({ kind, base: APP_URL(), tag, store }), problem };
}
