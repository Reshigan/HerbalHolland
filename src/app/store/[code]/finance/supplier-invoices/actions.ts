"use server";
import { revalidatePath } from "next/cache";
import { captureSupplierInvoice, paySupplierInvoice, querySupplierInvoice, reopenSupplierInvoice, SupplierInvoiceError } from "@/server/supplier-invoices";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { bool, parseRand, str } from "@/server/store/rules";
import { MAX_INVOICE_BYTES } from "@/lib/supplier-invoice-rules";
import { vatOf, zar } from "@/lib/money";

const refresh = (code: string) => {
  revalidatePath(`/store/${code}/finance/supplier-invoices`);
  revalidatePath(`/store/${code}/finance`);
  revalidatePath(`/store/${code}`);
};

const asField = (e: unknown) => (e instanceof SupplierInvoiceError ? fail(e.message, e.field) : null);

/** From Finance → Supplier invoices (stock orders are put on when they're received). */
export async function captureInvoice(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const total = parseRand(str(fd, "total"));
    if (total == null || total <= 0) return fail("Enter the invoice total including VAT", "total");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return fail("Add a photo or PDF of the invoice", "file");
    if (file.size > MAX_INVOICE_BYTES) return fail("The file is over 8 MB. Take the photo again or use a smaller PDF.", "file");
    const accountId = str(fd, "accountId");
    if (!accountId) return fail("Choose what the invoice is charged to", "accountId");
    try {
      const inv = await captureSupplierInvoice(
        {
          storeId: store.id, storeCode: store.code, supplierName: str(fd, "supplierName"), number: str(fd, "number"), invoiceDate: str(fd, "invoiceDate"), dueDate: str(fd, "dueDate"),
          totalCents: total, vatCents: bool(fd, "vat") ? vatOf(total) : 0, accountId, note: str(fd, "note") || null, file,
        },
        { ...actor, id: user.id },
      );
      refresh(store.code);
      return done(`Captured invoice ${inv.number} from ${inv.supplierName}: ${zar(inv.totalCents)}, due ${inv.dueDate.toISOString().slice(0, 10)}.`);
    } catch (e) {
      return asField(e) ?? Promise.reject(e);
    }
  });
}

export async function payInvoice(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    try {
      const inv = await paySupplierInvoice(id, store.id, { paidOn: str(fd, "paidOn") || null, note: str(fd, "note") || null }, { ...actor, id: user.id });
      refresh(store.code);
      return done(`${inv.number} marked paid.`);
    } catch (e) {
      return asField(e) ?? Promise.reject(e);
    }
  });
}

export async function queryInvoice(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    try {
      const inv = await querySupplierInvoice(id, store.id, str(fd, "note"), { ...actor, id: user.id });
      refresh(store.code);
      return done(`${inv.number} queried. It stays out of what's due until you reopen it.`);
    } catch (e) {
      return asField(e) ?? Promise.reject(e);
    }
  });
}

export async function reopenInvoice(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    try {
      const inv = await reopenSupplierInvoice(id, store.id, { ...actor, id: user.id });
      refresh(store.code);
      return done(`${inv.number} is due again.`);
    } catch (e) {
      return asField(e) ?? Promise.reject(e);
    }
  });
}
