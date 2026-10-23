// The till's "Your join QR": the signed-in person's own join link as a QR, and how many members joined with them this
// month (from the link, or signed up at the till by them).
import QRCode from "qrcode";
import { json, withStaff } from "@/server/pos/http";
import { db } from "@/server/db";
import { APP_URL } from "@/server/invoices";
import { monthRange, thisMonth } from "@/server/commission";
import { staffJoinPath, staffTag } from "@/lib/staff-invite";

export const GET = withStaff(async (_req, pos) => {
  const url = `${APP_URL()}${staffJoinPath(pos.user.id)}`;
  const { start: at } = monthRange(thisMonth());
  const [linked, atTill, svg] = await Promise.all([
    db.customer.count({ where: { joinedVia: staffTag(pos.user.id), createdAt: { gte: at } } }),
    db.auditLog.count({ where: { action: "customer.create", actorType: "USER", actorId: pos.user.id, at: { gte: at } } }),
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0c0a09", light: "#ffffff" } }),
  ]);
  return json({ url, joins: linked + atTill, svg });
});
