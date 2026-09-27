// Server side of the compliance engine: builds the customer context (age, patient
// authorisation headroom, grams bought) and evaluates a basket for a channel.
import { db } from "./db";
import { getSettings } from "./settings";
import { OPEN_ORDER_STATUSES } from "./inventory";
import { checkCompliance, type ComplianceItem, type RegClass, type SellChannel } from "@/lib/compliance";
import { ageOn } from "@/lib/sa";
import { addDays, startOfDaySA } from "@/lib/format";

/** Grams of the given classes bought since `since` (posted sales + open online orders). */
export async function gramsSince(customerId: string, classes: string[], since: Date) {
  const [r] = await db.$queryRaw<{ g: number }[]>`
    SELECT COALESCE(SUM(x.g), 0)::float AS g FROM (
      SELECT l.qty * COALESCE(v.grams, 0) AS g FROM "SaleLine" l
        JOIN "Sale" s ON s.id = l."saleId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
        WHERE s."customerId" = ${customerId} AND s."createdAt" >= ${since} AND p."regClass"::text = ANY(${classes}::text[])
      UNION ALL
      SELECT l.qty * COALESCE(v.grams, 0) FROM "OrderLine" l
        JOIN "Order" o ON o.id = l."orderId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
        WHERE o."customerId" = ${customerId} AND o."createdAt" >= ${since}
          AND o.status::text = ANY(${[...OPEN_ORDER_STATUSES]}::text[]) AND p."regClass"::text = ANY(${classes}::text[])
    ) x`;
  return r?.g ?? 0;
}

export async function activeAuthorisation(customerId: string, at = new Date()) {
  return db.patientAuth.findFirst({
    where: { customerId, status: "ACTIVE", validFrom: { lte: at }, validTo: { gte: at } },
    orderBy: { validTo: "desc" },
  });
}

export async function customerContext(customerId: string | null | undefined, at = new Date()) {
  if (!customerId) return { record: null, customer: null, gramsToday: 0 };
  const settings = await getSettings();
  const record = await db.customer.findUnique({ where: { id: customerId } });
  if (!record) return { record: null, customer: null, gramsToday: 0 };
  const classes = settings.compliance.licensedOnly;
  const auth = await activeAuthorisation(customerId, at);
  const [today, month] = await Promise.all([
    gramsSince(customerId, classes, startOfDaySA(at)),
    auth ? gramsSince(customerId, classes, addDays(at, -30)) : Promise.resolve(0),
  ]);
  return {
    record,
    auth,
    customer: {
      ageVerified: !!record.ageVerifiedAt,
      age: record.dob ? ageOn(record.dob, at) : null,
      patient: auth ? { active: true, remainingGrams: Math.max(0, auth.monthlyLimitGrams - month), authNumber: auth.authNumber } : null,
    },
    gramsToday: today,
  };
}

export async function evaluateBasket(a: {
  items: ComplianceItem[];
  channel: SellChannel;
  customerId?: string | null;
  storeLicences?: RegClass[];
  ageCheckedAtCounter?: boolean;
  staffCanDispense?: boolean;
}) {
  const settings = await getSettings();
  const ctx = await customerContext(a.customerId);
  const result = checkCompliance({
    items: a.items,
    channel: a.channel,
    customer: ctx.customer,
    storeLicences: a.storeLicences,
    gramsToday: ctx.gramsToday,
    ageCheckedAtCounter: a.ageCheckedAtCounter,
    staffCanDispense: a.staffCanDispense,
    settings: settings.compliance,
  });
  return { ...result, ctx, settings };
}
