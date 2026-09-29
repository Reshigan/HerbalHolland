// Members' saved delivery addresses (up to five; one default). The checkout offers them as chips and remembers the
// address an order ships to. POPIA: an address is personal information — it belongs to the member's own account and
// is shown only to them (and to the fulfilling store on the order itself).
import { cache } from "react";
import { db } from "@/server/db";
import type { Province } from "@/generated/prisma/client";

export const ADDRESS_MAX = 5;
export const ADDRESS_LABELS = ["Home", "Work", "Other"] as const;

export type AddressInput = { label?: string | null; line: string; suburb: string; city: string; province: Province; postalCode: string; notes?: string | null; isDefault?: boolean };
export class AddressError extends Error {}

export const listAddresses = cache((customerId: string) => db.address.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }));

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const tidy = (a: AddressInput) => ({
  label: (a.label?.trim() || "Home").slice(0, 30),
  line: a.line.trim().slice(0, 120),
  suburb: a.suburb.trim().slice(0, 60),
  city: a.city.trim().slice(0, 60),
  province: a.province,
  postalCode: a.postalCode.trim(),
  notes: a.notes?.trim().slice(0, 200) || null,
});

/** Creates or updates one of the member's addresses. The first address, or one marked default, becomes the default. */
export async function saveAddress(customerId: string, input: AddressInput, id?: string | null) {
  const data = tidy(input);
  const mine = await db.address.findMany({ where: { customerId }, select: { id: true, isDefault: true } });
  const current = id ? mine.find((a) => a.id === id) : null;
  if (id && !current) throw new AddressError("That address isn't on your account");
  if (!current && mine.length >= ADDRESS_MAX) throw new AddressError(`You can keep up to ${ADDRESS_MAX} addresses — remove one first`);
  const isDefault = !!input.isDefault || mine.length === 0 || (!!current?.isDefault && input.isDefault !== false);
  return db.$transaction(async (t) => {
    if (isDefault) await t.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
    return current ? t.address.update({ where: { id: current.id }, data: { ...data, isDefault } }) : t.address.create({ data: { ...data, customerId, isDefault } });
  });
}

export async function deleteAddress(customerId: string, id: string) {
  const { count } = await db.address.deleteMany({ where: { id, customerId } });
  if (!count) throw new AddressError("That address isn't on your account");
  // The most recent remaining address takes over as the default.
  const rest = await db.address.findMany({ where: { customerId }, orderBy: { updatedAt: "desc" }, select: { id: true, isDefault: true } });
  if (rest.length && !rest.some((a) => a.isDefault)) await db.address.update({ where: { id: rest[0].id }, data: { isDefault: true } });
}

export async function setDefaultAddress(customerId: string, id: string) {
  const a = await db.address.findFirst({ where: { id, customerId }, select: { id: true } });
  if (!a) throw new AddressError("That address isn't on your account");
  await db.$transaction([db.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } }), db.address.update({ where: { id }, data: { isDefault: true } })]);
}

/**
 * After an order: keeps the address it ships to. The same street address and postal code updates that entry (and its
 * notes); a new one is added while there's room, else the oldest non-default address makes way for it.
 */
export async function rememberAddress(customerId: string, a: { addressLine: string; suburb: string; city: string; province: Province; postalCode: string; notes?: string | null }, label?: string | null) {
  const data = tidy({ label, line: a.addressLine, suburb: a.suburb, city: a.city, province: a.province, postalCode: a.postalCode, notes: a.notes });
  const mine = await db.address.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "asc" }] });
  const same = mine.find((m) => norm(m.line) === norm(data.line) && m.postalCode === data.postalCode);
  if (same) return db.address.update({ where: { id: same.id }, data: { suburb: data.suburb, city: data.city, province: data.province, notes: data.notes, ...(label ? { label: data.label } : {}) } });
  if (mine.length >= ADDRESS_MAX) {
    const oldest = mine.filter((m) => !m.isDefault)[0] ?? mine[0];
    await db.address.delete({ where: { id: oldest.id } });
  }
  return db.address.create({ data: { ...data, customerId, isDefault: mine.length === 0 } });
}
