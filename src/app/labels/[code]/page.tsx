// Shelf signs for a store, printed from the back office on an office printer: shelf-edge labels on standard A4 label
// sheets (21 per sheet, 63.5 × 38.1 mm: Avery L7160 / Tower W221 and equivalents) or A6 shelf talkers (four to an A4,
// cut on the marks). Prices, member prices and what may be shown come from the menu board's data (boardMenu): the
// store's walk-in price today, the member price only where incentives are allowed, licensed medicines never in medical
// mode. Each label carries the date it was printed, so a stale price is easy to spot.
import type { Metadata } from "next";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { APP_URL } from "@/server/invoices";
import { boardMenu, type BoardItem } from "@/server/menu-board";
import { getClasses } from "@/server/shop/access";
import { Mark, Wordmark } from "@/components/brand/logo";
import { QrCode } from "@/components/shop/qr";
import { PrintButton } from "@/components/shop/print-button";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";

export const metadata: Metadata = { title: "Shelf labels", robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ cat?: string; size?: string }> };
type Label = BoardItem & { category: string };

const PER = { edge: 21, talker: 4 } as const;
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const PRINT_CSS = `
@page{size:A4;margin:0}
@media print{html,body{background:#fff!important}.no-print{display:none!important}.sheet{margin:0!important;box-shadow:none!important}}
.sheet{width:210mm;height:297mm;background:#fff;color:#0c0a09;break-after:page;overflow:hidden}
.sheet:last-child{break-after:auto}
.edge{display:grid;grid-template-columns:repeat(3,63.5mm);grid-auto-rows:38.1mm;column-gap:2.54mm;padding:15.15mm 7.25mm}
.talker{display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm}
.talker>div{outline:0.2mm dashed #d6ccc4;outline-offset:-0.1mm}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;

export default async function ShelfLabels({ params, searchParams }: Props) {
  const [{ code }, q] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const classes = await getClasses();
  const menu = await boardMenu(store.id, { includeLicensed: classes.thcMode === "ADULT_USE" });
  const size = q.size === "talker" ? "talker" : "edge";
  const cats = menu.map((c) => ({ slug: c.slug, name: c.name, n: c.items.length }));
  const items: Label[] = menu.filter((c) => !q.cat || c.slug === q.cat).flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));
  const today = fmtDate(new Date());
  const base = APP_URL();

  return (
    <main className="min-h-screen bg-ink-100 pb-16 print:bg-white print:pb-0">
      <style>{PRINT_CSS}</style>
      <form className="no-print sticky top-0 z-10 flex flex-wrap items-end gap-3 border-b border-ink-200 bg-white px-4 py-3 text-sm text-ink-800">
        <div className="mr-auto">
          <div className="eyebrow text-brand-700">Shelf signs · {store.name}</div>
          <div className="text-ink-500">
            {items.length} {items.length === 1 ? "product" : "products"} · {Math.ceil(items.length / PER[size]) || 0} A4 {Math.ceil(items.length / PER[size]) === 1 ? "sheet" : "sheets"}
          </div>
        </div>
        <label className="grid gap-1">
          <span className="font-semibold">Category</span>
          <select name="cat" defaultValue={q.cat ?? ""} className="rounded-xl border border-ink-200 px-3 py-2">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.n})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Sign</span>
          <select name="size" defaultValue={size} className="rounded-xl border border-ink-200 px-3 py-2">
            <option value="edge">Shelf-edge labels (21 per A4 label sheet)</option>
            <option value="talker">Shelf talkers (A6, 4 per A4)</option>
          </select>
        </label>
        <button className="rounded-full border border-ink-300 px-4 py-2 font-semibold">Show</button>
        <PrintButton label="Print" />
        <p className="w-full text-xs text-ink-500">
          {size === "edge" ? "Load 63.5 × 38.1 mm label sheets (Avery L7160, Tower W221 or equivalent). " : "Plain A4, cut on the dashed lines. "}
          Print at 100% (actual size, no &ldquo;fit to page&rdquo;). Prices are today&apos;s; reprint when they change.
        </p>
      </form>

      {chunk(items, PER[size]).map((page, n) => (
        <section key={n} className={`sheet mx-auto mt-6 shadow-lg ${size}`}>
          {page.map((i) => (size === "edge" ? <Edge key={i.variantId} i={i} today={today} base={base} /> : <Talker key={i.variantId} i={i} today={today} base={base} />))}
        </section>
      ))}
      {!items.length && <p className="no-print mx-auto mt-10 max-w-md text-center text-ink-500">Nothing ranged in this category yet.</p>}
    </main>
  );
}

/** Shelf-edge label, 63.5 × 38.1 mm: name and size on the left, the price and a QR to the product page on the right. */
function Edge({ i, today, base }: { i: Label; today: string; base: string }) {
  return (
    <div className="flex h-full overflow-hidden border-l-[1.6mm] border-brand-500 py-[2.4mm] pl-[2.4mm] pr-[2.6mm] font-sans">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-[1mm] text-brand-700">
          <Mark className="h-[3.4mm] w-[3.4mm]" detail={false} />
          <span className="truncate text-[5.5pt] font-bold uppercase tracking-[0.14em]">{i.category}</span>
        </div>
        <div className="mt-[1mm] line-clamp-2 font-display text-[9.5pt] font-semibold leading-[1.08]">{i.name}</div>
        <div className="mt-[0.6mm] truncate text-[7pt] text-ink-600">{i.variant}</div>
        <div className="mt-auto truncate text-[5pt] text-ink-500">
          {today} · incl. VAT · Adults 18+
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between pl-[1.5mm]">
        <div className="text-right">
          <div className="tnum font-display text-[14pt] font-bold leading-none">{zar(i.priceCents)}</div>
          {i.wasCents != null && <div className="tnum mt-[0.4mm] text-[6pt] text-ink-500 line-through">{zar(i.wasCents)}</div>}
          {i.memberCents != null && <div className="tnum mt-[0.6mm] text-[6.5pt] font-bold text-brand-700">Members {zar(i.memberCents)}</div>}
        </div>
        <QrCode value={`${base}/p/${i.slug}`} label={`${i.name} online`} margin={0} className="h-[11mm] w-[11mm]" />
      </div>
    </div>
  );
}

/** A6 shelf talker: one product, big, for the front of a shelf or a counter stand. */
function Talker({ i, today, base }: { i: Label; today: string; base: string }) {
  return (
    <div className="flex h-full flex-col p-[9mm]">
      <div className="flex items-center justify-between text-brand-500">
        <span className="flex items-center gap-[2mm]">
          <Mark className="h-[9mm] w-[9mm]" />
          <Wordmark className="text-[8pt] text-ink-950" />
        </span>
        <span className="text-[6.5pt] font-bold uppercase tracking-[0.16em] text-brand-700">{i.category}</span>
      </div>
      <div className="mt-[7mm] h-[1.2mm] w-[16mm] rounded-full bg-brand-500" />
      <h2 className="mt-[5mm] line-clamp-3 font-display text-[22pt] font-semibold leading-[1.04] tracking-tight">{i.name}</h2>
      <div className="mt-[2.5mm] text-[10pt] text-ink-600">{i.variant}</div>
      {i.tagline && <p className="mt-[3.5mm] line-clamp-3 text-[9pt] leading-snug text-ink-700">{i.tagline}</p>}
      <div className="mt-auto flex items-end justify-between gap-[4mm]">
        <div>
          {i.wasCents != null && <div className="tnum text-[10pt] text-ink-500 line-through">Was {zar(i.wasCents)}</div>}
          <div className="tnum font-display text-[30pt] font-bold leading-none">{zar(i.priceCents)}</div>
          {i.memberCents != null && (
            <div className="tnum mt-[2.5mm] inline-block rounded-full bg-brand-500 px-[3mm] py-[1mm] text-[9pt] font-bold text-ink-950">Members pay {zar(i.memberCents)}</div>
          )}
        </div>
        <div className="w-[24mm] shrink-0 text-center">
          <QrCode value={`${base}/p/${i.slug}`} label={`${i.name}: details online`} margin={1} className="w-full" />
          <div className="mt-[1mm] text-[6pt] leading-tight text-ink-600">Scan for details</div>
        </div>
      </div>
      <div className="mt-[5mm] border-t border-ink-200 pt-[2mm] text-[6pt] text-ink-500">Prices include VAT · price at {today} · Adults 18+ only</div>
    </div>
  );
}
