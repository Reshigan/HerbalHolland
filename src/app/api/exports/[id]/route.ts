// A scheduled export's CSV, from the signed link in the email: the link (HMAC-signed per file, expiring after LINK_DAYS)
// and a signed-in colleague it was sent to (or who scheduled it), whose role still runs the report and who may still see
// what it covers (a network-wide report: the HQ team only). Every download is audited as that person.
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getStaff } from "@/server/auth";
import { canRun, getReport } from "@/server/reports";
import { mayReceive, scheduleIdOf, scheduleReach, verifyExportToken } from "@/server/exports";
import { getObject } from "@/server/storage";
import { asList } from "@/lib/json-list";

const gone = (status: number, text: string) => new Response(text, { status, headers: { "cache-control": "private, no-store" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyExportToken(id, url.searchParams.get("e"), url.searchParams.get("t"))) return gone(403, "This download link has expired or isn't valid.");
  const user = await getStaff();
  // Relative Location (req.url names localhost in the standalone server): sign in, then straight back here.
  if (!user) return new Response(null, { status: 303, headers: { Location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`, "cache-control": "private, no-store" } });
  const file = await db.upload.findUnique({ where: { id }, select: { key: true, fileName: true, uploadedById: true } });
  if (!file || !file.key.startsWith("exports/")) return gone(404, "Not found");
  const sid = scheduleIdOf(file.key);
  const s = sid ? await db.scheduledExport.findUnique({ where: { id: sid }, select: { userId: true, recipients: true, reportKey: true, params: true } }) : null;
  const def = s ? getReport(s.reportKey) : null;
  const theirs = !!s && (s.userId === user.id || asList(s.recipients).includes((user.email ?? "").toLowerCase()));
  // What the file covers is what its owner's scope and filters cover; the person downloading must see all of it.
  const owner = s && theirs ? await db.user.findUnique({ where: { id: s.userId }, select: { role: true, regionId: true, companyId: true, storeId: true } }) : null;
  const covered = !!owner && (await mayReceive(user, await scheduleReach(owner, (s!.params ?? {}) as Record<string, string>)));
  if (!s || !def || !covered || !canRun(def, user.role)) return gone(403, "This download is for the colleagues it was sent to.");
  let bytes: Uint8Array;
  try {
    bytes = await getObject(file.key);
  } catch (e) {
    console.error("[exports] read failed", id, e);
    return gone(404, "Not found");
  }
  await audit(db, { type: "USER", id: user.id, name: user.name }, "report.download", { entity: "Upload", entityId: id, data: { fileName: file.fileName, report: def.key, scheduledBy: file.uploadedById } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${file.fileName.replace(/[^A-Za-z0-9._-]+/g, "-")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
