import { notFound } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { incentiveExcluded, REG_CLASS_LABEL } from "@/lib/compliance";
import { can } from "@/server/hq/guard";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { zar, zarCompact } from "@/lib/money";
import { num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { ActionButton } from "@/components/hq/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { listStatus } from "@/components/hq/tones";
import { savePromotion, setPromotionActive } from "../actions";
import { Flash } from "@/components/hq/flash";
import { PromotionForm } from "../promotion-form";
import { promoOptions, promoValues } from "../load";

export const metadata = { title: "Promotion" };

export default async function PromotionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const promo = await db.promotion.findUnique({ where: { id } });
  if (!promo || (scope.kind !== "HQ" && promo.ownerStoreId && !ids.includes(promo.ownerStoreId))) notFound();
  const [opts, settings, usage, owner] = await Promise.all([
    promoOptions(),
    getSettings(),
    db.sale.aggregate({
      where: { promotionId: id, kind: "SALE", createdAt: { gte: promo.startsAt }, ...(scope.kind === "HQ" ? {} : { storeId: { in: ids } }) },
      _count: true,
      _sum: { totalCents: true, discountCents: true },
    }),
    promo.ownerStoreId ? db.store.findUnique({ where: { id: promo.ownerStoreId }, select: { name: true, code: true } }) : null,
  ]);
  const edit = can(user, "network");
  const [status, tone] = listStatus(promo);
  const uses = usage._count;

  return (
    <>
      <BackLink href="/hq/promotions">Promotions</BackLink>
      <PageHeader
        overline={owner ? `Local promotion · ${owner.name} (${owner.code})` : "Network promotion"}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {promo.name}
            <Badge tone={tone} dot>
              {status}
            </Badge>
            {promo.firstPurchaseOnly && <Badge tone="violet">Welcome gift</Badge>}
          </span>
        }
        description={`${describePromo(promo as PromoInput)}${promo.code ? ` · code ${promo.code}` : ""}`}
        actions={
          edit &&
          (promo.active ? (
            <ActionButton action={setPromotionActive.bind(null, promo.id, false)} pendingLabel="Pausing…">
              <Pause className="h-4 w-4" /> Pause
            </ActionButton>
          ) : (
            <ActionButton action={setPromotionActive.bind(null, promo.id, true)} variant="dark" pendingLabel="Resuming…">
              <Play className="h-4 w-4" /> Resume
            </ActionButton>
          ))
        }
      />
      {sp.saved && <Notice tone="success" className="mb-6">Promotion created.</Notice>}
      <Flash message={sp.m} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Times used" value={num(uses)} sub={promo.maxUses ? `of ${num(promo.maxUses)} allowed` : "transactions"} />
        <Stat label="Revenue with the deal" value={zarCompact(usage._sum.totalCents ?? 0)} sub="incl. VAT" />
        <Stat label="Discount given" value={zarCompact(usage._sum.discountCents ?? 0)} />
        <Stat label="Average basket" value={uses ? zar(Math.round((usage._sum.totalCents ?? 0) / uses)) : "—"} />
      </div>
      {!edit && <ViewOnly className="mb-6">View only — network promotions are managed by the HQ team.</ViewOnly>}
      <PromotionForm
        action={savePromotion.bind(null, promo.id)}
        values={promoValues(promo)}
        {...opts}
        excluded={incentiveExcluded(settings.compliance).map((c) => REG_CLASS_LABEL[c])}
        readOnly={!edit}
      />
    </>
  );
}
