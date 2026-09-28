// The alert list used by the store's loss-prevention page and the HQ queue (server-rendered).
import Link from "next/link";
import { Store as StoreIcon } from "lucide-react";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { zar } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/format";
import { AlertStatusBadge, SeverityBadge } from "./badges";
import type { AlertSeverity, AlertStatus } from "@/generated/prisma/client";

export type AlertRow = {
  id: string;
  href: string;
  severity: AlertSeverity;
  title: string;
  ruleLabel: string;
  status: AlertStatus;
  amountCents: number | null;
  createdAt: Date;
  /** Who it's about (links to their profile); null when it's about the store as a whole. */
  person: { name: string; href: string } | null;
  store?: { code: string; name: string };
};

export function AlertTable({ rows, showStore = false }: { rows: AlertRow[]; showStore?: boolean }) {
  // The rule gets its own column on wide screens; otherwise it sits under the title so the row fits beside the sidebar.
  const ruleCol = "hidden 2xl:table-cell";
  const ruleLine = "text-xs text-ink-500 2xl:hidden";
  return (
    <Table>
      <thead>
        <tr>
          <Th>Severity</Th>
          <Th>Alert</Th>
          <Th className={ruleCol}>Rule</Th>
          {showStore && <Th>Store</Th>}
          <Th>Person</Th>
          <Th>Raised</Th>
          <Th align="right" className="whitespace-nowrap">At risk</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <Tr key={a.id}>
            <Td className="whitespace-nowrap">
              <SeverityBadge severity={a.severity} />
            </Td>
            <Td className="min-w-56">
              <Link href={a.href} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {a.title}
              </Link>
              <div className={ruleLine}>{a.ruleLabel}</div>
            </Td>
            <Td className={`${ruleCol} whitespace-nowrap text-ink-600`}>{a.ruleLabel}</Td>
            {showStore && (
              <Td className="whitespace-nowrap">
                {a.store ? (
                  <>
                    <span className="text-ink-800">{a.store.name}</span>
                    <span className="block font-mono text-xs text-ink-500">{a.store.code}</span>
                  </>
                ) : (
                  "—"
                )}
              </Td>
            )}
            <Td className="whitespace-nowrap">
              {a.person ? (
                <Link href={a.person.href} className="text-ink-800 hover:text-brand-700 hover:underline">
                  {a.person.name}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-ink-500" title="About the store, not one person">
                  <StoreIcon className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
                  Store
                </span>
              )}
            </Td>
            <Td className="whitespace-nowrap text-ink-700">
              {fmtDate(a.createdAt)}
              <span className="block text-xs text-ink-400">{fmtTime(a.createdAt)}</span>
            </Td>
            <Td align="right" className="whitespace-nowrap font-medium text-ink-900">
              {a.amountCents != null ? (
                zar(a.amountCents)
              ) : (
                <span className="text-ink-300">
                  —<span className="sr-only">no amount</span>
                </span>
              )}
            </Td>
            <Td className="whitespace-nowrap">
              <AlertStatusBadge status={a.status} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
