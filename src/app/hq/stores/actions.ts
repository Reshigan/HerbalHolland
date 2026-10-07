"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, inScope, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, opt, bool, parsePctToBps, parseNum, parseDay, slugify } from "@/server/hq/form";
import { normalisePhone, PROVINCES } from "@/lib/sa";
import { rescheduleChecklist, seedChecklist } from "@/server/store-tasks";
import type { Province, StoreFormat, StoreStatus } from "@/generated/prisma/client";
import { isEmail } from "@/lib/email";

const FORMATS: StoreFormat[] = ["FLAGSHIP", "STANDARD", "EXPRESS"];
const STATUSES: StoreStatus[] = ["ACTIVE", "OPENING_SOON", "CLOSED"];

function readAddress(fd: FormData) {
  const fields: Record<string, string> = {};
  const a = {
    addressLine: str(fd, "addressLine"),
    suburb: str(fd, "suburb"),
    city: str(fd, "city"),
    province: str(fd, "province") as Province,
    postalCode: str(fd, "postalCode"),
  };
  if (!a.addressLine) fields.addressLine = "Street address is required";
  if (!a.suburb) fields.suburb = "Suburb is required";
  if (!a.city) fields.city = "City is required";
  if (!(a.province in PROVINCES)) fields.province = "Choose a province";
  if (!/^\d{4}$/.test(a.postalCode)) fields.postalCode = "4-digit postal code";
  return { a, fields };
}

function readContact(fd: FormData, fields: Record<string, string>) {
  const email = str(fd, "email").toLowerCase();
  if (email && !isEmail(email)) fields.email = "Enter a valid email";
  const wa = str(fd, "whatsapp");
  const whatsapp = wa ? normalisePhone(wa) : null;
  if (wa && !whatsapp) fields.whatsapp = "Enter a valid SA mobile number";
  return { email: email || null, phone: opt(fd, "phone"), whatsapp };
}

function readFees(fd: FormData, fields: Record<string, string>) {
  const out = { royaltyBps: parsePctToBps(str(fd, "royalty")), levyBps: parsePctToBps(str(fd, "levy")), ecomBps: parsePctToBps(str(fd, "ecom")) };
  if (out.royaltyBps == null || out.royaltyBps > 3000) fields.royalty = "0–30%";
  if (out.levyBps == null || out.levyBps > 1500) fields.levy = "0–15%";
  if (out.ecomBps == null || out.ecomBps > 3000) fields.ecom = "0–30%";
  return out as { royaltyBps: number; levyBps: number; ecomBps: number };
}

async function dcFor(regionId: string, fd: FormData, fields: Record<string, string>) {
  const dcId = opt(fd, "dcId");
  if (dcId && !(await db.store.count({ where: { id: dcId, kind: "WAREHOUSE" } }))) fields.dcId = "Choose a distribution centre";
  if (!(await db.region.count({ where: { id: regionId } }))) fields.regionId = "Choose a region";
  return dcId;
}

export async function saveStoreProfile(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g || !(await inScope(g.scope, storeId))) return DENIED;
  const { a, fields } = readAddress(fd);
  const contact = readContact(fd, fields);
  const name = str(fd, "name");
  if (!name) fields.name = "Store name is required";
  const format = str(fd, "format") as StoreFormat;
  if (!FORMATS.includes(format)) fields.format = "Choose a format";
  const regionId = str(fd, "regionId");
  const dcId = await dcFor(regionId, fd, fields);
  const lat = parseNum(str(fd, "lat")), lng = parseNum(str(fd, "lng"));
  if ((lat != null && (lat < -35 || lat > -22)) || (lng != null && (lng < 16 || lng > 33))) fields.lat = "Coordinates must be inside South Africa";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const before = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const data = {
    name, format, regionId, dcId, ...a, ...contact, lat, lng,
    clickCollect: bool(fd, "clickCollect"), sameDay: bool(fd, "sameDay"), receiptFooter: opt(fd, "receiptFooter"),
  };
  await db.store.update({ where: { id: storeId }, data });
  const changed = Object.keys(data).filter((k) => String(before[k as keyof typeof before] ?? "") !== String(data[k as keyof typeof data] ?? ""));
  await audit(db, g.actor, "store.update", { storeId, entity: "Store", entityId: storeId, data: { changed } });
  revalidatePath(`/hq/stores/${before.code}`);
  return done(changed.length ? "Store profile saved." : "No changes to save.");
}

export async function saveStoreFees(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const fees = readFees(fd, fields);
  if (Object.keys(fields).length) return fail("Fees must be percentages of net sales.", fields);
  const before = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { code: true, royaltyBps: true, levyBps: true, ecomBps: true } });
  await db.store.update({ where: { id: storeId }, data: fees });
  await audit(db, g.actor, "store.fees", { storeId, entity: "Store", entityId: storeId, data: { before: { royaltyBps: before.royaltyBps, levyBps: before.levyBps, ecomBps: before.ecomBps }, after: fees } });
  revalidatePath(`/hq/stores/${before.code}`);
  return done("Fees updated — they apply from the next statement.");
}

export async function saveStoreStatus(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const status = str(fd, "status") as StoreStatus;
  if (!STATUSES.includes(status)) return fail("Choose a status.");
  const openedAt = parseDay(str(fd, "openedAt"));
  const before = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { code: true, status: true, openedAt: true } });
  const after = await db.store.update({ where: { id: storeId }, data: { status, openedAt: openedAt ?? (status === "ACTIVE" && before.status !== "ACTIVE" ? new Date() : undefined) } });
  await audit(db, g.actor, "store.status", { storeId, entity: "Store", entityId: storeId, data: { from: before.status, to: status } });
  // The opening checklist follows the opening day while the store is still opening.
  if (status !== "ACTIVE" && after.openedAt?.getTime() !== before.openedAt?.getTime()) await rescheduleChecklist(storeId, after.openedAt);
  revalidatePath(`/hq/stores/${before.code}`);
  return done(status === before.status ? "Saved." : `Store is now ${status.replace("_", " ").toLowerCase()}.`);
}

export async function saveCompany(companyId: string, storeCode: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const legalName = str(fd, "legalName");
  if (!legalName) fields.legalName = "Registered name is required";
  const vat = str(fd, "vatNumber").replace(/\s/g, "");
  if (vat && !/^4\d{9}$/.test(vat)) fields.vatNumber = "SA VAT numbers are 10 digits starting with 4";
  const email = str(fd, "email").toLowerCase();
  if (email && !isEmail(email)) fields.email = "Enter a valid email";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  await db.company.update({
    where: { id: companyId },
    data: { legalName, name: str(fd, "name") || legalName.replace(/\s*\(Pty\) Ltd\.?$/i, ""), regNumber: opt(fd, "regNumber"), vatNumber: vat || null, contactName: opt(fd, "contactName"), email: email || null, phone: opt(fd, "phone"), address: opt(fd, "address") },
  });
  await audit(db, g.actor, "company.update", { entity: "Company", entityId: companyId, data: { vatBefore: before.vatNumber, vatAfter: vat || null } });
  revalidatePath(`/hq/stores/${storeCode}`);
  return done(before.vatNumber !== (vat || null) ? "Owner saved. VAT status changes apply to invoices from now on." : "Owner saved.");
}

export async function createStore(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const { a, fields } = readAddress(fd);
  const contact = readContact(fd, fields);
  const fees = readFees(fd, fields);
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  if (!/^[A-Z]{3}\d{2,3}$/.test(code)) fields.code = "Three letters and a number, e.g. PTA06";
  else if (await db.store.count({ where: { code } })) fields.code = "That code is already in use";
  if (!name) fields.name = "Store name is required";
  const format = str(fd, "format") as StoreFormat;
  if (!FORMATS.includes(format)) fields.format = "Choose a format";
  const status = (str(fd, "status") || "OPENING_SOON") as StoreStatus;
  const regionId = str(fd, "regionId");
  const dcId = await dcFor(regionId, fd, fields);
  const openedAt = parseDay(str(fd, "openedAt"));

  const companyMode = str(fd, "companyMode");
  let companyId = str(fd, "companyId");
  const newCo = {
    legalName: str(fd, "coLegalName"), name: str(fd, "coName"), regNumber: opt(fd, "coRegNumber"),
    vatNumber: str(fd, "coVatNumber").replace(/\s/g, "") || null, contactName: opt(fd, "coContactName"),
    email: str(fd, "coEmail").toLowerCase() || null, phone: opt(fd, "coPhone"), address: opt(fd, "coAddress"),
  };
  if (companyMode === "new") {
    if (!newCo.legalName) fields.coLegalName = "Registered name is required";
    if (newCo.vatNumber && !/^4\d{9}$/.test(newCo.vatNumber)) fields.coVatNumber = "SA VAT numbers are 10 digits starting with 4";
    if (!newCo.email || !isEmail(newCo.email)) fields.coEmail = "Statements and invoices are emailed here";
  } else if (!companyId || !(await db.company.count({ where: { id: companyId, kind: "FRANCHISEE" } }))) fields.companyId = "Choose the owning company";

  const templateId = opt(fd, "templateId");
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  let slug = slugify(name);
  if (await db.store.count({ where: { slug } })) slug = slugify(`${name}-${code}`);

  const store = await tx(async (t) => {
    if (companyMode === "new") {
      const co = await t.company.create({ data: { kind: "FRANCHISEE", ...newCo, name: newCo.name || newCo.legalName.replace(/\s*\(Pty\) Ltd\.?$/i, "") } });
      companyId = co.id;
      await audit(t, g.actor, "company.create", { entity: "Company", entityId: co.id, data: { legalName: co.legalName } });
    }
    const s = await t.store.create({
      data: { code, slug, name, format, status, regionId, dcId, companyId, ...a, ...contact, ...fees, openedAt, licences: [], clickCollect: true },
    });
    let ranged = 0;
    if (templateId) {
      const rows = await t.storeVariant.findMany({ where: { storeId: templateId, variant: { active: true } }, select: { variantId: true, reorderPoint: true, parLevel: true } });
      // Shelf prices are never copied: each franchisee sets its own (Competition Act s5(2)).
      const r = await t.storeVariant.createMany({ data: rows.map((x) => ({ storeId: s.id, variantId: x.variantId, reorderPoint: x.reorderPoint, parLevel: x.parLevel })), skipDuplicates: true });
      ranged = r.count;
    }
    await audit(t, g.actor, "store.create", { storeId: s.id, entity: "Store", entityId: s.id, data: { code, companyId, templateId, ranged } });
    // Franchisee onboarding: the opening checklist, due dates counted back from the opening day (once it's set).
    if (s.kind === "RETAIL") await seedChecklist(t, s, g.actor);
    return s;
  });
  revalidatePath("/hq/stores");
  redirect(`/hq/stores/${store.code}?created=1`);
}
