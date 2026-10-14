"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guard, DENIED, fail, flashTo, inScope, type ActionState } from "@/server/hq/guard";
import { bool, str, qs } from "@/server/hq/form";
import { announced, announceProducts } from "@/server/studio";
import { ImportError, loadImportFile, runImport, saveImportFile } from "@/server/hq/catalogue-import";
import { IMPORT_MAX_BYTES, importSummary } from "@/lib/catalogue-import";

const PATH = "/hq/catalogue/import";

/** Step 1: upload the CSV and see the dry run. Nothing in the catalogue changes yet. */
export async function uploadCatalogue(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose the CSV file to import.", { file: "Choose a CSV file" });
  if (file.size > IMPORT_MAX_BYTES) return fail("The file is over 2 MB: split it into smaller files.", { file: "At most 2 MB" });
  const at = str(fd, "at");
  if (at && !(await inScope(g.scope, at))) return fail("Choose where the opening stock is.", { at: "Choose a location" });
  let id: string;
  try {
    id = (await saveImportFile(file, g.user.id)).id;
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message, { file: "Fix the file and upload it again" });
    throw e;
  }
  redirect(`${PATH}${qs({ file: id, at })}`);
}

/** Step 2: import what the preview showed. The file, the location and the counts are checked again first. */
export async function importCatalogue(uploadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const at = str(fd, "at") || null;
  if (at && !(await inScope(g.scope, at))) return DENIED;
  const file = await loadImportFile(uploadId);
  if (!file) return fail("That file is no longer available: upload it again.");
  let result: Awaited<ReturnType<typeof runImport>>;
  try {
    result = await runImport({
      uploadId, fileName: file.upload.fileName, sha256: file.upload.sha256, text: file.text, locationId: at, digest: str(fd, "digest") || null, actor: g.actor, userId: g.user.id,
    });
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    // Someone added the same SKU, barcode or batch while this import ran: nothing was written.
    if ((e as { code?: string }).code === "P2002") return fail("Something in the file was added to the catalogue while it imported, so nothing was imported: check the preview again.");
    throw e;
  }
  // Products that went live, with "Announce" ticked: their "New online" campaigns, as drafts.
  const launches = bool(fd, "announce") ? announced(await announceProducts({ productIds: result.live, by: g.user.name, actor: g.actor })) : "";
  revalidatePath("/hq/catalogue");
  revalidatePath(PATH);
  flashTo(`${PATH}${qs({ file: uploadId, at })}`, [importSummary(result.counts, result.location?.name ?? null), launches].filter(Boolean).join(" "));
}
