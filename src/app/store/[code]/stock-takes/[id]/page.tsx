import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { currentOnHand, scopeLabels, stockTakeSheet } from "@/server/store/stock-takes";
import { varianceSummary, hrefWith } from "@/server/store/rules";
import { pct, zar } from "@/lib/money";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { approveTake, cancelTake, saveCounts } from "../actions";
import { CountSheet } from "./count-sheet";
import { PageHeader, Notice, EmptyState } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { BackLink, Chips, PrintStyles, Qty, ReadOnlyNote } from "@/components/store/ui";
import { ConfirmAction, PrintButton } from "@/components/store/action-form";

export const metadata = { title: "Stock take" };

type SP = { step?: string; show?: string };

export default async function StockTakePage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<SP> }) {
  const [{ code, id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const [sheet, { label }] = await Promise.all([stockTakeSheet(store.id, id), scopeLabels()]);
  if (!sheet) notFound();
  const { take, lines } = sheet;
  const base = `/store/${store.code}/stock-takes`;
  const path = `${base}/${id}`;
  const review = take.status === "COUNTING" && sp.step === "review" && canManage;

  const header = (
    <>
      <BackLink href={base}>Stock takes</BackLink>
      <PageHeader
        overline={`Inventory · ${store.name}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {take.number}
            <StatusBadge status={take.status} />
            {take.blind && (
              <Badge>
                <EyeOff className="h-3 w-3" aria-hidden /> Blind
              </Badge>
            )}
          </span>
        }
        description={
          <>
            {label(take.scope)} · started {fmtDateTime(take.createdAt)}
            {sheet.createdBy ? ` by ${sheet.createdBy}` : ""}
            {take.approvedAt && ` · approved ${fmtDateTime(take.approvedAt)}${sheet.approvedBy ? ` by ${sheet.approvedBy}` : ""}`}
            {take.notes && <span className="mt-1 block text-ink-600">“{take.notes}”</span>}
          </>
        }
        actions={
          take.status === "APPROVED" ? (
            <PrintButton label="Print variance report" />
          ) : take.status === "COUNTING" && canManage && !review ? (
            <ConfirmAction
              action={cancelTake.bind(null, store.code, id)}
              label="Cancel count"
              title={`Cancel ${take.number}?`}
              confirmLabel="Yes, cancel this count"
            >
              Counts entered so far are kept for the record but nothing is posted to stock.
            </ConfirmAction>
          ) : null
        }
      />
    </>
  );

  // ── Counting ──
  if (take.status === "COUNTING" && !review) {
    return (
      <>
        {header}
        {!canManage && <ReadOnlyNote className="mb-4">Read-only — managers and owners enter counts and approve.</ReadOnlyNote>}
        <CountSheet
          blind={take.blind}
          canEdit={canManage}
          save={saveCounts.bind(null, store.code, id)}
          reviewHref={canManage ? `${path}?step=review` : null}
          lines={lines.map((l) => ({
            id: l.id,
            sku: l.sku,
            barcode: l.barcode,
            productName: l.productName,
            variantName: l.variantName,
            category: l.category,
            batchCode: l.batchCode,
            blocked: l.batchStatus !== "RELEASED",
            expiry: l.expiresAt ? `Exp ${fmtDate(l.expiresAt)}` : null,
            expected: take.blind ? null : l.expectedQty,
            counted: l.countedQty,
          }))}
        />
      </>
    );
  }

  // ── Review (live) or result (approved / cancelled) ──
  const now = review ? await currentOnHand(store.id, lines) : null;
  const rows = lines.map((l) => {
    const lot = now?.get(`${l.variantId}:${l.batchId}`);
    const system = now ? lot?.onHand ?? 0 : l.countedQty != null && l.varianceQty != null ? l.countedQty - l.varianceQty : l.expectedQty;
    const cost = now ? lot?.unitCostCents ?? l.unitCostCents : l.unitCostCents;
    const variance = l.countedQty == null ? null : now ? l.countedQty - system : l.varianceQty ?? l.countedQty - system;
    return { ...l, system, cost, variance, moved: now ? system !== l.expectedQty : false };
  });
  const sum = varianceSummary(rows.map((r) => ({ counted: r.countedQty, system: r.system, unitCostCents: r.cost })));
  const moved = rows.filter((r) => r.moved && r.countedQty != null).length;
  const show = sp.show === "all" ? "all" : sp.show === "uncounted" ? "uncounted" : "variance";
  const listed = rows
    .filter((r) => (show === "all" ? true : show === "uncounted" ? r.countedQty == null : r.variance != null && r.variance !== 0))
    .sort((a, b) => Math.abs((b.variance ?? 0) * b.cost) - Math.abs((a.variance ?? 0) * a.cost));

  return (
    <>
      {header}
      {review && <PrintStyles />}
      {take.status === "APPROVED" && <PrintStyles />}

      {review && (
        <Notice tone="info" className="mb-4" title="Review before approving">
          Variances compare each count with what the system holds <b>right now</b>. Approving posts a stock-take movement for every difference — it can&apos;t be undone.
          {moved > 0 && (
            <span className="mt-1 flex items-start gap-1.5 font-medium text-amber-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {moved} counted line{moved > 1 ? "s have" : " has"} had sales or deliveries since counting started. Re-count those lines if stock moved after they were counted.
            </span>
          )}
        </Notice>
      )}
      {take.status === "CANCELLED" && <Notice tone="warn" className="mb-4">This count was cancelled — nothing was posted to stock.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Lines counted" value={`${sum.counted} / ${sum.lines}`} sub={sum.uncounted ? `${sum.uncounted} left unchanged` : "every line counted"} />
        <Stat label="Net variance (units)" value={<Qty n={sum.netUnits} />} sub={`${sum.overUnits} found · ${sum.shortUnits} missing`} />
        <Stat label="Net variance at cost" value={<span className={sum.netValue < 0 ? "text-rose-600" : sum.netValue > 0 ? "text-leaf-700" : undefined}>{zar(sum.netValue)}</span>} sub="FIFO cost of the lots" />
        <Stat label="Shrinkage at cost" value={zar(sum.shortValue)} sub={`found stock ${zar(sum.overValue)}`} />
        <Stat label="Count accuracy" value={pct(sum.accuracy, 0)} sub="counted lines with no variance" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title={review ? "Variances to post" : "Variance by line"}
          description={
            review
              ? "Sorted by value at cost"
              : take.status === "APPROVED"
                ? `Posted ${take.approvedAt ? timeAgo(take.approvedAt) : ""} as stock-take movements`
                : "Counts entered before the count was cancelled — nothing was posted"
          }
        />
        <div className="no-print px-5 pt-3">
          <Chips
            label="Lines"
            current={show}
            items={[
              { key: "variance", label: "Variances", count: rows.filter((r) => r.variance != null && r.variance !== 0).length, href: hrefWith(path, sp, { show: null }) },
              { key: "uncounted", label: "Not counted", count: sum.uncounted, href: hrefWith(path, sp, { show: "uncounted" }) },
              { key: "all", label: "All lines", count: rows.length, href: hrefWith(path, sp, { show: "all" }) },
            ]}
          />
        </div>
        {listed.length === 0 ? (
          <EmptyState title={show === "variance" ? "No variances — the count matched the system" : "Nothing to show"} />
        ) : (
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th align="right">At start</Th>
                <Th align="right">{review ? "On hand now" : "At approval"}</Th>
                <Th align="right">Counted</Th>
                <Th align="right">Variance</Th>
                <Th align="right">Value at cost</Th>
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/store/${store.code}/inventory/${r.variantId}`} className="font-medium text-ink-900 hover:text-oranje-700">
                      {r.productName} <span className="text-ink-500">· {r.variantName}</span>
                    </Link>
                    <div className="font-mono text-xs text-ink-400">{r.sku}</div>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-600">{r.batchCode}</Td>
                  <Td align="right" className="text-ink-500">{r.expectedQty}</Td>
                  <Td align="right" className={r.moved ? "font-semibold text-amber-700" : undefined}>
                    {r.system}
                    {r.moved && <span className="sr-only"> (changed since counting started)</span>}
                  </Td>
                  <Td align="right" className="font-semibold text-ink-950">{r.countedQty ?? <span className="font-normal text-ink-300">—</span>}</Td>
                  <Td align="right">{r.variance == null ? <span className="text-ink-300">—</span> : <Qty n={r.variance} />}</Td>
                  <Td align="right" className={r.variance && r.variance < 0 ? "text-rose-600" : "text-ink-800"}>{r.variance == null ? "—" : zar(r.variance * r.cost)}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-5 py-3 text-xs text-ink-500">{listed.length} lines</td>
                <td className="px-4 py-3 text-right"><Qty n={listed.reduce((s, r) => s + (r.variance ?? 0), 0)} /></td>
                <td className="tnum px-5 py-3 text-right text-sm font-semibold text-ink-950">{zar(listed.reduce((s, r) => s + (r.variance ?? 0) * r.cost, 0))}</td>
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>

      {review && (
        <div className="no-print mt-6 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <ButtonLink href={path} variant="ghost">← Back to counting</ButtonLink>
          <ConfirmAction
            action={approveTake.bind(null, store.code, id)}
            label={`Approve ${take.number}`}
            triggerVariant="primary"
            size="md"
            variant="primary"
            className="sm:max-w-md"
            title={`Post ${rows.filter((r) => r.variance).length} variances to stock?`}
            confirmLabel="Approve & post variances"
          >
            <p>
              Net {sum.netUnits >= 0 ? "+" : "−"}
              {Math.abs(sum.netUnits)} units, {zar(sum.netValue)} at cost. {sum.uncounted > 0 && `${sum.uncounted} uncounted lines stay as they are.`}
            </p>
          </ConfirmAction>
        </div>
      )}
    </>
  );
}
