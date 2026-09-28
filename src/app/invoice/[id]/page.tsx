// Hosted tax invoice (SARS): opened from the invoice email or Rewards, protected by a
// signed token. Abridged tax invoice up to R5,000, full tax invoice above; non-VAT
// vendors issue a plain invoice; refunds are credit notes.
import Link from "next/link";
import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { invoiceData, invoiceTitle, invoiceToken, invoiceUrl } from "@/server/invoices";
import { FULL_TAX_INVOICE_OVER_CENTS } from "@/server/sales";
import { Mark, Wordmark } from "@/components/brand/logo";
import { QrCode } from "@/components/shop/qr";
import { PrintButton } from "@/components/shop/print-button";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { displayPhone } from "@/lib/sa";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

const valid = (id: string, t?: string) => {
  if (!t) return false;
  const a = Buffer.from(t);
  const b = Buffer.from(invoiceToken(id));
  return a.length === b.length && timingSafeEqual(a, b);
};

const PAY: Record<string, string> = { CARD: "Card", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Rewards points", ONLINE: "Paid online" };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (!valid(id, t)) return { title: "Invoice", robots: { index: false, follow: false } };
  const s = await invoiceData(id);
  return { title: s ? `${invoiceTitle(s)} ${s.number}` : "Invoice", robots: { index: false, follow: false } };
}

export default async function InvoicePage({ params, searchParams }: Props) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (!valid(id, t)) notFound();
  const s = await invoiceData(id);
  if (!s) notFound();
  const order = s.orderId ? await db.order.findUnique({ where: { id: s.orderId }, select: { code: true, fulfilment: true } }) : null;

  const title = invoiceTitle(s);
  const refund = s.kind === "REFUND";
  const vendor = !!s.store.company.vatNumber;
  const abs = (n: number) => Math.abs(n);
  const total = abs(s.totalCents);
  const vat = abs(s.vatCents);
  const linesTotal = s.lines.reduce((n, l) => n + abs(l.totalCents), 0);
  const delivery = !refund ? Math.max(0, total - linesTotal) : 0;
  const full = vendor && (total > FULL_TAX_INVOICE_OVER_CENTS || !!s.buyer);
  const buyer = (s.buyer ?? null) as { name?: string; address?: string; vatNumber?: string } | null;
  const c = s.store.company;
  const st = s.store;

  return (
    <main className="min-h-screen bg-ink-100 px-4 py-8 text-ink-900 print:bg-white print:p-0">
      <style>{"@page{size:A4;margin:12mm}@media print{body{background:#fff}}"}</style>
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href="/club/invoices" className="text-sm font-medium text-ink-600 hover:text-ink-900">
          ← Your invoices
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[210mm] rounded-2xl bg-white p-8 shadow-card ring-1 ring-ink-150 sm:p-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-brand-500 pb-6">
          <div className="flex items-center gap-3 text-ink-950">
            <Mark className="h-12 w-12 text-brand-600" />
            <Wordmark className="text-lg" />
          </div>
          <div className="text-right">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-950">{title}</h1>
            {vendor && !refund && <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{full ? "Full tax invoice" : "Abridged tax invoice"}</p>}
            <dl className="mt-3 space-y-0.5 text-sm">
              <div>
                <dt className="inline text-ink-500">No. </dt>
                <dd className="tnum inline font-semibold">{s.number}</dd>
              </div>
              <div>
                <dt className="inline text-ink-500">Date </dt>
                <dd className="inline">{fmtDateTime(s.createdAt)}</dd>
              </div>
              {s.refundOf && (
                <div>
                  <dt className="inline text-ink-500">Credits invoice </dt>
                  <dd className="tnum inline font-semibold">{s.refundOf.number}</dd>
                </div>
              )}
              {order && (
                <div>
                  <dt className="inline text-ink-500">Online order </dt>
                  <dd className="tnum inline">{order.code}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-8 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-500">Supplier</h2>
            <p className="mt-2 font-semibold text-ink-950">{c.legalName}</p>
            <p className="text-sm text-ink-700">Trading as Herbal Holland {st.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {st.addressLine}, {st.suburb}
              <br />
              {st.city}, {st.postalCode}
            </p>
            <dl className="mt-2 space-y-0.5 text-sm text-ink-700">
              {c.vatNumber ? (
                <div>
                  <dt className="inline text-ink-500">VAT no. </dt>
                  <dd className="tnum inline font-medium text-ink-900">{c.vatNumber}</dd>
                </div>
              ) : (
                <div className="text-ink-500">Not registered for VAT</div>
              )}
              {c.regNumber && (
                <div>
                  <dt className="inline text-ink-500">Company reg. </dt>
                  <dd className="tnum inline">{c.regNumber}</dd>
                </div>
              )}
              {st.licenceRef && (
                <div>
                  <dt className="inline text-ink-500">Licence </dt>
                  <dd className="inline">{st.licenceRef}</dd>
                </div>
              )}
              {(st.phone || st.email) && <div>{[st.phone, st.email].filter(Boolean).join(" · ")}</div>}
            </dl>
          </div>
          <div>
            <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-500">{refund ? "Credited to" : "Customer"}</h2>
            {buyer?.name ? (
              <>
                <p className="mt-2 font-semibold text-ink-950">{buyer.name}</p>
                {buyer.address && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{buyer.address}</p>}
                {buyer.vatNumber && <p className="text-sm text-ink-700">VAT no. {buyer.vatNumber}</p>}
              </>
            ) : s.customer ? (
              <>
                <p className="mt-2 font-semibold text-ink-950">{[s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ")}</p>
                <p className="text-sm text-ink-700">Herbal Holland Rewards member {s.customer.memberNo}</p>
                <p className="text-sm text-ink-700">{displayPhone(s.customer.phone)}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-700">Walk-in</p>
            )}
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="py-2.5 pr-3 font-semibold">Description</th>
              <th className="py-2.5 px-3 text-right font-semibold">Qty</th>
              <th className="py-2.5 px-3 text-right font-semibold">Unit price</th>
              <th className="py-2.5 px-3 text-right font-semibold">Discount</th>
              <th className="py-2.5 pl-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id} className="border-b border-ink-100 align-top">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-ink-900">{l.variant.product.name}</div>
                  <div className="text-xs text-ink-500">{l.variant.name}</div>
                </td>
                <td className="tnum py-2.5 px-3 text-right">{abs(l.qty)}</td>
                <td className="tnum py-2.5 px-3 text-right">{zar(l.unitPriceCents)}</td>
                <td className="tnum py-2.5 px-3 text-right text-ink-500">{l.discountCents ? `−${zar(abs(l.discountCents))}` : "—"}</td>
                <td className="tnum py-2.5 pl-3 text-right font-medium">{zar(abs(l.totalCents))}</td>
              </tr>
            ))}
            {delivery > 0 && (
              <tr className="border-b border-ink-100">
                <td className="py-2.5 pr-3 font-medium text-ink-900">Delivery</td>
                <td className="tnum py-2.5 px-3 text-right">1</td>
                <td className="tnum py-2.5 px-3 text-right">{zar(delivery)}</td>
                <td className="py-2.5 px-3 text-right text-ink-500">—</td>
                <td className="tnum py-2.5 pl-3 text-right font-medium">{zar(delivery)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <section className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3 text-sm">
            {s.payments.length > 0 && (
              <div>
                <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-500">{refund ? "Refunded to" : "Paid by"}</h2>
                <ul className="mt-2 space-y-1">
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4 text-ink-700">
                      <span>
                        {PAY[p.method] ?? p.method}
                        {p.cardBrand && ` · ${p.cardBrand}`}
                        {p.cardLast4 && ` ••${p.cardLast4}`}
                        {p.method === "LOYALTY" && ` (${fmtPoints(abs(p.amountCents) / 100)})`}
                        {p.reference && p.method !== "CASH" && <span className="text-ink-400"> · ref {p.reference}</span>}
                      </span>
                      <span className="tnum">{zar(abs(p.amountCents))}</span>
                    </li>
                  ))}
                  {s.payments.filter((p) => p.method === "CASH" && p.tenderedCents).map((p) => (
                    <li key={`${p.id}-c`} className="text-xs text-ink-500">
                      Tendered {zar(p.tenderedCents!)} · change {zar(p.changeCents ?? 0)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!refund && (s.pointsEarned > 0 || s.memberSavingsCents > 0) && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-200">
                {s.memberSavingsCents > 0 && <p className="font-semibold">You saved {zar(s.memberSavingsCents)} with Herbal Holland Rewards</p>}
                {s.pointsEarned > 0 && <p>You earned {fmtPoints(s.pointsEarned)} on this purchase.</p>}
              </div>
            )}
            {refund && s.note && <p className="text-ink-600">Reason: {s.note}</p>}
          </div>
          <dl className="space-y-1.5 text-sm">
            {s.discountCents > 0 && (
              <div className="flex justify-between text-ink-600">
                <dt>Discounts included</dt>
                <dd className="tnum">−{zar(abs(s.discountCents))}</dd>
              </div>
            )}
            {vendor && (
              <>
                <div className="flex justify-between text-ink-600">
                  <dt>Total excl. VAT</dt>
                  <dd className="tnum">{zar(total - vat)}</dd>
                </div>
                <div className="flex justify-between text-ink-600">
                  <dt>VAT @ 15%</dt>
                  <dd className="tnum">{zar(vat)}</dd>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between border-t-2 border-ink-900 pt-2">
              <dt className="font-semibold text-ink-950">{refund ? "Total credited" : vendor ? "Total incl. VAT" : "Total"}</dt>
              <dd className="tnum font-display text-2xl font-semibold text-ink-950">{zar(total)}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-ink-150 pt-6 text-xs leading-relaxed text-ink-500">
          <div className="max-w-md space-y-1">
            {st.receiptFooter && <p>{st.receiptFooter}</p>}
            <p>
              Issued by {c.legalName}. Herbal Holland stores are independently owned and operated by franchisees; the store named above is the supplier.
              {!vendor && " The supplier is not registered for VAT, so no VAT is charged."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20">
              <QrCode value={invoiceUrl(s.id)} label="QR code linking to this invoice online" />
            </div>
            <span className="w-28">Scan to view or verify this {title.toLowerCase()} online.</span>
          </div>
        </footer>
      </article>
    </main>
  );
}
