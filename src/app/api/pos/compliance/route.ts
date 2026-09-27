// Pre-payment compliance check (domain: compliance.evaluateBasket) — basket, customer,
// the store's licences and whether the signed-in staff member may dispense.
import { z } from "zod";
import { db } from "@/server/db";
import { evaluateBasket } from "@/server/compliance";
import { json, readBody, withStaff } from "@/server/pos/http";
import { AgeCheck, Items } from "@/server/pos/schemas";
import { classifyBlock } from "@/components/pos/lib/rules";
import type { ComplianceDTO } from "@/server/pos/types";

const Body = z.object({ items: Items, customerId: z.string().nullish(), ageCheck: AgeCheck.nullish() });

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const variants = await db.variant.findMany({
    where: { id: { in: b.items.map((i) => i.variantId) } },
    select: { id: true, name: true, grams: true, product: { select: { name: true, regClass: true, tobaccoRelated: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const items = b.items
    .filter((i) => byId.has(i.variantId))
    .map((i) => {
      const v = byId.get(i.variantId)!;
      return { name: `${v.product.name} · ${v.name}`, regClass: v.product.regClass, grams: v.grams, qty: i.qty, tobaccoRelated: v.product.tobaccoRelated };
    });
  const r = await evaluateBasket({
    items,
    channel: "POS",
    customerId: b.customerId,
    storeLicences: pos.device.store.licences,
    ageCheckedAtCounter: b.ageCheck === "ID_SIGHTED" || b.ageCheck === "ID_NUMBER",
    staffCanDispense: pos.user.canDispense,
  });
  const dto: ComplianceDTO = {
    ok: r.ok,
    blocks: r.blocks.map((message) => ({ kind: classifyBlock(message), message })),
    needsAgeCheck: r.needsAgeCheck,
    needsPrescription: r.needsPrescription,
    gramsInCart: r.gramsInCart,
    staffCanDispense: pos.user.canDispense,
  };
  return json(dto);
});
