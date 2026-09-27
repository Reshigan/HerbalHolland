import Link from "next/link";
import { Mail, MessageCircle, MessageSquare, Smartphone, Users } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { segmentWhere } from "@/server/marketing";
import { CONSENT_WORDING } from "@/server/customers";
import { SEGMENT_TONE, hrefWith, sp1 } from "@/server/store/rules";
import { SEGMENTS, segmentOf, type SegmentKey } from "@/lib/rfm";
import { fmtPoints } from "@/lib/loyalty-rules";
import { displayPhone } from "@/lib/sa";
import { zar, zarCompact } from "@/lib/money";
import { timeAgo } from "@/lib/format";
import { addMember } from "./actions";
import { AddMember } from "./add-member";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/ui/status";
import { Avatar } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, SearchForm } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import type { Prisma, Tier } from "@/generated/prisma/client";

export const metadata = { title: "Members" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;

const SORTS: Record<string, Prisma.CustomerOrderByWithRelationInput[]> = {
  recent: [{ lastPurchaseAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  spend: [{ lifetimeCents: "desc" }],
  points: [{ points: "desc" }],
  joined: [{ createdAt: "desc" }],
  name: [{ firstName: "asc" }, { lastName: "asc" }],
};
const TIERS: Tier[] = ["SEED", "SPROUT", "BLOOM", "HARVEST"];

export default async function MembersPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/customers`;
  const q = sp1(sp.q).trim();
  const seg = (Object.keys(SEGMENTS) as string[]).includes(sp1(sp.seg)) ? sp1(sp.seg) : "ALL";
  const tier = (TIERS as string[]).includes(sp1(sp.tier)) ? (sp1(sp.tier) as Tier) : null;
  const sort = sp1(sp.sort) in SORTS ? sp1(sp.sort) : "recent";
  const page = pageParam(sp.page);

  const words = q.split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const search: Prisma.CustomerWhereInput = words.length
    ? {
        AND: words.map((w) => ({
          OR: [
            { firstName: { contains: w, mode: "insensitive" as const } },
            { lastName: { contains: w, mode: "insensitive" as const } },
            { memberNo: { contains: w, mode: "insensitive" as const } },
            { email: { contains: w, mode: "insensitive" as const } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }] : []),
          ],
        })),
      }
    : {};
  const base: Prisma.CustomerWhereInput = { AND: [{ homeStoreId: store.id }, search, tier ? { tier } : {}] };
  const where: Prisma.CustomerWhereInput = { AND: [base, segmentWhere(seg)] };

  const segKeys = ["ALL", "CHAMPION", "LOYAL", "PROMISING", "NEW", "AT_RISK", "LAPSED", "PROSPECT"];
  const [segCounts, total, members, agg, active30] = await Promise.all([
    Promise.all(segKeys.map(async (k) => [k, await db.customer.count({ where: { AND: [base, segmentWhere(k)] } })] as const)),
    db.customer.count({ where }),
    db.customer.findMany({ where, orderBy: SORTS[sort], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.customer.aggregate({ where: { homeStoreId: store.id }, _count: true, _sum: { points: true }, _avg: { lifetimeCents: true } }),
    db.customer.count({ where: { homeStoreId: store.id, lastPurchaseAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const count = Object.fromEntries(segCounts);
  const keep = { seg: seg === "ALL" ? undefined : seg, sort: sort === "recent" ? undefined : sort };

  return (
    <>
      <PageHeader
        overline={`Customers · ${store.name}`}
        title="Members"
        description={`Herbal Holland Rewards members who call ${store.name} home. Segments update with every purchase.`}
        actions={canManage && <AddMember action={addMember.bind(null, store.code)} wording={CONSENT_WORDING} storeName={store.name} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={agg._count.toLocaleString()} sub="home store here" />
        <Stat label="Active in 30 days" value={active30.toLocaleString()} sub={agg._count ? `${Math.round((active30 / agg._count) * 100)}% of members` : "—"} />
        <Stat label="Points outstanding" value={fmtPoints(agg._sum.points ?? 0)} sub={`${zarCompact((agg._sum.points ?? 0) * 100)} liability, network-funded`} />
        <Stat label="Average lifetime spend" value={zar(Math.round(agg._avg.lifetimeCents ?? 0))} sub="per member" />
      </div>

      <Card className="mt-6">
        <div className="space-y-3 border-b border-ink-100 p-4 sm:p-5">
          <SearchForm path={path} q={q} keep={keep} placeholder="Name, mobile, email or member number">
            <label className="sr-only" htmlFor="m-tier">Tier</label>
            <AutoSelect id="m-tier" name="tier" defaultValue={tier ?? ""} wrapperClassName="w-36">
              <option value="">All tiers</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </AutoSelect>
            <label className="sr-only" htmlFor="m-sort">Sort</label>
            <AutoSelect id="m-sort" name="sort" defaultValue={sort} wrapperClassName="w-44">
              <option value="recent">Last visit</option>
              <option value="spend">Lifetime spend</option>
              <option value="points">Points balance</option>
              <option value="joined">Newest members</option>
              <option value="name">Name</option>
            </AutoSelect>
          </SearchForm>
          <Chips
            label="Segment"
            current={seg}
            items={segKeys.map((k) => ({
              key: k,
              label: k === "ALL" ? "All" : SEGMENTS[k as SegmentKey].name,
              count: count[k],
              tone: k === "ALL" ? undefined : SEGMENT_TONE[k as SegmentKey],
              href: hrefWith(path, sp, { seg: k === "ALL" ? null : k, page: null }),
            }))}
          />
          {seg !== "ALL" && (
            <p className="text-xs text-ink-500">
              <b className="text-ink-700">{SEGMENTS[seg as SegmentKey].blurb}.</b> Play: {SEGMENTS[seg as SegmentKey].play}.{" "}
              <Link href={hrefWith(`/store/${store.code}/marketing`, {}, { tab: "campaigns", segment: seg })} className="font-semibold text-oranje-700 hover:underline">
                Message this segment →
              </Link>
            </p>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No members match">
            Try another search or segment.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Mobile</Th>
                <Th>Tier · segment</Th>
                <Th align="right">Points</Th>
                <Th align="right">Visits</Th>
                <Th>Last visit</Th>
                <Th align="right">Lifetime spend</Th>
                <Th>Consent</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((c) => {
                const s = segmentOf(c);
                return (
                  <Tr key={c.id}>
                    <Td className="min-w-52">
                      <Link href={`${path}/${c.id}`} className="group flex items-center gap-3">
                        <Avatar name={`${c.firstName} ${c.lastName ?? ""}`} />
                        <span>
                          <span className="block font-medium text-ink-900 group-hover:text-oranje-700">
                            {c.firstName} {c.lastName ?? ""}
                          </span>
                          <span className="font-mono text-xs text-ink-400">{c.memberNo}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{displayPhone(c.phone)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <TierBadge tier={c.tier} />
                        <Badge tone={SEGMENT_TONE[s]}>{SEGMENTS[s].name}</Badge>
                      </div>
                    </Td>
                    <Td align="right">{c.points.toLocaleString()}</Td>
                    <Td align="right">{c.visits.toLocaleString()}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{c.lastPurchaseAt ? timeAgo(c.lastPurchaseAt) : <span className="text-ink-300">Never</span>}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(c.lifetimeCents)}</Td>
                    <Td>
                      <span className="flex gap-1.5 text-ink-300" aria-label="Marketing consent">
                        <MessageSquare className={`h-4 w-4 ${c.consentSms ? "text-leaf-600" : ""}`} aria-label={`SMS ${c.consentSms ? "yes" : "no"}`} />
                        <MessageCircle className={`h-4 w-4 ${c.consentWhatsapp ? "text-leaf-600" : ""}`} aria-label={`WhatsApp ${c.consentWhatsapp ? "yes" : "no"}`} />
                        <Mail className={`h-4 w-4 ${c.consentEmail ? "text-leaf-600" : ""}`} aria-label={`Email ${c.consentEmail ? "yes" : "no"}`} />
                        <Smartphone className={`h-4 w-4 ${c.consentPush ? "text-leaf-600" : ""}`} aria-label={`Push ${c.consentPush ? "yes" : "no"}`} />
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
