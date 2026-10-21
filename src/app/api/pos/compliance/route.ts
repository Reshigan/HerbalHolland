// Pre-payment checks (domain: compliance.evaluateBasket): basket, customer, the store's
// licences and whether the signed-in staff member may dispense, plus limited-drop rules
// (members only, opening time, per-member limit: drops.dropBlocks), so nobody is charged
// for a basket the sale would then refuse.
import { z } from "zod";
import { db } from "@/server/db";
import { evaluateBasket } from "@/server/compliance";
import type { RegClass } from "@/lib/compliance";
import { dropBlocks } from "@/server/drops";
import { json, readBody, withStaff } from "@/server/pos/http";
import { AgeCheck, Items } from "@/server/pos/schemas";
import { classifyBlock } from "@/components/pos/lib/rules";
import type { ComplianceDTO } from "@/server/pos/types";
import { asList } from "@/lib/json-list";

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
  const [r, drops] = await Promise.all([
    evaluateBasket({
      items,
      channel: "POS",
      customerId: b.customerId,
      storeLicences: asList<RegClass>(pos.device.store.licences),
      ageCheckedAtCounter: b.ageCheck === "ID_SIGHTED" || b.ageCheck === "ID_NUMBER",
      staffCanDispense: pos.user.canDispense,
    }),
    dropBlocks(b.customerId, b.items),
  ]);
  const dto: ComplianceDTO = {
    ok: r.ok && !drops.length,
    blocks: [...r.blocks.map((message) => ({ kind: classifyBlock(message), message })), ...drops.map((message) => ({ kind: "DROP" as const, message }))],
    needsAgeCheck: r.needsAgeCheck,
    needsPrescription: r.needsPrescription,
    gramsInCart: r.gramsInCart,
    staffCanDispense: pos.user.canDispense,
  };
  return json(dto);
});
