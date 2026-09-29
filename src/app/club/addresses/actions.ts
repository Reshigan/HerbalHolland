"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { getCustomer } from "@/server/auth";
import { AddressError, deleteAddress, saveAddress, setDefaultAddress } from "@/server/shop/addresses";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

export type AddressState = { ok?: boolean; error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const Address = z.object({
  label: z.string().trim().max(30).optional(),
  line: z.string().trim().min(4, "Enter the street address").max(120),
  suburb: z.string().trim().min(2, "Enter the suburb").max(60),
  city: z.string().trim().min(2, "Enter the town or city").max(60),
  province: z.enum(Object.keys(PROVINCES) as [ProvinceCode, ...ProvinceCode[]], { message: "Choose the province" }),
  postalCode: z.string().trim().regex(/^\d{4}$/, "4-digit postal code"),
  notes: z.string().trim().max(200).optional(),
});
const FIELDS = ["id", "label", "line", "suburb", "city", "province", "postalCode", "notes", "isDefault"];

export async function saveAddressAction(_: AddressState, form: FormData): Promise<AddressState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "")]));
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again", values };
  const a = Address.safeParse({ label: values.label, line: values.line, suburb: values.suburb, city: values.city, province: values.province, postalCode: values.postalCode, notes: values.notes || undefined });
  if (!a.success) return { error: "Check the address", fields: Object.fromEntries(a.error.issues.map((i) => [String(i.path[0]), i.message])), values };
  try {
    await saveAddress(c.id, { ...a.data, isDefault: values.isDefault === "yes" }, values.id || null);
  } catch (e) {
    if (e instanceof AddressError) return { error: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function deleteAddressForm(form: FormData) {
  const c = await getCustomer();
  const id = String(form.get("id") ?? "");
  if (c && id) await deleteAddress(c.id, id).catch(() => undefined);
  refresh();
}

export async function defaultAddressForm(form: FormData) {
  const c = await getCustomer();
  const id = String(form.get("id") ?? "");
  if (c && id) await setDefaultAddress(c.id, id).catch(() => undefined);
  refresh();
}
