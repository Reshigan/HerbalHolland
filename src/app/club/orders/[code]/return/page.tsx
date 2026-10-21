import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, FileText, Undo2 } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { returnableOrder } from "@/server/returns";
import { ReturnForm } from "@/components/shop/return-form";
import { ProductArt } from "@/components/product/art";
import { Callout, Container, Panel, Tag, type TagTone } from "@/components/shop/ui";
import { RETURN_REASON, RETURN_REASONS, RETURN_STATUS, RETURN_WINDOWS, type ReturnItem, type ReturnStatusKey } from "@/lib/returns";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Return or report a problem" };

const TONE: Record<ReturnStatusKey, TagTone> = { REQUESTED: "orange", APPROVED: "green", COLLECTION_BOOKED: "violet", RECEIVED: "amber", REFUNDED: "green", DECLINED: "neutral" };
const STEPS: ReturnStatusKey[] = ["REQUESTED", "APPROVED", "COLLECTION_BOOKED", "RECEIVED", "REFUNDED"];

export default async function ReturnPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const customer = await getCustomer();
  if (!customer) redirect(`/club/join?next=/club/orders/${code}/return`);
  const r = await returnableOrder(code, customer.id);
  if (!r) notFound();
  const { order, eligibility, existing } = r;
  const canRequest = RETURN_REASONS.some((k) => eligibility[k].ok);
  const lineOf = (variantId: string) => order.lines.find((l) => l.variantId === variantId);

  return (
    <Container className="max-w-3xl pt-8">
      <Link href={`/orders/${order.code}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Order {order.code}
      </Link>
      {sp.done && (
        <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title={`Thanks. Your return request is ${sp.done}.`} className="mt-4">
          We&apos;ll look at it and reply within one business day, then book a courier to collect it. You&apos;ll hear from us at each step.
        </Callout>
      )}
      <div className="mt-4">
        <div className="eyebrow text-brand-500">Order {order.code}</div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Return or report a problem</h1>
        <p className="mt-2 text-sm text-ink-400">
          {order.completedAt ? `Delivered ${fmtDate(order.completedAt)}. ` : ""}Faulty, damaged or wrong items within {RETURN_WINDOWS.defectMonths} months; a change of mind within {RETURN_WINDOWS.coolingOffDays} days.{" "}
          <Link href="/legal/returns" className="inline-flex items-center gap-1 font-semibold text-brand-300 underline">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Returns policy
          </Link>
        </p>
      </div>

      {existing.length > 0 && (
        <section className="mt-8 space-y-3" aria-labelledby="existing-h">
          <h2 id="existing-h" className="font-display text-lg font-semibold text-white">
            Your return requests on this order
          </h2>
          {existing.map((x) => {
            const items = (x.items as ReturnItem[]) ?? [];
            const at = STEPS.indexOf(x.status);
            return (
              <Panel key={x.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-white">{x.number}</span>
                    <span className="ml-2 text-xs text-ink-400">
                      {RETURN_REASON[x.reason].label} · requested {fmtDateTime(x.createdAt)}
                    </span>
                  </div>
                  <Tag tone={TONE[x.status]}>{RETURN_STATUS[x.status].member}</Tag>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {items.map((it) => {
                    const l = lineOf(it.variantId);
                    return (
                      <li key={it.variantId} className="flex items-center gap-2 rounded-xl bg-ink-950/60 py-1 pl-1 pr-3 text-sm text-ink-200">
                        {l && <ProductArt slug={l.variant.product.slug} strain={l.variant.product.strain} regClass={l.variant.product.regClass} label={l.variant.product.name} className="h-8 w-8 rounded-lg" />}
                        {it.qty} × {l ? `${l.variant.product.name} · ${l.variant.name}` : "item"}
                      </li>
                    );
                  })}
                </ul>
                {x.status !== "DECLINED" && (
                  <ol className="mt-4 grid grid-cols-5 gap-1 text-[0.68rem] font-semibold uppercase tracking-wider">
                    {STEPS.map((s, i) => (
                      <li key={s} className={i <= at ? "text-brand-300" : "text-ink-600"}>
                        <span className={`mb-1 block h-1 rounded-full ${i <= at ? "bg-brand-500" : "bg-ink-800"}`} aria-hidden />
                        {RETURN_STATUS[s].label}
                      </li>
                    ))}
                  </ol>
                )}
                {x.status === "COLLECTION_BOOKED" && x.courier && (
                  <p className="mt-3 text-sm text-ink-300">
                    {x.courier} is collecting{x.waybill ? ` · waybill ${x.waybill}` : ""}. Have it packed and ready.
                  </p>
                )}
                {x.status === "REFUNDED" && x.refundCents != null && <p className="mt-3 text-sm text-leaf-100">Refunded {zar(x.refundCents)} to the way you paid.</p>}
                {x.status === "DECLINED" && x.decisionNote && <p className="mt-3 text-sm text-ink-300">{x.decisionNote}</p>}
                {asList(x.photoUploadIds).length > 0 && (
                  <ul className="mt-3 flex gap-2">
                    {asList(x.photoUploadIds).map((id) => (
                      <li key={id}>
                        <a href={`/media/${id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/media/${id}`} alt="Your photo" className="h-16 w-16 rounded-lg object-cover ring-1 ring-ink-700" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </section>
      )}

      <Panel className="mt-8 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
          <Undo2 className="h-5 w-5 text-brand-500" aria-hidden /> {existing.length ? "Another item to send back?" : "What would you like to return?"}
        </h2>
        <p className="mb-5 mt-1 text-sm text-ink-400">Choose the reason first: it decides what can come back and for how long. We collect faulty, damaged or wrong items at our cost.</p>
        {canRequest ? (
          <ReturnForm orderCode={order.code} eligibility={eligibility} />
        ) : (
          <Callout tone="info">
            {eligibility.DEFECTIVE.reason ?? "Nothing on this order can be returned right now."}{" "}
            <Link href={`/support?order=${order.code}`} className="font-semibold text-white underline">
              Ask us for help
            </Link>
            .
          </Callout>
        )}
      </Panel>
    </Container>
  );
}
