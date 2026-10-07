"use server";
import { revalidatePath } from "next/cache";
import { guard, DENIED, fail, flashTo, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import { eraseMember, ErasureError } from "@/server/popia";

/**
 * POPIA s24 erasure, for a verified request (HQ administrator, type-to-confirm). Irreversible: @/server/popia erases
 * everything personal and keeps sales, tax invoices, the points ledger and dispensing records for their statutory
 * retention periods, detached from the person. Audited as customer.anonymise.
 */
export async function anonymiseCustomer(customerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (str(fd, "confirm").toUpperCase() !== "ANONYMISE") return fail("Type ANONYMISE to confirm.");
  try {
    await eraseMember(customerId, g.actor, str(fd, "reason") || "Data subject request");
  } catch (e) {
    if (e instanceof ErasureError) return fail(e.message);
    throw e;
  }
  revalidatePath(`/hq/customers/${customerId}`);
  flashTo(`/hq/customers/${customerId}`, "Personal information erased. Financial and dispensing records remain, detached from the person.");
}
