// ESC/POS adapter for the Z-report / X-report (the till's shift cash-up), so it prints on the paired receipt printer
// through print.ts like a receipt does. The Z-report's on-screen and browser-print components are owned elsewhere
// (src/components/pos/**z-report**); this file only turns a ZReport into printer bytes. Pure and unit-testable.
import { zar } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { EscPos, type Columns } from "./escpos";
import { DENOMINATIONS, denomLabel } from "./rules";
import type { ZReport } from "@/server/pos/types";

export function zReportBytes(z: ZReport, o: { cols: Columns; codePage?: number; at?: Date; cut?: boolean }): Uint8Array {
  const p = new EscPos(o.cols).init().codePage(o.codePage);
  p.align("centre").size({ width: 2, height: 2 }).bold(true).line("HERBAL HOLLAND").size().bold(false);
  p.bold(true).line(`${z.store.name} - ${z.store.code}`).bold(false);
  p.line(z.store.legalName);
  if (z.store.vatNumber) p.line(`VAT no. ${z.store.vatNumber}`);
  p.align("left").rule();
  p.align("centre").bold(true).line(z.closed ? "Z-REPORT (SHIFT CLOSED)" : "X-REPORT (SHIFT OPEN)").bold(false).align("left");
  if (z.device) p.line(`Till: ${z.device.name} (${z.device.prefix})`);
  p.para(`Opened ${fmtDateTime(z.openedAt)} - ${z.openedBy}`);
  if (z.closedAt) p.para(`Closed ${fmtDateTime(z.closedAt)} - ${z.closedBy ?? "-"}`);
  p.rule();
  p.bold(true).row(`Sales (${z.sales.count})`, zar(z.sales.grossCents)).bold(false);
  p.row("  VAT included", zar(z.sales.vatCents));
  p.row("  Net of VAT", zar(z.sales.netCents));
  p.row("  Discounts given", zar(z.sales.discountCents));
  p.row("  Rewards savings given", zar(z.sales.memberSavingsCents));
  p.row("  Units sold", String(z.sales.units));
  if (z.online.count > 0) p.row(`  Online handovers (${z.online.count})`, zar(z.online.grossCents));
  p.row(`Refunds (${z.refunds.count})`, `-${zar(z.refunds.totalCents)}`);
  p.bold(true).row("Net takings", zar(z.takingsCents)).bold(false);
  p.rule();
  p.bold(true).line("By tender (net)").bold(false);
  for (const t of z.tenders) p.row(`  ${t.label} (${t.count})`, zar(t.amountCents));
  p.row("Points issued / redeemed", `${fmtPoints(z.points.issued)} / ${fmtPoints(z.points.redeemed)}`);
  if (z.dispensing && z.dispensing.count > 0) {
    p.rule();
    p.bold(true).line("Licensed medicine dispensed").bold(false);
    p.row(`  Sales (${z.dispensing.count})`, zar(z.dispensing.cents));
    p.row("  Units / grams", `${z.dispensing.units} / ${z.dispensing.grams}g`);
  }
  // Trade sales: ex VAT, VAT and incl; what went on account is invoiced, not money, so it never touches the drawer.
  if (z.trade && (z.trade.count > 0 || z.trade.refundCents > 0)) {
    p.rule();
    p.bold(true).line("Trade sales (wholesale)").bold(false);
    p.row(`  Sales (${z.trade.count}) incl VAT`, zar(z.trade.inclCents));
    p.row("  Ex VAT", zar(z.trade.exCents));
    p.row("  VAT", zar(z.trade.vatCents));
    if (z.trade.refundCents > 0) p.row("  Credit notes", `-${zar(z.trade.refundCents)}`);
    p.row("  On account (not money)", zar(z.trade.onAccountCents));
  }
  p.rule();
  p.bold(true).line("Cash drawer").bold(false);
  p.row("  Opening float", zar(z.cash.floatCents));
  if (z.blind) p.row("  Expected", "after the count");
  else {
    p.row("  Cash sales less refunds", zar(z.cash.cashNetCents));
    p.bold(true).row("  Expected", zar(z.cash.expectedCents)).bold(false);
  }
  if (z.cash.countedCents != null) p.row("  Counted", zar(z.cash.countedCents));
  if (z.cash.varianceCents != null) p.bold(true).row("  Variance", `${z.cash.varianceCents > 0 ? "+" : ""}${zar(z.cash.varianceCents)}`).bold(false);
  if (z.cash.counts) for (const d of DENOMINATIONS) if (z.cash.counts[String(d)]) p.row(`  ${denomLabel(d)} x ${z.cash.counts[String(d)]}`, zar(d * z.cash.counts[String(d)]));
  if (z.notes) p.para(`Notes: ${z.notes}`);
  p.rule();
  p.feed(1).line("Cashier: ______________________");
  p.feed(1).line("Manager: ______________________");
  p.align("centre").line(`Printed ${fmtDateTime(o.at ?? new Date())}`).align("left");
  if (o.cut !== false) p.feed(3).cut();
  return p.bytes();
}
