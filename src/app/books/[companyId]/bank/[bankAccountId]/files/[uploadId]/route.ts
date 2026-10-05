// A statement file as it was imported, served through the app (never a storage link): anyone who can read these books,
// only a file imported to this bank account, and every download audited.
import { booksAccess } from "@/server/ledger/access";
import { statementFile } from "@/server/ledger/bank";
import { getObject } from "@/server/storage";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string; bankAccountId: string; uploadId: string }> }) {
  const { companyId, bankAccountId, uploadId } = await params;
  const access = await booksAccess(companyId, "read");
  if (!access) return notFound();
  const file = await statementFile(companyId, bankAccountId, uploadId);
  if (!file) return notFound();
  let bytes: Uint8Array;
  try {
    bytes = await getObject(file.key);
  } catch (e) {
    console.error("[bank] statement file read failed", file.id, e);
    return notFound();
  }
  await audit(db, { type: "USER", id: access.user.id, name: access.user.name }, "bank.statement.file_view", { entity: "Upload", entityId: file.id, data: { companyId, bankAccountId } });
  const ofx = file.contentType === "application/x-ofx";
  // The name is built from the import date, never from what was uploaded.
  const name = `bank-statement-${file.createdAt.toISOString().slice(0, 10)}.${ofx ? "ofx" : "csv"}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": ofx ? "application/x-ofx" : "text/csv",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
