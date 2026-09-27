import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { orderForStore } from "@/server/store/orders";
import { FULFIL_LABEL, plural } from "@/server/store/rules";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { PROVINCES } from "@/lib/sa";
import { Logo } from "@/components/brand/logo";
import { BackLink, PrintStyles } from "@/components/store/ui";
import { PrintButton } from "@/components/store/action-form";

export const metadata = { title: "Pick list" };

export default async function PickListPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const d = await orderForStore(store.id, id);
  if (!d) notFound();
  const { order: o, lines } = d;
  const units = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <PrintStyles />
      <div className="no-print mb-4 flex items-center justify-between">
        <BackLink href={`/store/${store.code}/orders/${o.id}`}>Order {o.code}</BackLink>
        <PrintButton label="Print pick list" />
      </div>
      <article className="mx-auto max-w-3xl rounded-2xl border border-ink-150 bg-white p-8 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-4">
          <div>
            <div className="eyebrow text-ink-500">Pick list · {store.name}</div>
            <h1 className="mt-1 font-mono text-3xl font-bold tracking-wider text-ink-950">{o.code}</h1>
            <p className="mt-1 text-sm text-ink-600">
              {FULFIL_LABEL[o.fulfilment]} · placed {fmtDateTime(o.createdAt)} · {plural(lines.length, "line")}, {plural(units, "unit")}
            </p>
          </div>
          <Logo className="text-ink-950 [&_svg]:text-brand-500" />
        </header>

        <section className="mt-4 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="eyebrow text-ink-400">Member</div>
            <div className="mt-1 font-semibold text-ink-900">
              {o.customer.firstName} {o.customer.lastName ?? ""}
            </div>
            <div className="text-ink-600">Member {o.customer.memberNo}</div>
          </div>
          <div>
            <div className="eyebrow text-ink-400">{o.fulfilment === "COLLECT" ? "Collection" : "Deliver to"}</div>
            {o.fulfilment === "COLLECT" ? (
              <div className="mt-1 text-ink-700">At the counter — check the collection code and ID (18+).</div>
            ) : (
              <div className="mt-1 text-ink-700">
                {o.addressLine}, {o.suburb}, {o.city}, {o.province ? PROVINCES[o.province] : ""} {o.postalCode}
                {o.deliveryNotes && <div className="text-xs text-ink-500">“{o.deliveryNotes}”</div>}
              </div>
            )}
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-300 text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
              <th className="w-10 py-2">✓</th>
              <th className="py-2">Item</th>
              <th className="py-2">Pick from batch</th>
              <th className="py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-ink-150 align-top">
                <td className="py-3">
                  <span className="inline-block h-5 w-5 rounded border-2 border-ink-400" aria-hidden />
                </td>
                <td className="py-3 pr-4">
                  <div className="font-semibold text-ink-950">
                    {l.variant.product.name} · {l.variant.name}
                  </div>
                  <div className="font-mono text-xs text-ink-500">{l.variant.sku}</div>
                  {l.licensed && <div className="text-xs font-semibold text-ink-700">Licensed — dispenser to hand over</div>}
                  {l.made && <div className="text-xs font-semibold text-ink-700">Made to order — the merch partner ships it; nothing to pick</div>}
                </td>
                <td className="py-3 pr-4">
                  {l.pick.map((p) => (
                    <div key={p.code} className="font-mono text-xs text-ink-800">
                      {p.code} ×{p.qty}
                      {p.expiresAt && <span className="font-sans text-ink-500"> · exp {fmtDate(p.expiresAt)}</span>}
                    </div>
                  ))}
                  {l.short > 0 && <div className="text-xs font-semibold text-rose-600">{l.short} not on hand — tell a manager</div>}
                  {!l.pick.length && !l.short && <span className="text-ink-400">—</span>}
                </td>
                <td className="tnum py-3 text-right font-display text-lg font-bold text-ink-950">{l.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-10 grid grid-cols-3 gap-6 text-xs text-ink-500">
          {["Picked by", "Checked by", "Time packed"].map((x) => (
            <div key={x}>
              <div className="h-8 border-b border-ink-300" />
              <div className="mt-1">{x}</div>
            </div>
          ))}
        </footer>
        <p className="mt-6 text-[0.7rem] text-ink-400">Adults 18+ only. Keep out of reach of children. Printed {fmtDateTime(new Date())} by {user.name}.</p>
      </article>
    </>
  );
}
