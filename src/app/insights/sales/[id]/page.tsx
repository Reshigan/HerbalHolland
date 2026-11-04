import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { insightsContext } from "@/server/insights";
import { CHANNEL_LABEL } from "@/server/finance";
import { fmtDateTime } from "@/lib/format";
import { pct, zar } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { InsightsShell, Row, insightHref, memberName, type InsightParams } from "@/components/insights/ui";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<InsightParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await insightsContext(sp, `/insights/sales/${id}`);
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      store: { select: { name: true } },
      customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, homeStoreId: true } },
      lines: { include: { variant: { select: { name: true, product: { select: { name: true } } } } } },
      payments: { select: { id: true, method: true, amountCents: true } },
    },
  });
  if (!sale || !ctx.allIds.includes(sale.storeId)) notFound();
  const c = sale.customer;
  const ownMember = c && (ctx.seesAllMembers || (c.homeStoreId && ctx.allIds.includes(c.homeStoreId)));
  const net = sale.totalCents - sale.vatCents;
  return (
    <InsightsShell tab="sales" path={`/insights/sales/${id}`} ctx={{ ...ctx, store: undefined }} sp={sp} title={sale.number} back={{ href: insightHref("/insights/sales/list", sp), label: "All sales" }}>
      <p className="-mt-3 text-sm text-ink-500">
        {sale.store.name} · {CHANNEL_LABEL[sale.channel]} · {fmtDateTime(sale.createdAt)}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Items" className="pb-4" />
          <ul className="border-t border-ink-150">
            {sale.lines.map((l) => (
              <Row key={l.id} href={insightHref(`/insights/sales/product/${l.variantId}`, sp)} title={`${l.variant.product.name} · ${l.variant.name}`} sub={`${l.qty} × ${zar(l.unitPriceCents)}`} value={zar(l.totalCents)} />
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Totals" className="pb-4" />
          <ul className="border-t border-ink-150">
            {sale.discountCents > 0 && <Row title="Discount" value={`-${zar(sale.discountCents)}`} />}
            {sale.memberSavingsCents > 0 && <Row title="Member savings" value={`-${zar(sale.memberSavingsCents)}`} />}
            <Row title="VAT" value={zar(sale.vatCents)} />
            <Row title="Total" value={zar(sale.totalCents)} />
            <Row title="Gross margin" value={pct(net ? (net - sale.costCents) / net : 0)} />
            {sale.payments.map((p) => (
              <Row key={p.id} title={`Paid by ${titleCase(p.method).toLowerCase()}`} value={zar(p.amountCents)} />
            ))}
            {c && <Row href={ownMember ? insightHref(`/insights/members/${c.id}`, sp) : undefined} title={memberName(c)} sub={`Member ${c.memberNo}`} />}
          </ul>
        </Card>
      </div>
    </InsightsShell>
  );
}
