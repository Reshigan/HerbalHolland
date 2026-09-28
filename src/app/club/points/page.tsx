import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { LEDGER_LABEL, ledgerTitle, memberLedger } from "@/server/shop/club";
import { Container, Pager, Panel } from "@/components/shop/ui";
import { pageParam } from "@/components/ui/pagination";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata = { title: "Points" };
const PAGE = 20;

export default async function ClubPoints({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/points");
  const page = pageParam((await searchParams).page);
  const [{ rows, total }, settings] = await Promise.all([memberLedger(customer.id, page, PAGE), getSettings()]);

  return (
    <Container className="pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Points activity</h1>
          <p className="mt-1 text-sm text-ink-400">Everything you&apos;ve earned and spent, in store and online.</p>
          {rows.length ? (
            <Panel className="mt-6">
              <ul className="divide-y divide-ink-800">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-100">{ledgerTitle(e)}</div>
                      <div className="truncate text-xs text-ink-450">
                        {LEDGER_LABEL[e.kind] ?? e.kind} · {fmtDateTime(e.createdAt)}
                      </div>
                    </div>
                    <span className={cn("tnum shrink-0 font-semibold", e.points >= 0 ? "text-leaf-100" : "text-ink-300")}>
                      {e.points >= 0 ? "+" : "−"}
                      {fmtPoints(Math.abs(e.points))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-5">
                <Pager page={page} pageSize={PAGE} total={total} href={(p) => `/club/points?page=${p}`} noun="entries" />
              </div>
            </Panel>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
              <History className="mx-auto h-9 w-9 text-ink-600" />
              <p className="mt-3 text-sm text-ink-400">No points activity yet.</p>
            </div>
          )}
        </div>
        <aside className="space-y-4 lg:pt-16">
          <Panel className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Balance</div>
            <div className="tnum mt-1 font-display text-4xl font-semibold text-white">{fmtPoints(customer.points)}</div>
            <div className="text-sm text-ink-400">worth {zar(customer.points * 100)}</div>
          </Panel>
          <Panel className="p-5 text-sm leading-relaxed text-ink-400">
            <h2 className="font-semibold text-white">Good to know</h2>
            <ul className="mt-2 space-y-1.5">
              <li>• Earn on what you pay — not on points you spend.</li>
              <li>• Spend from {settings.loyalty.minRedeem} points, up to {settings.loyalty.maxRedeemPct}% of an order.</li>
              <li>• Medicines don&apos;t earn points or carry discounts.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
