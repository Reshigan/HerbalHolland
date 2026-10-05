// What's been paid against a monthly franchise statement, and what's still outstanding: under the statement in HQ and
// in the store's back office (never printed with it). HQ admins record and delete payments; the HQ page passes the
// form and the delete buttons in. Server-safe.
import { Banknote } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { statementOutstanding } from "@/lib/ledger-hq";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

type Payment = { id: string; amountCents: number; paidOn: Date; reference: string; note: string | null; createdBy: string | null };
type Perspective = "hq" | "store";

const POSITION: Record<Perspective, { pays: string; owes: string }> = { hq: { pays: "HQ pays", owes: "Owes HQ" }, store: { pays: "HQ pays you", owes: "Due to HQ" } };
const WHO: Record<Perspective, { toHq: string; fromHq: string }> = { hq: { toHq: "Store paid HQ", fromHq: "HQ paid store" }, store: { toHq: "You paid HQ", fromHq: "HQ paid you" } };

/** A net position in words, signed as the statement shows it (positive: HQ pays the store). */
function Position({ cents, perspective }: { cents: number; perspective: Perspective }) {
  if (!cents) return <span className="font-semibold text-ink-900">Settled</span>;
  return (
    <span className={cn("font-semibold", cents > 0 ? "text-leaf-700" : "text-ink-900")}>
      {cents > 0 ? POSITION[perspective].pays : POSITION[perspective].owes} <span className="tnum">{zar(Math.abs(cents))}</span>
    </span>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3 ring-1 ring-ink-100">
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</div>
      <div className="mt-1 text-[0.95rem]">{children}</div>
    </div>
  );
}

export function StatementPayments({
  perspective, netCents, paidCents, rows, total, page, pageSize, href, form, remove, current,
}: {
  perspective: Perspective;
  netCents: number;
  paidCents: number; // all payments against the statement, signed (positive: the store paid HQ)
  rows: Payment[];
  total: number;
  page: number;
  pageSize: number;
  href: (page: number) => string;
  form?: React.ReactNode;
  remove?: (p: Payment) => React.ReactNode;
  current?: boolean; // the month is still trading
}) {
  const outstanding = statementOutstanding(netCents, [{ amountCents: paidCents }]);
  const who = WHO[perspective];
  return (
    <Card className="no-print mx-auto mt-6 max-w-[210mm]">
      <CardHeader
        title="Payments"
        description={
          perspective === "hq"
            ? "Record each payment as it arrives: the store paying HQ, or HQ paying the store. Each one posts to both companies' books."
            : "Payments between your store and HQ against this statement, as HQ recorded them."
        }
      />
      <div className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-3">
        <Tile label={current ? "Statement to date" : "Statement"}>
          <Position cents={netCents} perspective={perspective} />
        </Tile>
        <Tile label="Paid">
          {paidCents ? (
            <span className="font-semibold text-ink-900">
              {paidCents > 0 ? who.toHq : who.fromHq} <span className="tnum">{zar(Math.abs(paidCents))}</span>
            </span>
          ) : (
            <span className="text-ink-500">Nothing yet</span>
          )}
        </Tile>
        <Tile label="Outstanding">
          <Position cents={outstanding} perspective={perspective} />
        </Tile>
      </div>
      {form && <div className="mx-5 mt-4 rounded-2xl border border-ink-150 p-4">{form}</div>}
      <Table className="mt-4" density="comfortable">
        <thead>
          <tr>
            <Th>Paid on</Th>
            <Th>Who paid</Th>
            <Th align="right">Amount</Th>
            <Th>Bank reference</Th>
            <Th className="hidden md:table-cell">Note</Th>
            <Th className="hidden lg:table-cell">Recorded by</Th>
            {remove && <Th align="right">Actions</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <TableEmpty cols={remove ? 7 : 6} icon={<Banknote className="h-5 w-5" />} title="No payments yet">
              {perspective === "hq" ? "Payments you record against this statement appear here." : "HQ records payments against your statement as they're made."}
            </TableEmpty>
          )}
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td className="whitespace-nowrap">{fmtDate(`${p.paidOn.toISOString().slice(0, 10)}T12:00:00Z`)}</Td>
              <Td>{p.amountCents > 0 ? who.toHq : who.fromHq}</Td>
              <Td align="right" className="font-medium text-ink-900">{zar(Math.abs(p.amountCents))}</Td>
              <Td className="font-mono text-xs">{p.reference}</Td>
              <Td className="hidden max-w-xs truncate text-ink-600 md:table-cell" title={p.note ?? undefined}>{p.note ?? "—"}</Td>
              <Td className="hidden text-ink-600 lg:table-cell">{p.createdBy ?? "—"}</Td>
              {remove && <Td align="right">{remove(p)}</Td>}
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageSize={pageSize} total={total} href={href} />
    </Card>
  );
}
