import { redirect } from "next/navigation";
import { FileText, Mail, Receipt } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { memberInvoices } from "@/server/shop/club";
import { Container, Pager, Panel, Tag } from "@/components/shop/ui";
import { fmtDate } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";

export const metadata = { title: "Invoices" };
const PAGE = 12;
const rel = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

export default async function ClubInvoices({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/invoices");
  const page = pageOf((await searchParams).page);
  const { rows, total } = await memberInvoices(customer.id, page, PAGE);

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Invoices &amp; receipts</h1>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-400">
        Every purchase in store and online, with a printable tax invoice from the store that sold it.
        {customer.email ? (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> Emailed to {customer.email}
          </span>
        ) : (
          <span>Add an email address in Settings to receive them automatically.</span>
        )}
      </p>
      {rows.length ? (
        <Panel className="mt-6">
          <ul className="divide-y divide-ink-800">
            {rows.map((s) => (
              <li key={s.id}>
                <a href={rel(s.url)} className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink-850/60">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-850 text-brand-400">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">
                        {s.title} {s.number}
                      </span>
                      {s.kind === "REFUND" && <Tag tone="amber">Refund</Tag>}
                      {s.channel === "ONLINE" && <Tag>Online</Tag>}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {fmtDate(s.createdAt)} · {s.store.name} · {s._count.lines} item{s._count.lines === 1 ? "" : "s"}
                      {s.pointsEarned > 0 && ` · earned ${fmtPoints(s.pointsEarned)}`}
                    </div>
                  </div>
                  <span className="tnum shrink-0 font-semibold text-white">{zar(s.totalCents)}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="px-5">
            <Pager page={page} pageSize={PAGE} total={total} href={(p) => `/club/invoices?page=${p}`} noun="invoices" />
          </div>
        </Panel>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Receipt className="mx-auto h-9 w-9 text-ink-600" />
          <p className="mt-3 text-sm text-ink-400">No purchases yet. Scan your card at the till and your invoices will appear here.</p>
        </div>
      )}
    </Container>
  );
}

function pageOf(v?: string) {
  return Math.max(1, Math.min(10_000, Number(v) || 1));
}
