import Link from "next/link";
import { BadgeCheck, Eye, EyeOff, Star } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { can } from "@/server/hq/guard";
import { listReviews, reviewCounts, reviewView, reviewWhere, type ReviewView } from "@/server/reviews";
import { qs } from "@/server/hq/form";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/form";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionButton, ConfirmAction, FieldError } from "@/components/ui/action-form";
import { Chips, SearchForm } from "@/components/store/ui";
import { EmptyState } from "@/components/ui/page";
import { ViewOnly } from "@/components/hq/ui";
import { ProductArt } from "@/components/product/art";
import { fmtDateTime, num } from "@/lib/format";
import { hideReview, showReview } from "./actions";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Reviews" };

const PAGE_SIZE = 20;
const VIEW_LABEL: Record<ReviewView, string> = { all: "All", photos: "With photos", low: "1–2 stars", hidden: "Hidden" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const canModerate = can(user, "network");
  const view = reviewView(sp.view);
  const q = (sp.q ?? "").trim();
  const page = pageParam(sp.page);
  const [{ rows, total }, counts] = await Promise.all([listReviews(reviewWhere({ view, q }), page, PAGE_SIZE), reviewCounts()]);
  const href = (p: Record<string, string | number | undefined>) => `/hq/reviews${qs({ view: sp.view, q: q || undefined, ...p })}`;

  return (
    <>
      <PageHeader overline="Members" title="Reviews" description="Every product review is from a verified purchase and screened for claims before it's posted. Hide anything that still shouldn't be public (abuse, personal details, a claim the screen missed). Hidden reviews don't show or count." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reviews" value={num(counts.all)} sub="verified purchases only" />
        <Stat label="With photos" value={num(counts.photos)} sub="shown in the product's gallery" />
        <Stat label="1–2 stars" value={num(counts.low)} sub="worth a read" />
        <Stat label="Hidden" value={num(counts.hidden)} sub="not shown, not counted" />
      </div>
      {!canModerate && <ViewOnly className="mb-4">View only: the HQ team hides and shows reviews.</ViewOnly>}
      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <SearchForm path="/hq/reviews" q={q} keep={{ view: sp.view }} placeholder="Product, headline or text" />
          <Chips label="View" current={view} items={(Object.keys(VIEW_LABEL) as ReviewView[]).map((v) => ({ key: v, label: VIEW_LABEL[v], count: counts[v], href: href({ view: v === "all" ? undefined : v, page: undefined }) }))} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Star className="h-5 w-5" />} title="No reviews here">
            {q ? "Nothing matches that search." : "Reviews appear as members post them."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5">
                <ProductArt slug={r.product.slug} strain={r.product.strain} regClass={r.product.regClass} label={r.product.name} className="h-14 w-14 rounded-xl" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/p/${r.product.slug}#reviews`} className="font-semibold text-ink-900 hover:text-brand-700">
                      {r.product.name}
                    </Link>
                    <span className="inline-flex items-center gap-0.5 text-brand-700" aria-label={`${r.rating} out of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-brand-500 text-brand-500" : "text-ink-500"}`} strokeWidth={1.6} aria-hidden />
                      ))}
                    </span>
                    {r.verified && (
                      <Badge tone="green">
                        <BadgeCheck className="h-3 w-3" aria-hidden /> Verified purchase
                      </Badge>
                    )}
                    {r.hidden && <Badge tone="red">Hidden</Badge>}
                  </div>
                  {r.title && <p className="mt-1 font-medium text-ink-850">{r.title}</p>}
                  {r.body && <p className="mt-0.5 text-sm text-ink-700">{r.body}</p>}
                  {asList(r.photoUploadIds).length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {asList(r.photoUploadIds).map((id) => (
                        <li key={id}>
                          <a href={`/media/${id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-ink-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/media/${id}`} alt="" loading="lazy" className="h-16 w-16 object-cover" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-ink-500">
                    <Link href={`/hq/customers/${r.customer.id}`} className="hover:text-brand-700">
                      {r.customer.firstName} {r.customer.lastName ?? ""}
                    </Link>{" "}
                    · {r.customer.memberNo} · {fmtDateTime(r.createdAt)}
                    {r.hidden && r.hiddenReason ? ` · hidden by ${r.moderator ?? "HQ"}: ${r.hiddenReason}` : ""}
                  </p>
                </div>
                {canModerate && (
                  <div className="sm:w-56">
                    {r.hidden ? (
                      <ActionButton action={showReview.bind(null, r.id)} pendingLabel="Showing…">
                        <Eye className="h-4 w-4" aria-hidden /> Show again
                      </ActionButton>
                    ) : (
                      <ConfirmAction action={hideReview.bind(null, r.id)} label="Hide" title="Hide this review?" confirmLabel="Hide review" icon={<EyeOff className="h-4 w-4" aria-hidden />}>
                        <p>It stops showing on the product page and no longer counts in the rating. The member isn&apos;t told.</p>
                        <Field label="Why (the team sees this)" htmlFor={`hide-${r.id}`}>
                          <Textarea id={`hide-${r.id}`} name="reason" className="min-h-14" maxLength={300} placeholder="e.g. Names a medical condition" />
                          <FieldError name="reason" />
                        </Field>
                      </ConfirmAction>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
