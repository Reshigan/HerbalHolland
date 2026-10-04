// The Z-report (shift close) and X-report (shift still open) as one printable document. The same DOM prints two ways:
// on A4 (or "Save as PDF") it is a designed sheet with the brand header and a two-column layout; on 80 mm receipt
// paper, where the page box is narrow, a print media query turns it into a single-column till slip. No hooks, no
// server imports: the till's print area (a client component) and the back office (a server page) both render it.
import { Mark, Wordmark } from "@/components/brand/logo";
import { zar } from "@/lib/money";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { DENOMINATIONS, denomLabel } from "./lib/rules";
import type { ZReport } from "@/server/pos/types";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${zar(Math.abs(n))}`;

const CSS = `
.zr{--zr-ink:var(--color-ink-950,#0c0a09);--zr-text:var(--color-ink-700,#2f2824);--zr-muted:var(--color-ink-500,#6b5f57);--zr-line:var(--color-ink-150,#ece5dd);--zr-soft:var(--color-ink-50,#fbf7f3);--zr-brand:var(--color-brand-500,#f5913c);--zr-brand-dark:var(--color-brand-700,#c05f18);--zr-leaf:var(--color-leaf-700,#1b6432);--zr-rose:var(--color-rose-600,#b32f2f);
  font-family:var(--font-inter),Inter,ui-sans-serif,system-ui,sans-serif;color:var(--zr-text);background:#fff;max-width:200mm;margin:0 auto;padding:14mm 16mm;border-radius:1.25rem;box-shadow:0 1px 0 rgb(20 17 16/.04),0 1px 3px rgb(20 17 16/.06);font-size:13px;line-height:1.45}
.zr h1,.zr h2,.zr .zr-display{font-family:var(--font-outfit),Outfit,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em}
.zr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:14px;border-bottom:4px solid var(--zr-brand)}
.zr-brand{display:flex;align-items:center;gap:10px;color:var(--zr-ink)}
.zr-brand svg{width:44px;height:44px;color:var(--zr-brand-dark)}
.zr-brand .zr-word{font-size:15px}
.zr-title{text-align:right}
.zr-eyebrow{font-family:var(--font-outfit),Outfit,system-ui,sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--zr-brand-dark)}
.zr h1{margin:2px 0 0;font-size:26px;font-weight:600;line-height:1.1;color:var(--zr-ink)}
.zr-sub{margin-top:4px;font-size:12px;color:var(--zr-muted)}
.zr-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 0;padding:12px 14px;background:var(--zr-soft);border-radius:14px}
.zr-meta div{min-width:0}.zr-meta dt{font-size:.66rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--zr-muted)}.zr-meta dd{margin:2px 0 0;font-weight:600;color:var(--zr-ink);font-variant-numeric:tabular-nums}
.zr-meta dd small{display:block;font-weight:400;color:var(--zr-muted);font-size:12px}
.zr-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 32px;margin-top:18px}
.zr-sec{break-inside:avoid;padding-top:10px}
.zr-sec h2{margin:0 0 6px;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--zr-brand-dark);padding-bottom:6px;border-bottom:2px solid var(--zr-ink)}
.zr-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid var(--zr-line)}
.zr-row.i{padding-left:14px;color:var(--zr-muted)}
.zr-row.s{font-weight:700;color:var(--zr-ink)}
.zr-row .v{font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--zr-ink)}
.zr-row.i .v{color:var(--zr-text)}
.zr-row .v.pos{color:var(--zr-leaf)}.zr-row .v.neg{color:var(--zr-rose)}
.zr-denoms{margin:8px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 16px;font-size:12px;color:var(--zr-muted)}
.zr-denoms li{display:flex;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums;white-space:nowrap}
.zr-variance{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:20px;padding:16px 20px;border-radius:16px;background:var(--zr-ink);color:#fff;break-inside:avoid}
.zr-variance .zr-eyebrow{color:var(--zr-brand)}
.zr-variance p{margin:4px 0 0;font-size:12px;color:var(--color-ink-300,#bdb3a9)}
.zr-variance .zr-display{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.zr-variance.ok{background:var(--color-leaf-50,#eefaf1);color:var(--zr-leaf)}.zr-variance.ok .zr-eyebrow,.zr-variance.ok p{color:var(--zr-leaf)}
.zr-variance.short{background:var(--color-rose-50,#fdf0ef);color:var(--zr-rose)}.zr-variance.short .zr-eyebrow,.zr-variance.short p{color:var(--zr-rose)}
.zr-variance.over{background:var(--color-amber-50,#fff8e6);color:var(--color-amber-700,#9a6700)}.zr-variance.over .zr-eyebrow,.zr-variance.over p{color:var(--color-amber-700,#9a6700)}
.zr-notes{margin:14px 0 0;padding:10px 14px;border-radius:12px;background:var(--zr-soft);font-size:12px}
.zr-sign{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:28px;break-inside:avoid}
.zr-sign div{padding-top:8px;border-top:1px solid var(--zr-ink);font-size:11px;color:var(--zr-muted)}
.zr-foot{display:flex;justify-content:space-between;gap:16px;margin-top:22px;padding-top:12px;border-top:1px solid var(--zr-line);font-size:11px;color:var(--zr-muted)}
@media print{
  .zr{box-shadow:none;border-radius:0;max-width:none;padding:0;color:#000}
  .zr-variance{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
/* 80 mm receipt paper: the page box is narrow, so this becomes a till slip. */
@media print and (max-width:120mm){
  .zr{font-family:ui-monospace,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;line-height:1.3;width:74mm;max-width:74mm;padding:0;margin:0}
  .zr h1,.zr h2,.zr .zr-display,.zr .zr-eyebrow{font-family:inherit;letter-spacing:0}
  .zr-head{display:block;text-align:center;border-bottom:1px dashed #000;padding-bottom:6px}
  .zr-brand{display:block}.zr-brand svg{display:none}.zr-brand .zr-word{display:block;font-size:14px;font-weight:700;letter-spacing:.2em}
  .zr-title{text-align:center;margin-top:4px}.zr h1{font-size:13px;font-weight:700}.zr-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;color:#000}
  .zr-sub{font-size:11px;color:#000}
  .zr-meta{display:block;margin:6px 0 0;padding:0 0 6px;background:none;border-radius:0;border-bottom:1px dashed #000}
  .zr-meta div{display:flex;justify-content:space-between;gap:8px}.zr-meta dt{font-size:11px;letter-spacing:0;text-transform:none;color:#000;font-weight:400}.zr-meta dd{margin:0;text-align:right;font-weight:400;color:#000}.zr-meta dd small{display:inline;font-size:11px;color:#000}.zr-meta dd small::before{content:" · "}
  .zr-grid{display:block;margin-top:0}
  .zr-sec{padding-top:4px}.zr-sec h2{font-size:11px;letter-spacing:0;color:#000;border:0;padding:0;margin:4px 0 2px;text-transform:uppercase}
  .zr-row{padding:1px 0;border:0;color:#000}.zr-row.i{padding-left:8px;color:#000}.zr-row .v,.zr-row .v.pos,.zr-row .v.neg,.zr-row.i .v{color:#000}
  .zr-denoms{display:block;margin:2px 0 0;font-size:11px;color:#000}.zr-denoms li{padding-left:8px}
  .zr-variance,.zr-variance.ok,.zr-variance.short,.zr-variance.over{display:block;margin-top:6px;padding:4px 0 0;border-radius:0;background:none;color:#000;border-top:1px dashed #000}
  .zr-variance .zr-eyebrow,.zr-variance.ok .zr-eyebrow,.zr-variance.short .zr-eyebrow,.zr-variance.over .zr-eyebrow,.zr-variance p,.zr-variance.ok p,.zr-variance.short p,.zr-variance.over p{color:#000;font-size:11px}
  .zr-variance .zr-display{display:block;font-size:14px;font-weight:700;text-align:right}
  .zr-notes{margin:4px 0 0;padding:0;background:none;font-size:11px;color:#000}
  .zr-sign{display:block;margin-top:14px}.zr-sign div{margin-top:14px;border-top:1px solid #000;color:#000}
  .zr-foot{display:block;text-align:center;margin-top:8px;padding-top:6px;border-top:1px dashed #000;color:#000}
}`;

export function ZReportStyles() {
  return <style>{CSS}</style>;
}

function Row({ label, value, indent, strong, tone }: { label: React.ReactNode; value: React.ReactNode; indent?: boolean; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className={`zr-row${indent ? " i" : ""}${strong ? " s" : ""}`}>
      <span>{label}</span>
      <span className={`v${tone ? ` ${tone}` : ""}`}>{value}</span>
    </div>
  );
}

/** The report itself. `printedAt` is fixed by the caller so server and client render the same document. */
export function ZReportDocument({ z, printedAt, address }: { z: ZReport; printedAt: Date | string; address?: string | null }) {
  const variance = z.cash.varianceCents;
  const tone = variance == null ? "" : variance === 0 ? " ok" : variance < 0 ? " short" : " over";
  const d = z.dispensing;
  const t = z.trade;
  return (
    <article className="zr" aria-label={z.closed ? "Z-report" : "X-report"}>
      <div className="zr-head">
        <div className="zr-brand">
          <Mark />
          <Wordmark className="zr-word" />
        </div>
        <div className="zr-title">
          <div className="zr-eyebrow">{z.closed ? "Z-report · shift closed" : "X-report · shift open"}</div>
          <h1>
            {z.store.name}
            {z.device ? ` · ${z.device.name}` : ""}
          </h1>
          <div className="zr-sub">
            {z.store.legalName} · Herbal Holland {z.store.name} ({z.store.code}){z.store.vatNumber ? ` · VAT no. ${z.store.vatNumber}` : ""}
            {address ? ` · ${address}` : ""}
          </div>
        </div>
      </div>

      <dl className="zr-meta">
        <div>
          <dt>Opened</dt>
          <dd>
            {fmtDateTime(z.openedAt)}
            <small>by {z.openedBy}</small>
          </dd>
        </div>
        <div>
          <dt>Closed</dt>
          <dd>
            {z.closedAt ? fmtDateTime(z.closedAt) : "Still open"}
            <small>{z.closedAt ? `by ${z.closedBy ?? "—"}` : `as at ${fmtTime(printedAt)}`}</small>
          </dd>
        </div>
        <div>
          <dt>Till</dt>
          <dd>
            {z.device?.name ?? "—"}
            <small>{z.device ? `receipts ${z.store.code}-${z.device.prefix}…` : "no till recorded"}</small>
          </dd>
        </div>
        <div>
          <dt>Net takings</dt>
          <dd>
            {zar(z.takingsCents)}
            <small>
              {z.sales.count} sale{z.sales.count === 1 ? "" : "s"} · {z.sales.units} units
            </small>
          </dd>
        </div>
      </dl>

      <div className="zr-grid">
        <section className="zr-sec">
          <h2>Sales</h2>
          <Row label={`Sales (${z.sales.count})`} value={zar(z.sales.grossCents)} strong />
          <Row label="VAT included (15%)" value={zar(z.sales.vatCents)} indent />
          <Row label="Net of VAT" value={zar(z.sales.netCents)} indent />
          <Row label="Discounts given" value={zar(z.sales.discountCents)} indent />
          <Row label="Rewards savings given" value={zar(z.sales.memberSavingsCents)} indent />
          {z.online.count > 0 && <Row label={`Online handovers (${z.online.count})`} value={zar(z.online.grossCents)} indent />}
          <Row label={`Refunds (${z.refunds.count})`} value={`−${zar(z.refunds.totalCents)}`} tone={z.refunds.totalCents ? "neg" : undefined} />
          <Row label="Net takings" value={zar(z.takingsCents)} strong />
        </section>

        <section className="zr-sec">
          <h2>By tender (net of refunds)</h2>
          {z.tenders.length === 0 && <Row label="No payments in this shift" value="—" />}
          {z.tenders.map((t) => (
            <Row key={t.method} label={`${t.label} (${t.count})`} value={zar(t.amountCents)} />
          ))}
          <Row label="Points issued" value={fmtPoints(z.points.issued)} indent />
          <Row label="Points redeemed" value={fmtPoints(z.points.redeemed)} indent />
        </section>

        <section className="zr-sec">
          <h2>Cash drawer</h2>
          <Row label="Opening float" value={zar(z.cash.floatCents)} />
          <Row label="Cash sales less cash refunds" value={z.blind ? "After the count" : zar(z.cash.cashNetCents)} />
          <Row label="Expected in drawer" value={z.blind ? "After the count" : zar(z.cash.expectedCents)} strong />
          <Row label="Cash counted" value={z.cash.countedCents != null ? zar(z.cash.countedCents) : "—"} />
          <Row label="Variance" value={variance != null ? signed(variance) : "—"} strong tone={variance == null || variance === 0 ? undefined : variance < 0 ? "neg" : "pos"} />
          {z.cash.counts && (
            <ul className="zr-denoms" aria-label="Denominations counted">
              {DENOMINATIONS.filter((den) => z.cash.counts![String(den)]).map((den) => (
                <li key={den}>
                  <span>
                    {denomLabel(den)} × {z.cash.counts![String(den)]}
                  </span>
                  <span>{zar(den * z.cash.counts![String(den)])}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="zr-sec">
          <h2>Dispensing (licensed medicines)</h2>
          {d && d.count > 0 ? (
            <>
              <Row label={`Dispensed (${d.count} sale${d.count === 1 ? "" : "s"})`} value={zar(d.cents)} strong />
              <Row label="Units" value={String(d.units)} indent />
              <Row label="Dried-flower equivalent" value={`${d.grams.toFixed(1)} g`} indent />
              <Row label="Prices, points, deals" value="None (s18A)" indent />
            </>
          ) : (
            <Row label="No licensed medicines dispensed" value="—" />
          )}
        </section>

        <section className="zr-sec" aria-label="Trade sales">
          <h2>Trade sales (wholesale)</h2>
          {t && (t.count > 0 || t.refundCents > 0) ? (
            <>
              <Row label={`Trade sales (${t.count}) incl VAT`} value={zar(t.inclCents)} strong />
              <Row label="Ex VAT" value={zar(t.exCents)} indent />
              <Row label="VAT (15%)" value={zar(t.vatCents)} indent />
              {t.refundCents > 0 && <Row label="Credit notes" value={`−${zar(t.refundCents)}`} indent tone="neg" />}
              <Row label="On account (invoiced, not money)" value={zar(t.onAccountCents)} indent />
            </>
          ) : (
            <Row label="No trade sales" value="—" />
          )}
        </section>
      </div>

      <div className={`zr-variance${tone}`}>
        <div>
          <div className="zr-eyebrow">{variance == null ? "Shift still open" : variance === 0 ? "Drawer balanced" : variance < 0 ? "Drawer short" : "Drawer over"}</div>
          <p>
            {variance == null && z.blind
              ? "Blind count: what the drawer should hold shows on the Z-report once the shift is closed."
              : variance == null
              ? `Expected in the drawer right now: ${zar(z.cash.expectedCents)}. Close the shift with a blind count to finish the Z-report.`
              : variance === 0
                ? "Counted cash matches the expected float plus cash takings."
                : `Counted ${zar(z.cash.countedCents ?? 0)} against ${zar(z.cash.expectedCents)} expected.${Math.abs(variance) > 5_000 ? " Over the R50 tolerance: the owner and area manager see a loss-prevention alert." : " Within the R50 tolerance."}`}
          </p>
        </div>
        <div className="zr-display">{variance == null ? (z.blind ? "—" : zar(z.cash.expectedCents)) : signed(variance)}</div>
      </div>

      {z.notes && <p className="zr-notes">Notes from the till: {z.notes}</p>}

      <div className="zr-sign">
        <div>Cashier signature</div>
        <div>Manager signature</div>
      </div>
      <div className="zr-foot">
        <span>
          Printed {fmtDateTime(printedAt)}
          {z.emailedTo ? ` · emailed to ${z.emailedTo}` : ""}
        </span>
        <span>Herbal Holland · shift {z.shiftId.slice(-8).toUpperCase()}</span>
      </div>
    </article>
  );
}

/** The till's print area version: paper size follows the printer (80 mm roll or A4), so no @page size is forced. */
export function ZReportPrint({ z }: { z: ZReport }) {
  return (
    <>
      <style>{"@media print{@page{size:auto;margin:6mm}html,body{background:#fff!important}}"}</style>
      <ZReportStyles />
      <ZReportDocument z={z} printedAt={new Date()} />
    </>
  );
}
