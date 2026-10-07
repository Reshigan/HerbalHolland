import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy, MessageSquare } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { memberTickets } from "@/server/support";
import { memberReturns } from "@/server/returns";
import { Container, Pager, Tag, type TagTone } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { SUPPORT_CATEGORY, SUPPORT_STATUS, type SupportStatusKey } from "@/lib/support";
import { RETURN_STATUS, type ReturnStatusKey } from "@/lib/returns";
import { fmtDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Help & returns" };

const TONE: Record<SupportStatusKey, TagTone> = { OPEN: "orange", WAITING_MEMBER: "green", RESOLVED: "neutral" };
const RETURN_TONE: Record<ReturnStatusKey, TagTone> = { REQUESTED: "orange", APPROVED: "green", COLLECTION_BOOKED: "violet", RECEIVED: "amber", REFUNDED: "green", DECLINED: "neutral" };
const PAGE = 10;

export default async function ClubSupport({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/support");
  const page = pageParam((await searchParams).page);
  const now = new Date();
  const [{ rows, total }, returns] = await Promise.all([memberTickets(customer.id, page, PAGE), memberReturns(customer.id, 1, 5)]);

  return (
    <Container className="pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Help &amp; returns</h1>
          <p className="mt-1 text-sm text-ink-400">Your requests to our team, and anything you&apos;re sending back. We reply within one business day.</p>
        </div>
        <ButtonLink href="/support" size="md" className="self-start sm:self-auto">
          <LifeBuoy className="h-4 w-4" aria-hidden /> Ask for help
        </ButtonLink>
      </div>

      {rows.length ? (
        <>
          <ul className="mt-6 space-y-3">
            {rows.map((t) => (
              <li key={t.id}>
                <Link href={`/club/support/${t.id}`} className="flex flex-col gap-2 rounded-2xl border border-ink-800 bg-ink-900/60 p-4 transition hover:border-ink-600 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{t.subject}</span>
                      <Tag tone={TONE[t.status]}>{SUPPORT_STATUS[t.status].member}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-ink-450">
                      {t.number} · {SUPPORT_CATEGORY[t.category].label}
                      {t.orderCode ? ` · order ${t.orderCode}` : ""} · {t._count.messages} message{t._count.messages === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-xs text-ink-400 sm:text-right">
                    <span className="block">Opened {fmtDate(t.createdAt)}</span>
                    <span className="block">Updated {timeAgo(t.updatedAt, now)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={page} pageSize={PAGE} total={total} href={(p) => `/club/support?page=${p}`} noun="requests" />
        </>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-14 text-center">
          <MessageSquare className="mx-auto h-9 w-9 text-ink-600" />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">No requests yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">Something about an order, a product or your points? Ask us and follow the reply here.</p>
          <ButtonLink href="/support" className="mt-6">
            Ask for help
          </ButtonLink>
        </div>
      )}

      {returns.rows.length > 0 && (
        <section className="mt-10" aria-labelledby="returns-h">
          <h2 id="returns-h" className="font-display text-xl font-semibold text-white">
            Returns
          </h2>
          <ul className="mt-3 space-y-2">
            {returns.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/club/orders/${r.orderCode}/return`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-sm transition hover:border-ink-600">
                  <span>
                    <span className="font-semibold text-white">{r.number}</span> <span className="text-ink-400">· order {r.orderCode}</span>
                  </span>
                  <Tag tone={RETURN_TONE[r.status]}>{RETURN_STATUS[r.status].member}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
