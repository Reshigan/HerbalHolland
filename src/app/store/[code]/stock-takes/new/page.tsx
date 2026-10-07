import Link from "next/link";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { timeAgo } from "@/lib/format";
import { startTake } from "../actions";
import { NewTakeForm } from "./new-take-form";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { BackLink, ReadOnlyNote } from "@/components/store/ui";

export const metadata = { title: "New stock take" };

export default async function NewStockTakePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const [cats, open, last] = await Promise.all([
    db.$queryRaw<{ slug: string; name: string; lines: number }[]>`
      SELECT c.slug, c.name, COUNT(sl.id)::int AS lines
      FROM "Category" c
      LEFT JOIN "Product" p ON p."categoryId" = c.id
      LEFT JOIN "Variant" v ON v."productId" = p.id
      LEFT JOIN "StockLevel" sl ON sl."variantId" = v.id AND sl."storeId" = ${store.id}
        AND (sl."onHand" <> 0 OR EXISTS (SELECT 1 FROM "StoreVariant" sv WHERE sv."storeId" = sl."storeId" AND sv."variantId" = sl."variantId"))
      GROUP BY c.id, c.slug, c.name, c."sortOrder" ORDER BY c."sortOrder", c.name`,
    db.stockTake.findMany({ where: { storeId: store.id, status: "COUNTING" }, select: { id: true, number: true, scope: true } }),
    db.stockTake.groupBy({ by: ["scope"], where: { storeId: store.id, status: "APPROVED" }, _max: { approvedAt: true } }),
  ]);
  const lastBy = new Map(last.map((l) => [l.scope, l._max.approvedAt]));
  const lastFull = lastBy.get("FULL");
  const fullLines = cats.reduce((s, c) => s + c.lines, 0);
  const busy = open.map((o) => o.scope);

  return (
    <>
      <BackLink href={`/store/${store.code}/stock-takes`}>Stock takes</BackLink>
      <PageHeader overline={`Inventory · ${store.name}`} title="New stock take" description={lastFull ? `Last full count approved ${timeAgo(lastFull)}.` : "No full count approved yet."} />
      <div className="max-w-3xl space-y-4">
        {open.length > 0 && (
          <Notice tone="warn" title="A count is already in progress">
            {open.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ", "}
                <Link href={`/store/${store.code}/stock-takes/${o.id}`} className="font-semibold underline">
                  {o.number}
                </Link>
              </span>
            ))}
            : overlapping counts would double-post variances, so finish or cancel it before counting the same stock again.
          </Notice>
        )}
        <Card>
          <CardBody>
            {canManage ? (
              <NewTakeForm
                action={startTake.bind(null, store.code)}
                fullLines={fullLines}
                busy={busy}
                cats={cats.map((c) => {
                  const lc = lastBy.get(c.slug) ?? null;
                  return { ...c, lastCounted: lc ? timeAgo(lc) : null };
                })}
              />
            ) : (
              <ReadOnlyNote>Only managers and owners can start a stock take.</ReadOnlyNote>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
