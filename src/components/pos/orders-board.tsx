"use client";
// Online orders for this store: New → Picking → Ready → Handover, each card timed against
// the 15-minute ready SLA. Handover checks the collection code, 18+ ID, a dispenser for
// licensed items and takes payment if unpaid; delivery orders are dispatched with tracking.
import { useEffect, useMemo, useState } from "react";
import { Bike, Clock, IdCard, Package, PackageCheck, Pill, RefreshCw, ShieldCheck, ShoppingBag, Truck, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtTime } from "@/lib/format";
import { api, errorText } from "./lib/api";
import { orderSla } from "./lib/rules";
import { usePos } from "./context";
import { Alert, CheckRow, Chip, EmptyPanel, Field, PosButton, Segmented, SelectInput, Sheet, Spinner, TextInput, TextArea } from "./ui";
import { PaymentSheet, type PaymentResult } from "./sell/payment-sheet";
import type { OrderCard } from "@/server/pos/types";

type Column = "new" | "picking" | "ready" | "handover";
const COLUMNS: { key: Column; label: string; statuses: OrderCard["status"][] }[] = [
  { key: "new", label: "New", statuses: ["PLACED"] },
  { key: "picking", label: "Picking", statuses: ["PICKING"] },
  { key: "ready", label: "Ready", statuses: ["READY"] },
  { key: "handover", label: "Handover", statuses: ["OUT_FOR_DELIVERY", "COMPLETED"] },
];

const FULFIL: Record<OrderCard["fulfilment"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  COLLECT: { label: "Click & collect", icon: ShoppingBag },
  SAME_DAY: { label: "Same-day delivery", icon: Bike },
  COURIER: { label: "Courier", icon: Truck },
};

const COURIERS = ["Herbal Holland driver", "The Courier Guy", "Pargo", "Bob Go", "Other courier"];

export function OrdersBoard() {
  const pos = usePos();
  const { orders, online, refreshOrders } = pos;
  const [col, setCol] = useState<Column>("new");
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState<OrderCard | null>(null);
  const [action, setAction] = useState<null | "handover" | "dispatch" | "delivered" | "cancel">(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void refreshOrders();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [refreshOrders]);

  const grouped = useMemo(() => {
    const g: Record<Column, OrderCard[]> = { new: [], picking: [], ready: [], handover: [] };
    for (const o of orders ?? []) {
      const c = COLUMNS.find((x) => x.statuses.includes(o.status));
      if (c) g[c.key].push(o);
    }
    g.handover.sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    return g;
  }, [orders]);

  async function advance(o: OrderCard, to: "PICKING" | "READY") {
    setBusyId(o.id);
    try {
      await api(`/api/pos/orders/${o.id}`, { body: { to } });
      pos.toast(to === "PICKING" ? `Picking ${o.code}` : `${o.code} is ready — the customer has been notified`);
      await refreshOrders();
    } catch (e) {
      pos.toast(errorText(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  const primary = (o: OrderCard) => {
    if (o.status === "PLACED") return { label: "Start picking", run: () => void advance(o, "PICKING"), icon: Package };
    if (o.status === "PICKING") return { label: "Mark ready", run: () => void advance(o, "READY"), icon: PackageCheck };
    if (o.status === "READY" && o.fulfilment === "COLLECT") return { label: "Hand over", run: () => (setOpen(o), setAction("handover")), icon: ShoppingBag };
    if (o.status === "READY") return { label: "Dispatch", run: () => (setOpen(o), setAction("dispatch")), icon: Truck };
    if (o.status === "OUT_FOR_DELIVERY") return { label: "Mark delivered", run: () => (setOpen(o), setAction("delivered")), icon: PackageCheck };
    return null;
  };

  if (!online && !orders)
    return <EmptyPanel className="h-full" icon={<ShoppingBag className="h-6 w-6" />} title="Orders need a connection">The online order board loads when the till is back online. Sales can continue offline.</EmptyPanel>;
  if (!orders)
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );

  const card = (o: OrderCard) => {
    const sla = orderSla(o.placedAt, o.readyAt, now);
    const F = FULFIL[o.fulfilment];
    const p = primary(o);
    const done = o.status === "COMPLETED";
    return (
      <li key={o.id} className={cn("rounded-2xl bg-ink-900 ring-1 ring-ink-800", done && "opacity-70")} data-testid={`order-${o.code}`}>
        <button type="button" onClick={() => (setOpen(o), setAction(null))} className="block w-full px-4 pt-4 text-left">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono text-base font-bold tracking-wide text-white">{o.code}</div>
              <div className="mt-0.5 text-sm text-ink-300">{o.customer.name}</div>
            </div>
            {o.status === "PLACED" || o.status === "PICKING" ? (
              <Chip tone={sla.state === "late" ? "red" : sla.state === "warn" ? "amber" : "green"} icon={<Clock className="h-3 w-3" />}>
                {sla.minutes} min{sla.state === "late" ? " · late" : ""}
              </Chip>
            ) : o.readyAt ? (
              <Chip tone={sla.state === "late" ? "red" : "neutral"}>Ready in {sla.minutes} min</Chip>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="neutral" icon={<F.icon className="h-3 w-3" />}>
              {F.label}
            </Chip>
            {o.paid ? <Chip tone="green">Paid</Chip> : <Chip tone="amber">Pay {zar(o.dueCents)} in store</Chip>}
            {o.licensed && (
              <Chip tone="orange" icon={<Pill className="h-3 w-3" />}>
                Dispenser
              </Chip>
            )}
            {o.ageRestricted && (
              <Chip tone="blue" icon={<IdCard className="h-3 w-3" />}>
                ID 18+
              </Chip>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-ink-400">
            <span>
              {o.units} item{o.units === 1 ? "" : "s"} · {zar(o.totalCents)}
            </span>
            <span>{done ? `Done ${fmtTime(o.doneAt!)}` : o.status === "OUT_FOR_DELIVERY" ? `Out ${o.doneAt ? fmtTime(o.doneAt) : ""}` : `Placed ${fmtTime(o.placedAt)}`}</span>
          </div>
        </button>
        <div className="p-3 pt-3">
          {p ? (
            <PosButton variant={o.status === "READY" ? "primary" : "secondary"} className="w-full" busy={busyId === o.id} disabled={!!busyId} onClick={p.run} data-testid={`order-action-${o.code}`}>
              <p.icon className="h-4 w-4" /> {p.label}
            </PosButton>
          ) : (
            <div className="px-1 pb-1 text-center text-xs text-ink-500">{o.fulfilment === "COLLECT" ? "Collected" : "Delivered"}</div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-white">Online orders</h1>
          <p className="text-sm text-ink-400">Click &amp; collect and delivery for this store · ready within 15 minutes</p>
        </div>
        <PosButton variant="outline" onClick={() => void refreshOrders()} aria-label="Refresh orders">
          <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span>
        </PosButton>
      </div>
      <Segmented
        label="Order status"
        value={col}
        onChange={setCol}
        className="mx-4 mb-3 lg:hidden"
        fill
        options={COLUMNS.map((c) => ({ value: c.key, label: c.label, count: grouped[c.key].length }))}
      />
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 pb-4 lg:grid-cols-4 lg:overflow-hidden">
        {COLUMNS.map((c) => (
          <section key={c.key} className={cn("flex min-h-0 flex-col rounded-3xl bg-ink-950 lg:bg-ink-900/40 lg:p-2 lg:ring-1 lg:ring-ink-850", col !== c.key && "hidden lg:flex")} aria-label={`${c.label} orders`}>
            <h2 className="hidden items-center justify-between px-2 pb-2 pt-1 lg:flex">
              <span className="eyebrow text-[0.65rem] text-ink-300">{c.label}</span>
              <span className="tnum rounded-full bg-ink-800 px-2 text-xs font-bold text-ink-200">{grouped[c.key].length}</span>
            </h2>
            <ul className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-1">
              {grouped[c.key].map(card)}
              {grouped[c.key].length === 0 && <li className="rounded-2xl border border-dashed border-ink-800 px-4 py-8 text-center text-sm text-ink-500">{c.key === "handover" ? "Nothing handed over yet today" : "No orders here"}</li>}
            </ul>
          </section>
        ))}
      </div>

      <OrderSheet
        order={open}
        action={action}
        onAction={setAction}
        onClose={() => (setOpen(null), setAction(null))}
        onDone={async (msg) => {
          setOpen(null);
          setAction(null);
          pos.toast(msg);
          await refreshOrders();
        }}
        onAdvance={(o, to) => void advance(o, to)}
      />
    </div>
  );
}

function OrderSheet({
  order,
  action,
  onAction,
  onClose,
  onDone,
  onAdvance,
}: {
  order: OrderCard | null;
  action: null | "handover" | "dispatch" | "delivered" | "cancel";
  onAction: (a: null | "handover" | "dispatch" | "delivered" | "cancel") => void;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
  onAdvance: (o: OrderCard, to: "PICKING" | "READY") => void;
}) {
  const pos = usePos();
  const [code, setCode] = useState("");
  const [idOk, setIdOk] = useState(false);
  const [courier, setCourier] = useState(COURIERS[0]);
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setCode("");
    setIdOk(false);
    setTracking("");
    setReason("");
    setError(null);
    setPaying(false);
  }, [order?.id, action]);

  if (!order) return null;
  const o = order;
  const needsDispenser = o.licensed && !pos.me.canDispense;

  const post = async (body: Record<string, unknown>) => api<{ order: { trackingNo: string | null } }>(`/api/pos/orders/${o.id}`, { body });

  async function handover() {
    setError(null);
    if (o.ageRestricted && !idOk) return setError("Tick the ID check — adults 18+ only");
    setBusy(true);
    try {
      await post({ to: "COMPLETED", code, idChecked: idOk, check: true });
      if (!o.paid) {
        setPaying(true);
        pos.setBusy(true);
        return;
      }
      await post({ to: "COMPLETED", code, idChecked: idOk });
      await onDone(`${o.code} handed over to ${o.customer.name.split(" ")[0]}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function payAndHandover(r: PaymentResult) {
    await post({ to: "COMPLETED", code, idChecked: idOk, payments: r.tenders });
    pos.setBusy(false);
    setPaying(false);
    await onDone(`${o.code} paid and handed over`);
  }

  async function simple(body: Record<string, unknown>, msg: (trackingNo: string | null) => string) {
    setBusy(true);
    setError(null);
    try {
      const r = await post(body);
      await onDone(msg(r.order.trackingNo));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const title = action === "handover" ? `Hand over ${o.code}` : action === "dispatch" ? `Dispatch ${o.code}` : action === "delivered" ? `Delivered ${o.code}` : action === "cancel" ? `Cancel ${o.code}` : `Order ${o.code}`;

  return (
    <>
      <Sheet
        open={!paying}
        onClose={onClose}
        title={title}
        subtitle={`${o.customer.name} · ${o.customer.memberNo} · ${o.customer.phone}`}
        size="md"
        footer={
          action === "handover" ? (
            <PosButton variant="primary" size="lg" className="w-full" busy={busy} disabled={needsDispenser || !code.trim()} onClick={() => void handover()} data-testid="confirm-handover">
              {o.paid ? "Hand over order" : `Take payment of ${zar(o.dueCents)}`}
            </PosButton>
          ) : action === "dispatch" ? (
            <PosButton variant="primary" size="lg" className="w-full" busy={busy} onClick={() => void simple({ to: "OUT_FOR_DELIVERY", courier, trackingNo: tracking || undefined }, (t) => `${o.code} dispatched${t ? ` · tracking ${t}` : ""}`)}>
              <Truck className="h-5 w-5" /> Dispatch with {courier}
            </PosButton>
          ) : action === "delivered" ? (
            <PosButton variant="primary" size="lg" className="w-full" busy={busy} disabled={o.ageRestricted && !idOk} onClick={() => void simple({ to: "COMPLETED", idChecked: idOk }, () => `${o.code} delivered`)}>
              Confirm delivery
            </PosButton>
          ) : action === "cancel" ? (
            <PosButton variant="danger" size="lg" className="w-full" busy={busy} disabled={reason.trim().length < 3} onClick={() => void simple({ to: "CANCELLED", note: reason.trim() }, () => `${o.code} cancelled — the customer has been told`)}>
              <XCircle className="h-5 w-5" /> Cancel order
            </PosButton>
          ) : (
            <div className="flex flex-wrap justify-between gap-2">
              {["PLACED", "PICKING", "READY"].includes(o.status) ? (
                <PosButton variant="ghost" onClick={() => onAction("cancel")}>
                  Cancel order…
                </PosButton>
              ) : (
                <span />
              )}
              {o.status === "PLACED" && <PosButton variant="primary" onClick={() => (onAdvance(o, "PICKING"), onClose())}>Start picking</PosButton>}
              {o.status === "PICKING" && <PosButton variant="primary" onClick={() => (onAdvance(o, "READY"), onClose())}>Mark ready</PosButton>}
              {o.status === "READY" && <PosButton variant="primary" onClick={() => onAction(o.fulfilment === "COLLECT" ? "handover" : "dispatch")}>{o.fulfilment === "COLLECT" ? "Hand over" : "Dispatch"}</PosButton>}
              {o.status === "OUT_FOR_DELIVERY" && <PosButton variant="primary" onClick={() => onAction("delivered")}>Mark delivered</PosButton>}
            </div>
          )
        }
      >
        {error && <Alert className="mb-4">{error}</Alert>}

        {action === "handover" && (
          <div className="mb-5 space-y-4">
            <Field label="Collection code" htmlFor="collect-code" hint="The 6-digit code from the customer's SMS — or their order code">
              <TextInput id="collect-code" autoFocus inputMode="text" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-14 font-mono text-2xl tracking-[0.3em]" placeholder="••••••" />
            </Field>
            {o.ageRestricted && (
              <CheckRow checked={idOk} onChange={setIdOk} label="I've checked their ID — adults 18+ only" description={o.customer.ageVerified ? "Their age is verified on their profile; check the ID matches the member." : "Their age isn't verified yet — check an ID document."} />
            )}
            {needsDispenser && (
              <Alert tone="warn">
                <div className="font-semibold">An authorised dispenser must hand over licensed medicine.</div>
                <PosButton variant="primary" size="sm" className="mt-2" onClick={() => pos.switchUser("dispenser")}>
                  <ShieldCheck className="h-4 w-4" /> Switch to a dispenser
                </PosButton>
              </Alert>
            )}
          </div>
        )}
        {action === "dispatch" && (
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <Field label="Courier or driver" htmlFor="courier">
              <SelectInput id="courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
                {COURIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Tracking / waybill number" htmlFor="tracking" hint="Leave blank to generate one">
              <TextInput id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} className="font-mono" />
            </Field>
          </div>
        )}
        {action === "delivered" && o.ageRestricted && (
          <CheckRow className="mb-4" checked={idOk} onChange={setIdOk} label="The driver checked the recipient's ID — 18+" />
        )}
        {action === "cancel" && (
          <Field label="Reason (sent to the customer)" htmlFor="cancel-reason" className="mb-5">
            <TextArea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock after picking" />
          </Field>
        )}

        <div className="rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-white">Pick list</span>
            <span className="text-ink-400">{FULFIL[o.fulfilment].label}</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {o.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-white">
                    {l.name} · {l.variantName}
                  </span>
                  <span className="block font-mono text-xs text-ink-500">{l.sku}</span>
                </span>
                <span className="flex items-center gap-2">
                  {l.licensed && <Chip tone="orange">Rx</Chip>}
                  <span className="tnum font-display text-lg font-semibold text-white">×{l.qty}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-ink-800 pt-2 text-sm">
            <span className="text-ink-400">{o.paid ? "Paid online" : o.pointsRedeemed ? `Due in store (after ${o.pointsRedeemed} points)` : "Due in store"}</span>
            <span className="font-semibold text-white tnum">{zar(o.paid ? o.totalCents : o.dueCents)}</span>
          </div>
          {o.address && <p className="mt-3 text-sm text-ink-300">Deliver to: {o.address}{o.deliveryNotes ? ` · ${o.deliveryNotes}` : ""}</p>}
          {o.courier && (
            <p className="mt-1 text-sm text-ink-300">
              {o.courier} · tracking <span className="font-mono">{o.trackingNo}</span>
            </p>
          )}
        </div>
      </Sheet>

      <PaymentSheet
        open={paying}
        title={`Payment for order ${o.code}`}
        dueCents={o.dueCents}
        reference={o.code}
        online={pos.online}
        tapProvider={pos.boot.tapProvider}
        storeCode={pos.boot.store.code}
        onComplete={payAndHandover}
        onClose={() => (setPaying(false), pos.setBusy(false))}
      />
    </>
  );
}
