import Link from "next/link";
import { Bell, Mail, MessageSquare, Smartphone, X } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { qs, parseDay } from "@/server/hq/form";
import { normalisePhone } from "@/lib/sa";
import { maskRecipient } from "@/lib/admin-ui";
import { addDays, dayKey, fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { CHANNEL_LABEL } from "@/components/hq/tones";
import { SavedViews } from "@/components/admin/saved-views";
import { MessagePanel } from "./panel";
import type { MsgChannel, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Messages" };

type SP = { q?: string; channel?: string; status?: string; kind?: string; campaign?: string; from?: string; to?: string; sort?: string; dir?: string; page?: string; msg?: string };

const CHANNELS: MsgChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP"];
const STATUSES = ["SENT", "FAILED", "SUPPRESSED"] as const;
const KINDS = ["TRANSACTIONAL", "MARKETING"] as const;
const STATUS_TONE: Record<string, Tone> = { SENT: "green", FAILED: "red", SUPPRESSED: "neutral" };
const CHANNEL_ICON: Record<MsgChannel, React.ReactNode> = {
  SMS: <Smartphone className="h-3.5 w-3.5" aria-hidden />,
  EMAIL: <Mail className="h-3.5 w-3.5" aria-hidden />,
  PUSH: <Bell className="h-3.5 w-3.5" aria-hidden />,
  WHATSAPP: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
};
const SORTS = ["at", "channel", "status"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.MessageLogOrderByWithRelationInput[]> = {
  at: (d) => [{ createdAt: d }],
  channel: (d) => [{ channel: d }, { createdAt: "desc" }],
  status: (d) => [{ status: d }, { createdAt: "desc" }],
};

/** One line of the body for the list: the subject line of an email, the text of a message. */
const preview = (body: string) => body.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 90) ?? "";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const page = pageParam(sp.page);
  const pageSize = 50;
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "at", "desc");
  const now = new Date();
  // Always bounded by date: the last 30 days unless asked otherwise (the log grows with every message the platform sends).
  const from = parseDay(sp.from) ?? addDays(new Date(`${dayKey(now)}T00:00:00+02:00`), -29);
  const to = parseDay(sp.to);
  const q = sp.q?.trim() ?? "";
  const phone = q ? normalisePhone(q) : null;
  const where: Prisma.MessageLogWhereInput = {
    AND: [
      scope.kind === "HQ" ? {} : { customer: { homeStoreId: { in: ids } } },
      { createdAt: { gte: from } },
      to ? { createdAt: { lt: addDays(to, 1) } } : {},
      CHANNELS.includes(sp.channel as MsgChannel) ? { channel: sp.channel as MsgChannel } : {},
      (STATUSES as readonly string[]).includes(sp.status ?? "") ? { status: sp.status } : {},
      (KINDS as readonly string[]).includes(sp.kind ?? "") ? { kind: sp.kind } : {},
      sp.campaign ? { campaignId: sp.campaign } : {},
      q ? (phone ? { to: phone } : q.includes("@") ? { to: { startsWith: q.toLowerCase() } } : { OR: [{ to: { contains: q, mode: "insensitive" } }, { customer: { memberNo: q.toUpperCase() } }] }) : {},
    ],
  };
  const [total, rows, byStatus, campaigns, opened] = await Promise.all([
    db.messageLog.count({ where }),
    db.messageLog.findMany({
      where,
      orderBy: ORDER_BY[sort](dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, to: true, channel: true, kind: true, status: true, reason: true, body: true, createdAt: true, customerId: true, campaignId: true, customer: { select: { firstName: true, lastName: true, memberNo: true } }, campaign: { select: { name: true } } },
    }),
    db.messageLog.groupBy({ by: ["status"], where, _count: true }),
    db.campaign.findMany({ where: { status: { in: ["SENT", "SCHEDULED"] } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, name: true } }),
    sp.msg
      ? db.messageLog.findFirst({
          where: { AND: [{ id: sp.msg }, scope.kind === "HQ" ? {} : { customer: { homeStoreId: { in: ids } } }] },
          include: { customer: { select: { id: true, firstName: true, lastName: true, memberNo: true } }, campaign: { select: { id: true, name: true } } },
        })
      : null,
  ]);
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => `/hq/messages${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined, msg: undefined });
  const campaignName = sp.campaign ? campaigns.find((c) => c.id === sp.campaign)?.name : null;

  return (
    <>
      <PageHeader
        overline="Members"
        title="Messages"
        description={`Every SMS, email, push and WhatsApp message the platform sent or logged${scope.kind === "HQ" ? "" : " to members homed in your region"}: order updates, sign-in codes, invoices, statements, campaigns and staff notifications. Recipients are masked; open a message to read what was sent.`}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Matching" value={num(total)} sub={`${dayKey(from)} to ${to ? dayKey(to) : "today"}`} />
        <Stat label="Sent" value={num(n("SENT"))} sub="delivered, or logged where no provider is set" />
        <Stat label="Failed" value={num(n("FAILED"))} sub={n("FAILED") ? <Link href={href({ status: "FAILED", page: undefined })} className="font-semibold text-rose-600 hover:underline">show failures →</Link> : "nothing failed"} />
        <Stat label="Suppressed" value={num(n("SUPPRESSED"))} sub="no consent, do-not-contact or outside the send window" />
      </div>
      {campaignName && (
        <Notice tone="info" className="mb-4">
          Showing messages for the campaign <b>{campaignName}</b>. <Link href={href({ campaign: undefined, page: undefined })} className="font-semibold underline">All messages</Link>
        </Notice>
      )}
      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/messages" keep={{ sort: sp.sort, dir: sp.dir, campaign: sp.campaign }}>
            <SearchField defaultValue={sp.q} placeholder="Recipient (mobile or email) or member no." label="Recipient" />
            <FilterSelect name="channel" label="Channel" defaultValue={sp.channel} options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
            <FilterSelect name="kind" label="Kind" defaultValue={sp.kind} options={KINDS.map((k) => ({ value: k, label: k.charAt(0) + k.slice(1).toLowerCase() }))} />
            {campaigns.length > 0 && <FilterSelect name="campaign" label="Campaign" defaultValue={sp.campaign} options={campaigns.map((c) => ({ value: c.id, label: c.name }))} />}
            <label className="block">
              <span className="sr-only">From date</span>
              <input type="date" name="from" defaultValue={sp.from ?? dayKey(from)} aria-label="From date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
            <label className="block">
              <span className="sr-only">To date</span>
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
          </FilterForm>
          <SavedViews pageKey="hq-messages" userKey={user.id} />
        </div>
        <Table className="relative" stickyFirst minWidth="64rem">
          <thead>
            <tr>
              <SortableTh label="When" sortKey="at" sort={sort} dir={dir} href={sortHref} title="Newest first" />
              <SortableTh label="Channel" sortKey="channel" sort={sort} dir={dir} href={sortHref} />
              <Th>To</Th>
              <Th>Member</Th>
              <Th>Message</Th>
              <Th>Campaign</Th>
              <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty cols={7} icon={<MessageSquare className="h-5 w-5" aria-hidden />} title="No messages match">
                Widen the dates, or search by the full mobile number or email address.
              </TableEmpty>
            )}
            {rows.map((m) => {
              const open = href({ msg: m.id });
              return (
                <Tr key={m.id} href={open} className={sp.msg === m.id ? "bg-brand-50/60" : undefined}>
                  <Td className="whitespace-nowrap text-xs text-ink-600">
                    <Link href={open} className="text-ink-800 hover:text-brand-700" aria-label={`Open message sent ${fmtDateTime(m.createdAt)}`}>
                      {fmtDateTime(m.createdAt)}
                    </Link>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-ink-700">
                      {CHANNEL_ICON[m.channel]}
                      {CHANNEL_LABEL[m.channel]}
                    </span>
                    <span className="block text-[0.68rem] uppercase tracking-wide text-ink-500">{m.kind.toLowerCase()}</span>
                  </Td>
                  <Td className="font-mono text-xs text-ink-700">{maskRecipient(m.to)}</Td>
                  <Td className="whitespace-nowrap">
                    {m.customer ? (
                      <Link href={`/hq/customers/${m.customerId}`} className="text-ink-900 hover:text-brand-700">
                        {m.customer.firstName} {m.customer.lastName ?? ""}
                        <span className="block font-mono text-xs text-ink-500">{m.customer.memberNo}</span>
                      </Link>
                    ) : (
                      <span className="text-ink-500">—</span>
                    )}
                  </Td>
                  <Td className="max-w-md">
                    <span className="block truncate text-ink-700">{preview(m.body)}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{m.campaign ? <Link href={`/hq/marketing/${m.campaignId}`} className="text-ink-800 hover:text-brand-700">{m.campaign.name}</Link> : <span className="text-ink-500">—</span>}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[m.status] ?? "neutral"} dot>{m.status.charAt(0) + m.status.slice(1).toLowerCase()}</Badge>
                    {m.reason && <span className="mt-0.5 block max-w-48 truncate text-xs text-ink-500" title={m.reason}>{m.reason}</span>}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p, msg: undefined })} />
      </Card>

      {sp.msg && (
        <MessagePanel closeHref={href({ msg: undefined })} title={opened ? `${CHANNEL_LABEL[opened.channel]} · ${fmtDateTime(opened.createdAt)}` : "Message"}>
          {!opened ? (
            <p className="text-sm text-ink-600">That message isn&apos;t in the log any more, or sits outside the stores you look after.</p>
          ) : (
            <>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-ink-500">To</dt>
                <dd className="font-mono text-xs text-ink-800">{maskRecipient(opened.to)}</dd>
                <dt className="text-ink-500">Member</dt>
                <dd>
                  {opened.customer ? (
                    <Link href={`/hq/customers/${opened.customer.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {opened.customer.firstName} {opened.customer.lastName ?? ""} <span className="font-mono text-xs text-ink-500">{opened.customer.memberNo}</span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-ink-500">Kind</dt>
                <dd className="text-ink-800">{opened.kind.charAt(0) + opened.kind.slice(1).toLowerCase()}</dd>
                <dt className="text-ink-500">Status</dt>
                <dd>
                  <Badge tone={STATUS_TONE[opened.status] ?? "neutral"} dot>{opened.status.charAt(0) + opened.status.slice(1).toLowerCase()}</Badge>
                  {opened.reason && <span className="ml-2 text-xs text-ink-600">{opened.reason}</span>}
                </dd>
                {opened.campaign && (
                  <>
                    <dt className="text-ink-500">Campaign</dt>
                    <dd>
                      <Link href={`/hq/marketing/${opened.campaign.id}`} className="font-medium text-ink-900 hover:text-brand-700">{opened.campaign.name}</Link>
                    </dd>
                  </>
                )}
                <dt className="text-ink-500">Log id</dt>
                <dd className="font-mono text-xs text-ink-600">{opened.id}</dd>
              </dl>
              <h3 className="mt-5 text-[0.78rem] font-semibold text-ink-700">Body as sent</h3>
              <pre className="mt-1.5 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-ink-50 p-4 font-sans text-sm leading-relaxed text-ink-850">{opened.body}</pre>
              <p className="mt-3 text-xs text-ink-500">
                <X className="mr-1 inline h-3 w-3" aria-hidden />
                Sign-in codes are logged masked; emails are logged as their plain-text twin.
              </p>
            </>
          )}
        </MessagePanel>
      )}
    </>
  );
}
