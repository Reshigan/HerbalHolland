"use client";
// 80 mm thermal layouts for receipts / credit notes and Z-reports (print CSS only).
import { zar } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { maskMemberNo, TENDER_LABEL } from "./lib/rules";
import { ADULTS_LINE, CBD_LINE, LICENSED_LINE, TRAINING_LINE } from "./lib/receipt";
import { incentiveExcluded } from "@/lib/compliance";
import { ZReportPrint } from "./z-report";
import type { PrintDoc } from "./context";
import type { BootData, ReceiptDTO } from "@/server/pos/types";

const Row = ({ l, r, bold }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
    <span>{l}</span>
    <span className="whitespace-nowrap">{r}</span>
  </div>
);
const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

export function PrintArea({ doc, boot }: { doc: PrintDoc; boot: BootData }) {
  // The Z-report is a document of its own (z-report.tsx): a till slip on 80 mm paper, a designed sheet on A4.
  if (doc.kind === "z")
    return (
      <div className="hidden bg-white print:block" data-testid="print-area">
        <ZReportPrint z={doc.report} />
      </div>
    );
  return (
    <div className="hidden bg-white print:block" data-testid="print-area">
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto w-[74mm] font-mono text-[11px] leading-snug text-black">
        <ReceiptPrint r={doc.receipt} boot={boot} />
      </div>
    </div>
  );
}

function StoreHeader({ boot }: { boot: BootData }) {
  const s = boot.store;
  return (
    <div className="text-center">
      <div className="text-[15px] font-bold tracking-[0.2em]">HERBAL HOLLAND</div>
      <div className="font-bold">
        {s.name} · {s.code}
      </div>
      <div>{s.legalName}</div>
      {s.vatNumber && <div>VAT no. {s.vatNumber}</div>}
      <div>
        {s.addressLine}, {s.suburb}, {s.city} {s.postalCode}
      </div>
      {s.phone && <div>Tel {s.phone}</div>}
    </div>
  );
}

function ReceiptPrint({ r, boot }: { r: ReceiptDTO; boot: BootData }) {
  const change = r.payments.reduce((s, p) => s + (p.changeCents ?? 0), 0);
  const offer = Math.max(0, r.offerCents ?? 0);
  const training = !!r.training;
  const classOf = new Map(boot.products.flatMap((p) => p.variants.map((v) => [v.id, p.regClass] as const)));
  const licensed = (id: string) => boot.settings.compliance.licensedOnly.includes(classOf.get(id) as never);
  const excluded = incentiveExcluded(boot.settings.compliance);
  const anyLicensed = r.lines.some((l) => licensed(l.variantId));
  const anyCbd = r.lines.some((l) => !licensed(l.variantId) && excluded.includes(classOf.get(l.variantId) as never));
  const Watermark = () => <div className="my-1 text-center text-[13px] font-bold" data-testid="print-training">{TRAINING_LINE}</div>;
  return (
    <div className="relative">
      {training && <Watermark />}
      {training && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[40px] font-black uppercase tracking-[0.3em] text-black/10 [transform:rotate(-24deg)]" aria-hidden>Training</div>}
      <StoreHeader boot={boot} />
      <Rule />
      <div className="text-center text-[13px] font-bold uppercase">{training ? `Training ${r.title}` : r.title}</div>
      <Row l={`No. ${r.number}`} r={fmtDateTime(r.createdAt)} />
      {r.refundOf && <div>Refund of {r.refundOf.number}</div>}
      <div>
        Served by {r.staff ?? "—"} · till {boot.device.prefix}
      </div>
      {r.queued && <div className="font-bold">Offline sale — synced later</div>}
      <Rule />
      {r.lines.map((l) => (
        <div key={l.id} className="mb-1">
          <div>
            {l.name} · {l.variantName}
            {licensed(l.variantId) ? " (Rx)" : ""}
          </div>
          <Row l={`  ${Math.abs(l.qty)} × ${zar(l.unitPriceCents)}`} r={zar(l.totalCents)} />
          {l.discountCents > 0 && <Row l={l.offerCents === l.discountCents ? "  My Deals" : "  Discount"} r={`−${zar(l.discountCents)}`} />}
        </div>
      ))}
      <Rule />
      {r.discountCents - offer > 0 && <Row l="Deals & discounts" r={`−${zar(r.discountCents - offer)}`} />}
      {offer > 0 && <Row l={`My Deals${r.offers?.length ? ` (${r.offers.join(", ")})` : ""}`} r={`−${zar(offer)}`} />}
      <Row l="TOTAL" r={zar(r.totalCents)} bold />
      {r.memberSavingsCents > 0 && <Row l="Rewards savings in prices" r={zar(r.memberSavingsCents)} />}
      <Row l={r.vatCents ? "VAT included (15%)" : "No VAT charged"} r={r.vatCents ? zar(r.vatCents) : ""} />
      <Rule />
      {r.payments.map((p, i) => (
        <div key={i}>
          <Row l={`${TENDER_LABEL[p.method] ?? p.method}${p.cardLast4 ? ` •••• ${p.cardLast4}` : ""}${p.reference ? ` (${p.reference})` : ""}`} r={zar(p.amountCents)} />
          {p.tenderedCents != null && p.tenderedCents !== p.amountCents && <Row l="  Tendered" r={zar(p.tenderedCents)} />}
        </div>
      ))}
      {r.pointsRedeemed > 0 && <Row l="Points redeemed" r={fmtPoints(r.pointsRedeemed)} />}
      {change > 0 && <Row l="CHANGE" r={zar(change)} bold />}
      {r.customer && (
        <>
          <Rule />
          <div data-testid="print-member">
            Herbal Holland Rewards · {r.customer.name} ({maskMemberNo(r.customer.memberNo)})
          </div>
          {!r.queued && !training && (
            <Row l={`Points earned ${fmtPoints(r.pointsEarned)}`} r={`Balance ${fmtPoints(r.customer.points)}`} />
          )}
        </>
      )}
      {r.buyer && (
        <>
          <Rule />
          <div>Buyer: {r.buyer.name}</div>
          <div>{r.buyer.address}</div>
          {r.buyer.vatNumber && <div>Buyer VAT no. {r.buyer.vatNumber}</div>}
        </>
      )}
      {r.note && <div>Reason: {r.note}</div>}
      <Rule />
      {r.invoiceUrl && !training && (
        <div className="my-1 text-center" data-testid="print-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/pos/qr?text=${encodeURIComponent(r.invoiceUrl)}`} alt="QR code linking to this invoice" className="mx-auto h-[22mm] w-[22mm]" />
          <div>Scan for your invoice</div>
          <div className="break-all text-[10px]">{r.invoiceUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</div>
        </div>
      )}
      <div className="text-center">
        {boot.store.licenceRef && <div>{boot.store.licenceRef}</div>}
        {anyLicensed && <div className="mt-1">{LICENSED_LINE}</div>}
        {anyCbd && <div className="mt-1">{CBD_LINE}</div>}
        <div className="mt-1">{ADULTS_LINE}</div>
        {boot.store.receiptFooter && <div>{boot.store.receiptFooter}</div>}
        {r.invoiceEmail && !training && <div>Tax invoice emailed to {r.invoiceEmail}</div>}
        <div className="mt-1">Thank you · herbalholland.co.za</div>
      </div>
      {training && <Watermark />}
    </div>
  );
}
