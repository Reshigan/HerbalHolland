// Hosted tax invoice (SARS): opened from the invoice email or Rewards, protected by a
// signed token. Abridged tax invoice up to R5,000, full tax invoice above; non-VAT
// vendors issue a plain invoice; refunds are credit notes. Prints on A4 (or saves as a
// PDF) and on 80 mm receipt paper (print-bar.tsx switches the paper).
import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { invoiceData, invoiceTitle, invoiceToken, invoiceUrl, saleBatchCodes } from "@/server/invoices";
import { FULL_TAX_INVOICE_OVER_CENTS } from "@/server/sales";
import { Mark, Wordmark } from "@/components/brand/logo";
import { QrCode } from "@/components/shop/qr";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { displayPhone } from "@/lib/sa";
import { PrintBar } from "./print-bar";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

const valid = (id: string, t?: string) => {
  if (!t) return false;
  const a = Buffer.from(t);
  const b = Buffer.from(invoiceToken(id));
  return a.length === b.length && timingSafeEqual(a, b);
};

const PAY: Record<string, string> = { CARD: "Card", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Rewards points", ONLINE: "Paid online" };

// Print: A4 is the default sheet; html[data-paper="receipt"] (set by the toolbar) turns the same document into a till slip.
const PRINT_CSS = `
@page{size:A4;margin:12mm}
@media print{
  html,body{background:#fff!important}
  .inv-page{padding:0!important;background:#fff!important}
  .inv-sheet{max-width:none!important;padding:0!important;box-shadow:none!important;border-radius:0!important}
  .inv-sheet,.inv-sheet *{color-adjust:exact;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html[data-paper="receipt"] .inv-sheet{width:72mm;max-width:72mm;margin:0;font-size:11px;line-height:1.3}
  html[data-paper="receipt"] .inv-head{display:block!important;border-bottom:1px dashed #000!important;padding-bottom:6px!important}
  html[data-paper="receipt"] .inv-head>*{text-align:left!important}
  html[data-paper="receipt"] .inv-brand svg{width:34px;height:34px}
  html[data-paper="receipt"] .inv-title{font-size:18px!important;margin-top:6px}
  html[data-paper="receipt"] .inv-parties{display:block!important;padding:8px 0!important}
  html[data-paper="receipt"] .inv-parties>div+div{margin-top:8px}
  html[data-paper="receipt"] .inv-lines th.opt,html[data-paper="receipt"] .inv-lines td.opt{display:none!important}
  html[data-paper="receipt"] .inv-lines td,html[data-paper="receipt"] .inv-lines th{padding:3px 6px 3px 0!important;font-size:11px!important}
  html[data-paper="receipt"] .inv-lines td:last-child,html[data-paper="receipt"] .inv-lines th:last-child{padding-right:0!important}
  html[data-paper="receipt"] .inv-bottom{display:block!important}
  html[data-paper="receipt"] .inv-bottom>*+*{margin-top:8px}
  html[data-paper="receipt"] .inv-rates{display:none!important}
  html[data-paper="receipt"] .inv-total{font-size:18px!important}
  html[data-paper="receipt"] .inv-foot{display:block!important;font-size:10px!important}
  html[data-paper="receipt"] .inv-qr{width:22mm!important;margin-top:6px}
}`;

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
  const [order, batchCodes] = await Promise.all([
    s.orderId ? db.order.findUnique({ where: { id: s.orderId }, select: { code: true, fulfilment: true } }) : null,
    saleBatchCodes(s.lines),
  ]);

  const title = invoiceTitle(s);
  const refund = s.kind === "REFUND";
  const vendor = !!s.store.company.vatNumber;
  const abs = (n: number) => Math.abs(n);
  const total = abs(s.totalCents);
  const vat = abs(s.vatCents);
  const linesTotal = s.lines.reduce((n, l) => n + abs(l.totalCents), 0);
  const linesVat = s.lines.reduce((n, l) => n + abs(l.vatCents), 0);
  const delivery = !refund ? Math.max(0, total - linesTotal) : 0;
  const deliveryVat = delivery > 0 ? Math.max(0, vat - linesVat) : 0;
  const full = vendor && (total > FULL_TAX_INVOICE_OVER_CENTS || !!s.buyer);
  const buyer = (s.buyer ?? null) as { name?: string; address?: string; vatNumber?: string } | null;
  const c = s.store.company;
  const st = s.store;
  const url = invoiceUrl(s.id);
  const appHost = url.replace(/^https?:\/\//, "").split("/")[0];

  // VAT per rate: standard-rated lines (15%) and anything zero-rated or exempt (0%), plus delivery at 15%.
  const rate = (l: { totalCents: number; vatCents: number }) => (abs(l.vatCents) > 0 ? 15 : 0);
  const rates = new Map<number, { net: number; vat: number; gross: number }>();
  const addRate = (r: number, gross: number, v: number) => {
    const cur = rates.get(r) ?? { net: 0, vat: 0, gross: 0 };
    rates.set(r, { net: cur.net + gross - v, vat: cur.vat + v, gross: cur.gross + gross });
  };
  for (const l of s.lines) addRate(rate(l), abs(l.totalCents), abs(l.vatCents));
  if (delivery > 0) addRate(deliveryVat > 0 ? 15 : 0, delivery, deliveryVat);
  const rateRows = [...rates.entries()].filter(([, v]) => v.gross > 0).sort((a, b) => b[0] - a[0]);

  return (
    <main className="inv-page min-h-screen bg-ink-50 px-4 py-8 text-ink-850">
      <style>{PRINT_CSS}</style>
      <PrintBar back={s.customerId ? { href: "/club/invoices", label: "Your invoices" } : null} />

      <article className="inv-sheet mx-auto max-w-[210mm] rounded-2xl bg-white p-8 shadow-card ring-1 ring-ink-150 sm:p-12">
        <header className="inv-head flex flex-wrap items-start justify-between gap-6 border-b-4 border-brand-500 pb-6">
          <div className="inv-brand flex items-center gap-3 text-ink-950">
            <Mark className="h-12 w-12 text-brand-600" />
            <Wordmark className="text-base" />
            <div className="ml-3 border-l border-ink-200 pl-4 text-sm leading-snug text-ink-600">
              <div className="font-semibold text-ink-900">Herbal Holland {st.name}</div>
              <div>
                {st.addressLine}, {st.suburb}, {st.city} {st.postalCode}
              </div>
              {(st.phone || st.email) && <div>{[st.phone, st.email].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
          <div className="ml-auto text-right">
            <h1 className="inv-title font-display text-3xl font-semibold tracking-tight text-ink-950">{title}</h1>
            {vendor && !refund && <p className="eyebrow text-brand-700">{full ? "Full tax invoice" : "Abridged tax invoice"}</p>}
            {refund && <p className="eyebrow text-brand-700">{vendor ? "Credit note" : "Refund"} · money returned</p>}
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
                  <dd className="tnum inline font-semibold">{order.code}</dd>
                </div>
              )}
              {s.staff?.name && (
                <div>
                  <dt className="inline text-ink-500">Served by </dt>
                  <dd className="inline">{s.staff.name}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        <section className="inv-parties grid grid-cols-1 gap-8 py-6 sm:grid-cols-2">
          <div>
            <h2 className="eyebrow text-ink-500">Supplier</h2>
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
            </dl>
          </div>
          <div>
            <h2 className="eyebrow text-ink-500">{refund ? "Credited to" : "Customer"}</h2>
            {buyer?.name ? (
              <>
                <p className="mt-2 font-semibold text-ink-950">{buyer.name}</p>
                {buyer.address && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{buyer.address}</p>}
                {buyer.vatNumber && (
                  <p className="text-sm text-ink-700">
                    VAT no. <span className="tnum">{buyer.vatNumber}</span>
                  </p>
                )}
                {s.customer && <p className="mt-1 text-sm text-ink-500">Herbal Holland Rewards member {s.customer.memberNo}</p>}
              </>
            ) : s.customer ? (
              <>
                <p className="mt-2 font-semibold text-ink-950">{[s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ")}</p>
                <p className="text-sm text-ink-700">
                  Herbal Holland Rewards member <span className="tnum">{s.customer.memberNo}</span>
                </p>
                <p className="text-sm text-ink-700">{displayPhone(s.customer.phone)}</p>
                {s.customer.email && <p className="text-sm text-ink-700">{s.customer.email}</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-700">Walk-in customer</p>
            )}
            {order && (
              <p className="mt-2 text-sm text-ink-600">
                Online order <span className="tnum font-medium text-ink-900">{order.code}</span> · {order.fulfilment === "COLLECT" ? "click & collect" : order.fulfilment === "SAME_DAY" ? "same-day delivery" : "courier delivery"}
              </p>
            )}
          </div>
        </section>

        <table className="inv-lines w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="py-2.5 pr-3 font-semibold">Description</th>
              <th className="py-2.5 px-3 text-right font-semibold">Qty</th>
              <th className="opt py-2.5 px-3 text-right font-semibold">Unit price</th>
              <th className="opt py-2.5 px-3 text-right font-semibold">Discount</th>
              {vendor && <th className="opt py-2.5 px-3 text-right font-semibold">VAT</th>}
              <th className="py-2.5 pl-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id} className="border-b border-ink-100 align-top">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-ink-900">{l.variant.product.name}</div>
                  <div className="text-xs text-ink-500">
                    {l.variant.name}
                    {batchCodes[l.id]?.length ? (
                      <>
                        {" · "}
                        {batchCodes[l.id].map((code) => (
                          <span key={code} className="tnum ml-1 inline-block rounded-md bg-ink-100 px-1.5 py-px text-[0.7rem] font-medium text-ink-700 print:bg-transparent print:px-0 print:ring-0">
                            Batch {code}
                          </span>
                        ))}
                      </>
                    ) : null}
                  </div>
                </td>
                <td className="tnum py-2.5 px-3 text-right">{abs(l.qty)}</td>
                <td className="opt tnum py-2.5 px-3 text-right">{zar(l.unitPriceCents)}</td>
                <td className="opt tnum py-2.5 px-3 text-right text-ink-500">{l.discountCents ? `−${zar(abs(l.discountCents))}` : "—"}</td>
                {vendor && <td className="opt tnum py-2.5 px-3 text-right text-ink-500">{rate(l)}%</td>}
                <td className="tnum py-2.5 pl-3 text-right font-medium">{zar(abs(l.totalCents))}</td>
              </tr>
            ))}
            {delivery > 0 && (
              <tr className="border-b border-ink-100">
                <td className="py-2.5 pr-3 font-medium text-ink-900">Delivery</td>
                <td className="tnum py-2.5 px-3 text-right">1</td>
                <td className="opt tnum py-2.5 px-3 text-right">{zar(delivery)}</td>
                <td className="opt py-2.5 px-3 text-right text-ink-500">—</td>
                {vendor && <td className="opt tnum py-2.5 px-3 text-right text-ink-500">{deliveryVat > 0 ? 15 : 0}%</td>}
                <td className="tnum py-2.5 pl-3 text-right font-medium">{zar(delivery)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <section className="inv-bottom mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4 text-sm">
            {vendor && (
              <div className="inv-rates">
                <h2 className="eyebrow text-ink-500">VAT summary</h2>
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[0.66rem] uppercase tracking-[0.12em] text-ink-500">
                      <th className="py-1 pr-3 font-semibold">Rate</th>
                      <th className="py-1 px-3 text-right font-semibold">Excl. VAT</th>
                      <th className="py-1 px-3 text-right font-semibold">VAT</th>
                      <th className="py-1 pl-3 text-right font-semibold">Incl. VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateRows.map(([r, v]) => (
                      <tr key={r} className="border-t border-ink-100 text-ink-700">
                        <td className="tnum py-1.5 pr-3">{r}%{r === 0 ? " (zero-rated)" : ""}</td>
                        <td className="tnum py-1.5 px-3 text-right">{zar(v.net)}</td>
                        <td className="tnum py-1.5 px-3 text-right">{zar(v.vat)}</td>
                        <td className="tnum py-1.5 pl-3 text-right">{zar(v.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.payments.length > 0 && (
              <div>
                <h2 className="eyebrow text-ink-500">{refund ? "Refunded to" : "Payment"}</h2>
                <ul className="mt-2 space-y-1">
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4 text-ink-700">
                      <span>
                        {PAY[p.method] ?? p.method}
                        {p.provider && p.method !== "CASH" && p.method !== "LOYALTY" && <span className="text-ink-500"> · {p.provider}</span>}
                        {p.cardBrand && ` · ${p.cardBrand}`}
                        {p.cardLast4 && <span className="tnum"> •••• {p.cardLast4}</span>}
                        {p.method === "LOYALTY" && ` (${fmtPoints(abs(p.amountCents) / 100)})`}
                        {p.reference && p.method !== "CASH" && (
                          <span className="tnum text-ink-500">
                            {" "}
                            · ref {p.reference}
                          </span>
                        )}
                      </span>
                      <span className="tnum">{zar(abs(p.amountCents))}</span>
                    </li>
                  ))}
                  {s.payments
                    .filter((p) => p.method === "CASH" && p.tenderedCents)
                    .map((p) => (
                      <li key={`${p.id}-c`} className="tnum text-xs text-ink-500">
                        Tendered {zar(p.tenderedCents!)} · change {zar(p.changeCents ?? 0)}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {!refund && (s.pointsEarned > 0 || s.memberSavingsCents > 0) && (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-200 print:ring-ink-200">
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
              <dd className="inv-total tnum font-display text-2xl font-semibold text-ink-950">{zar(total)}</dd>
            </div>
            {!vendor && <p className="text-xs text-ink-500">No VAT is charged: the supplier is not registered for VAT.</p>}
          </dl>
        </section>

        <footer className="inv-foot mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-ink-150 pt-6 text-xs leading-relaxed text-ink-500">
          <div className="max-w-md space-y-1">
            {st.receiptFooter && <p>{st.receiptFooter}</p>}
            <p>
              Issued by {c.legalName}
              {c.regNumber ? ` (reg. no. ${c.regNumber})` : ""}. Herbal Holland stores are independently owned and operated by franchisees; the store named above is the supplier.
              {!vendor && " The supplier is not registered for VAT, so no VAT is charged."}
            </p>
            <p>Adults 18+ only · Keep out of reach of children · Lab-tested and batch-traceable: scan any pack for its certificate.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inv-qr w-20">
              <QrCode value={order ? `${url.split("/invoice/")[0]}/orders/${order.code}` : url} label={order ? `QR code linking to order ${order.code} online` : "QR code linking to this invoice online"} />
            </div>
            <div className="w-32 leading-snug">
              <span className="tnum block font-semibold text-ink-800">{order ? `Order ${order.code}` : s.number}</span>
              <span>
                {order ? `Scan or visit ${appHost}/orders/${order.code}` : `Scan to verify this ${title.toLowerCase()} online.`}
              </span>
            </div>
          </div>
        </footer>
      </article>
    </main>
  );
}
