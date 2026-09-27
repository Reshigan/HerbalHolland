"use client";
// 80 mm thermal layouts for receipts / credit notes and Z-reports (print CSS only).
import { zar } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { DENOMINATIONS, denomLabel, TENDER_LABEL } from "./lib/rules";
import type { PrintDoc } from "./context";
import type { BootData, ReceiptDTO, ZReport } from "@/server/pos/types";

const Row = ({ l, r, bold }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
    <span>{l}</span>
    <span className="whitespace-nowrap">{r}</span>
  </div>
);
const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

export function PrintArea({ doc, boot }: { doc: PrintDoc; boot: BootData }) {
  return (
    <div className="hidden bg-white print:block" data-testid="print-area">
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto w-[74mm] font-mono text-[11px] leading-snug text-black">{doc.kind === "receipt" ? <ReceiptPrint r={doc.receipt} boot={boot} /> : <ZPrint z={doc.report} />}</div>
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
  return (
    <div>
      <StoreHeader boot={boot} />
      <Rule />
      <div className="text-center text-[13px] font-bold uppercase">{r.title}</div>
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
          </div>
          <Row l={`  ${Math.abs(l.qty)} × ${zar(l.unitPriceCents)}`} r={zar(l.totalCents)} />
          {l.discountCents > 0 && <Row l="  Discount" r={`−${zar(l.discountCents)}`} />}
        </div>
      ))}
      <Rule />
      {r.discountCents > 0 && <Row l="Discounts" r={`−${zar(r.discountCents)}`} />}
      <Row l="TOTAL" r={zar(r.totalCents)} bold />
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
          <div>
            Herbal Holland Rewards · {r.customer.name} ({r.customer.memberNo})
          </div>
          {!r.queued && (
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
      <div className="text-center">
        {boot.store.licenceRef && <div>{boot.store.licenceRef}</div>}
        <div>Adults 18+ only. Keep out of reach of children.</div>
        {boot.store.receiptFooter && <div>{boot.store.receiptFooter}</div>}
        {r.invoiceEmail && <div>Tax invoice emailed to {r.invoiceEmail}</div>}
        <div className="mt-1">Thank you · herbalholland.co.za</div>
      </div>
    </div>
  );
}

function ZPrint({ z }: { z: ZReport }) {
  return (
    <div>
      <div className="text-center">
        <div className="text-[15px] font-bold tracking-[0.2em]">HERBAL HOLLAND</div>
        <div className="font-bold">
          {z.store.name} · {z.store.code}
        </div>
        <div>{z.store.legalName}</div>
        {z.store.vatNumber && <div>VAT no. {z.store.vatNumber}</div>}
      </div>
      <Rule />
      <div className="text-center text-[13px] font-bold">{z.closed ? "Z-REPORT (SHIFT CLOSED)" : "X-REPORT (SHIFT OPEN)"}</div>
      {z.device && <div>Till: {z.device.name} ({z.device.prefix})</div>}
      <div>Opened {fmtDateTime(z.openedAt)} · {z.openedBy}</div>
      {z.closedAt && <div>Closed {fmtDateTime(z.closedAt)} · {z.closedBy}</div>}
      <Rule />
      <Row l={`Sales (${z.sales.count})`} r={zar(z.sales.grossCents)} bold />
      <Row l="  VAT included" r={zar(z.sales.vatCents)} />
      <Row l="  Net of VAT" r={zar(z.sales.netCents)} />
      <Row l="  Discounts given" r={zar(z.sales.discountCents)} />
      <Row l="  Units sold" r={z.sales.units} />
      {z.online.count > 0 && <Row l={`  Online handovers (${z.online.count})`} r={zar(z.online.grossCents)} />}
      <Row l={`Refunds (${z.refunds.count})`} r={`−${zar(z.refunds.totalCents)}`} />
      <Row l="Net takings" r={zar(z.takingsCents)} bold />
      <Rule />
      <div className="font-bold">By tender (net)</div>
      {z.tenders.map((t) => (
        <Row key={t.method} l={`  ${t.label} (${t.count})`} r={zar(t.amountCents)} />
      ))}
      <Row l="Points issued / redeemed" r={`${fmtPoints(z.points.issued)} / ${fmtPoints(z.points.redeemed)}`} />
      <Rule />
      <div className="font-bold">Cash drawer</div>
      <Row l="  Opening float" r={zar(z.cash.floatCents)} />
      <Row l="  Cash sales less refunds" r={zar(z.cash.cashNetCents)} />
      <Row l="  Expected" r={zar(z.cash.expectedCents)} bold />
      {z.cash.countedCents != null && <Row l="  Counted" r={zar(z.cash.countedCents)} />}
      {z.cash.varianceCents != null && <Row l="  Variance" r={`${z.cash.varianceCents > 0 ? "+" : ""}${zar(z.cash.varianceCents)}`} bold />}
      {z.cash.counts && (
        <div className="mt-1">
          {DENOMINATIONS.filter((d) => z.cash.counts![String(d)]).map((d) => (
            <Row key={d} l={`  ${denomLabel(d)} × ${z.cash.counts![String(d)]}`} r={zar(d * z.cash.counts![String(d)])} />
          ))}
        </div>
      )}
      {z.notes && <div className="mt-1">Notes: {z.notes}</div>}
      <Rule />
      <div className="mt-4">Cashier: ______________________</div>
      <div className="mt-4">Manager: ______________________</div>
      <div className="mt-2 text-center">Printed {fmtDateTime(new Date())}</div>
    </div>
  );
}
