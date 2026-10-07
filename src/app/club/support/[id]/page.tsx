import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Camera, CheckCircle2, ChevronLeft } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { MemberReply } from "@/components/support/member-reply";
import { Callout, Container, Panel, Tag, type TagTone } from "@/components/shop/ui";
import { SUPPORT_CATEGORY, SUPPORT_STATUS, canReopen, type SupportStatusKey } from "@/lib/support";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Your request" };

const TONE: Record<SupportStatusKey, TagTone> = { OPEN: "orange", WAITING_MEMBER: "green", RESOLVED: "neutral" };

export default async function ClubTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const customer = await getCustomer();
  if (!customer) redirect(`/club/join?next=/club/support/${id}`);
  const t = await db.supportTicket.findFirst({ where: { id, customerId: customer.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  const resolved = t.status === "RESOLVED";
  const reopenable = !resolved || canReopen(t.resolvedAt, new Date());

  return (
    <Container className="max-w-3xl pt-8">
      <Link href="/club/support" className="inline-flex items-center gap-1 text-sm font-medium text-ink-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Help &amp; returns
      </Link>
      {sp.sent && (
        <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title={`Thanks. Your request is ${t.number}.`} className="mt-4">
          We&apos;ll reply within one business day, here and by {t.email ? "email" : "SMS"}.
        </Callout>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white">{t.subject}</h1>
        <Tag tone={TONE[t.status]} className="px-3 py-1 text-xs">
          {SUPPORT_STATUS[t.status].member}
        </Tag>
      </div>
      <p className="mt-1 text-sm text-ink-400">
        {t.number} · {SUPPORT_CATEGORY[t.category].label}
        {t.orderCode ? (
          <>
            {" "}
            · order{" "}
            <Link href={`/orders/${t.orderCode}`} className="font-mono text-ink-200 underline">
              {t.orderCode}
            </Link>
          </>
        ) : null}{" "}
        · opened {fmtDateTime(t.createdAt)}
      </p>

      <ol className="mt-6 space-y-3" aria-label="Conversation">
        {t.messages.map((m) => {
          const staff = m.authorType === "STAFF";
          const system = m.authorType === "SYSTEM";
          return (
            <li key={m.id} className={cn("flex", staff ? "justify-start" : system ? "justify-center" : "justify-end")}>
              <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed", system ? "bg-ink-900/40 text-center text-ink-400" : staff ? "border border-ink-800 bg-ink-900/70 text-ink-100" : "bg-brand-500/15 text-brand-50")}>
                {!system && <div className={cn("mb-1 text-xs", staff ? "text-brand-300" : "text-brand-200/80")}>{staff ? `${m.authorName ?? "Our team"} · Herbal Holland` : "You"} · {fmtDateTime(m.createdAt)}</div>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                {system && <span className="mt-1 block text-xs">{fmtDateTime(m.createdAt)}</span>}
                {m.attachmentUploadId && (
                  <a href={`/media/${m.attachmentUploadId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white underline">
                    <Camera className="h-3.5 w-3.5" aria-hidden /> Your photo
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Panel className="mt-6 p-5">
        {reopenable ? (
          <MemberReply ticketId={t.id} resolved={resolved} />
        ) : (
          <p className="text-sm text-ink-300">
            This request closed more than 30 days ago.{" "}
            <Link href={`/support?category=${t.category}${t.orderCode ? `&order=${t.orderCode}` : ""}`} className="font-semibold text-brand-300 underline">
              Open a new one
            </Link>{" "}
            and quote {t.number}.
          </p>
        )}
      </Panel>
    </Container>
  );
}
