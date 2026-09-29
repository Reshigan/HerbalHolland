// A scheduled export's CSV, fetched from the signed link in the email (no sign-in: the link is the credential,
// HMAC-signed per file and expiring after LINK_DAYS). Every download is audited.
import { db } from "@/server/db";
import { audit, SYSTEM } from "@/server/audit";
import { verifyExportToken } from "@/server/exports";
import { getObject } from "@/server/storage";

const gone = (status: number, text: string) => new Response(text, { status, headers: { "cache-control": "private, no-store" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyExportToken(id, url.searchParams.get("e"), url.searchParams.get("t"))) return gone(403, "This download link has expired or isn't valid.");
  const file = await db.upload.findUnique({ where: { id }, select: { key: true, fileName: true, uploadedById: true } });
  if (!file || !file.key.startsWith("exports/")) return gone(404, "Not found");
  let bytes: Uint8Array;
  try {
    bytes = await getObject(file.key);
  } catch (e) {
    console.error("[exports] read failed", id, e);
    return gone(404, "Not found");
  }
  await audit(db, SYSTEM, "report.download", { entity: "Upload", entityId: id, data: { fileName: file.fileName, scheduledBy: file.uploadedById } });
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
