// "How you get it, and if it isn't right": delivery ways, fees and estimates from the settings, and the returns
// rules (@/lib/returns) in one glance, with the doors to the full policies.
import Link from "next/link";
import { IdCard, Package, Store, Truck, Undo2, Zap } from "lucide-react";
import { NO_COOLING_OFF_CLASSES, RETURN_WINDOWS, SEALED_CLASSES } from "@/lib/returns";
import { MADE_TO_ORDER_LEAD } from "@/lib/merch";
import { zar } from "@/lib/money";
import type { RegClass } from "@/lib/compliance";

export type DeliveryFacts = {
  regClass: RegClass;
  licensed: boolean;
  made: boolean;
  canCollect: boolean;
  canShip: boolean;
  sameDay: { store: string; feeCents: number; cutoffHour: number } | null;
  courier: { feeCents: number; freeOverCents: number; merchCents: number; estimate: string; note: string };
};

export function DeliveryReturns({ f, className }: { f: DeliveryFacts; className?: string }) {
  const sealed = SEALED_CLASSES.includes(f.regClass);
  const noCoolingOff = NO_COOLING_OFF_CLASSES.includes(f.regClass);
  const rows: { icon: React.ReactNode; title: string; sub: string }[] = [];
  if (f.canCollect) rows.push({ icon: <Store className="h-4 w-4" />, title: "Click & collect · free", sub: f.licensed ? "Handed over by our pharmacist after an ID check" : "Usually ready within 2 hours, during store hours" });
  if (f.sameDay && f.canShip) rows.push({ icon: <Zap className="h-4 w-4" />, title: `Same-day from ${f.sameDay.store} · ${zar(f.sameDay.feeCents)}`, sub: `Order by ${f.sameDay.cutoffHour}:00 · free for Bloom and Harvest members` });
  if (f.canShip)
    rows.push(
      f.made
        ? { icon: <Package className="h-4 w-4" />, title: `Made to order · courier ${zar(f.courier.merchCents)}`, sub: `Made for you and delivered in ${MADE_TO_ORDER_LEAD}` }
        : { icon: <Truck className="h-4 w-4" />, title: `Courier · ${zar(f.courier.feeCents)}, free over ${zar(f.courier.freeOverCents)}`, sub: `Arrives ${f.courier.estimate} · ${f.courier.note}` },
    );
  if (f.canCollect || f.canShip) rows.push({ icon: <IdCard className="h-4 w-4" />, title: "Adults 18+", sub: "ID checked on collection and on delivery" });
  rows.push({
    icon: <Undo2 className="h-4 w-4" />,
    title: noCoolingOff ? "Returns: faulty or not as described" : `Returns: ${RETURN_WINDOWS.coolingOffDays} days to change your mind`,
    sub: noCoolingOff
      ? `Medicines can't be returned once dispensed unless there's something wrong with them: ${RETURN_WINDOWS.defectMonths} months under the CPA.`
      : `${sealed ? "Unopened and sealed, " : ""}from delivery or collection — and ${RETURN_WINDOWS.defectMonths} months if it's faulty or not as described.`,
  });
  return (
    <div className={className}>
      <h2 className="eyebrow text-brand-500">Delivery &amp; returns</h2>
      <ul className="mt-3 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/60">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-3 px-4 py-3 text-sm">
            <span className="mt-0.5 shrink-0 text-brand-500">{r.icon}</span>
            <span>
              <span className="block font-semibold text-white">{r.title}</span>
              <span className="block text-ink-400">{r.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-450">
        <Link href="/legal/delivery" className="underline hover:text-white">
          Delivery policy
        </Link>
        {" · "}
        <Link href="/legal/returns" className="underline hover:text-white">
          Returns &amp; refunds
        </Link>
      </p>
    </div>
  );
}
