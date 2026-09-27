"use client";
// Sell: catalogue + basket, then compliance → payment → receipt. Prices come from the
// server's quote when online (authoritative) and from the till's cached price book
// offline; offline sales are cash only and queue in the outbox.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { checkCompliance } from "@/lib/compliance";
import { zar } from "@/lib/money";
import { api, errorText, OfflineError } from "../lib/api";
import { priceBasket, redeemableCents, type PricingData } from "../lib/pricing";
import { classifyBlock, memberNoFrom, uuid } from "../lib/rules";
import { EMPTY_CART, type Cart, type SalePayload } from "../lib/storage";
import { usePos } from "../context";
import { Confirm, PosButton, Sheet } from "../ui";
import { Catalog, type Filter } from "./catalog";
import { CartPanel, CustomerCard, type VariantIndex } from "./cart-panel";
import { CustomerSheet } from "./customer-sheet";
import { ComplianceSheet } from "./compliance-sheet";
import { PaymentSheet, FULL_INVOICE_OVER_CENTS, type PaymentResult } from "./payment-sheet";
import { ReceiptSheet } from "./receipt-sheet";
import { CameraScanner, cameraScanSupported } from "./scanner";
import type { ComplianceDTO, CustomerDetail, QuoteDTO, ReceiptDTO } from "@/server/pos/types";

export type SellApi = { focusSearch: () => void; openCustomer: () => void; pay: () => void; scan: (code: string) => void; add: (variantId: string) => void };

export function SellScreen({ cart, setCart, apiRef }: { cart: Cart; setCart: (c: Cart | ((c: Cart) => Cart)) => void; apiRef: React.RefObject<SellApi | null> }) {
  const pos = usePos();
  const { boot, me, online } = pos;
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [custSheet, setCustSheet] = useState<null | "find" | "new">(null);
  const [custQuery, setCustQuery] = useState<string | undefined>();
  const [scanning, setScanning] = useState<null | "product" | "member">(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stage, setStage] = useState<null | "compliance" | "payment">(null);
  const [comp, setComp] = useState<ComplianceDTO | null>(null);
  const [compBusy, setCompBusy] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [payQuote, setPayQuote] = useState<QuoteDTO | null>(null);
  const [payRef, setPayRef] = useState("");
  const [done, setDone] = useState<{ receipt: ReceiptDTO; invoiceTo: string | null } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [canCamera, setCanCamera] = useState(false);
  const resumeCheckout = useRef(false);

  const cartRef = useRef(cart);
  cartRef.current = cart;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => setCanCamera(cameraScanSupported()), []);

  const licensedClasses = boot.settings.compliance.licensedOnly;
  const index: VariantIndex = useMemo(() => {
    const m: VariantIndex = new Map();
    for (const p of boot.products) for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [boot.products]);

  const pricing: PricingData = useMemo(
    () => ({
      storeId: boot.store.id,
      regionId: boot.store.regionId,
      vatRegistered: boot.store.vatRegistered,
      compliance: boot.settings.compliance,
      earnPer100: boot.settings.loyalty.earnPer100,
      tierSavingsPct: boot.settings.loyalty.tierSavingsPct,
      variants: Object.fromEntries(
        [...index].map(([id, e]) => [
          id,
          { id, productId: e.product.id, categoryId: e.product.categoryId, regClass: e.product.regClass, rrpCents: e.variant.rrpCents, shelfCents: e.variant.shelfCents, markdownPct: e.variant.markdownPct },
        ]),
      ),
      promotions: boot.promotions,
      priceLists: boot.priceLists,
    }),
    [boot, index],
  );

  // Instant local price, replaced by the server's quote as soon as it lands.
  const local = useMemo(
    () => priceBasket(pricing, cart.lines, { code: cart.code, member: !!cart.customer, tier: cart.customer?.tier ?? null }),
    [pricing, cart.lines, cart.code, cart.customer],
  );
  const key = JSON.stringify([cart.lines, cart.code, cart.customer?.id ?? null]);
  const [server, setServer] = useState<{ key: string; q: QuoteDTO } | null>(null);
  useEffect(() => {
    if (!online || !cart.lines.length) return;
    let live = true;
    const t = setTimeout(() => {
      api<QuoteDTO>("/api/pos/quote", { body: { items: cart.lines, code: cart.code, customerId: cart.customer?.id ?? null } })
        .then((q) => live && setServer({ key, q }))
        .catch(() => undefined);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);
  const fresh = online && server?.key === key;
  const quote = fresh ? server!.q : local;

  // ── Basket ──────────────────────────────────────────────────────────────
  const add = useCallback(
    (variantId: string) => {
      const e = index.get(variantId);
      if (!e) return;
      setCart((c) => {
        const ex = c.lines.find((l) => l.variantId === variantId);
        return { ...c, lines: ex ? c.lines.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + 1 } : l)) : [...c.lines, { variantId, qty: 1 }] };
      });
      if (e.variant.available <= 0) pos.toast(`${e.product.name} shows none on hand here — check the shelf`, "warn");
    },
    [index, setCart, pos],
  );

  const scan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const member = memberNoFrom(code);
      if (member) {
        setCustQuery(member);
        setCustSheet("find");
        return;
      }
      const hit = [...index.values()].find((e) => e.variant.barcode === code || e.variant.sku.toLowerCase() === code.toLowerCase());
      if (hit) {
        add(hit.variant.id);
        pos.toast(`Added ${hit.product.name} · ${hit.variant.name}`);
      } else pos.toast(`Nothing on this till matches “${code}”`, "error");
    },
    [index, add, pos],
  );

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    const exact = [...index.values()].find((e) => e.variant.barcode === q || e.variant.sku.toLowerCase() === q.toLowerCase());
    if (exact || memberNoFrom(q)) {
      scan(q);
      setQuery("");
      return;
    }
    const words = q.toLowerCase().split(/\s+/);
    const matches = boot.products.filter((p) => words.every((w) => `${p.name} ${p.brand} ${p.strain ?? ""} ${p.variants.map((v) => v.name).join(" ")}`.toLowerCase().includes(w)));
    if (matches.length === 1 && matches[0].variants.length === 1) {
      add(matches[0].variants[0].id);
      setQuery("");
    }
  };

  // ── Compliance ──────────────────────────────────────────────────────────
  const localCompliance = useCallback(
    (c: Cart): ComplianceDTO => {
      const items = c.lines
        .filter((l) => index.has(l.variantId))
        .map((l) => {
          const e = index.get(l.variantId)!;
          return { name: `${e.product.name} · ${e.variant.name}`, regClass: e.product.regClass, grams: e.variant.grams, qty: l.qty, tobaccoRelated: e.product.tobaccoRelated };
        });
      const cu = c.customer;
      const r = checkCompliance({
        items,
        channel: "POS",
        customer: cu ? { ageVerified: cu.ageVerified, age: cu.age, patient: cu.patient ? { active: true, remainingGrams: cu.patient.remainingGrams, authNumber: cu.patient.authNumber } : null } : null,
        storeLicences: boot.store.licences,
        ageCheckedAtCounter: c.ageCheck === "ID_SIGHTED" || c.ageCheck === "ID_NUMBER",
        staffCanDispense: me.canDispense,
        settings: boot.settings.compliance,
      });
      const blocks = r.blocks.map((message) => ({ kind: classifyBlock(message), message }));
      if (items.some((i) => licensedClasses.includes(i.regClass)))
        blocks.push({ kind: "OTHER", message: "Licensed medicines need a connection to check the patient's authorisation — remove them or wait until you're back online" });
      return { ok: blocks.length === 0, blocks, needsAgeCheck: r.needsAgeCheck, needsPrescription: r.needsPrescription, gramsInCart: r.gramsInCart, staffCanDispense: me.canDispense };
    },
    [index, boot, me.canDispense, licensedClasses],
  );

  const runCompliance = useCallback(
    async (c: Cart): Promise<ComplianceDTO> => {
      if (onlineRef.current) {
        try {
          return await api<ComplianceDTO>("/api/pos/compliance", { body: { items: c.lines, customerId: c.customer?.id ?? null, ageCheck: c.ageCheck } });
        } catch (e) {
          if (!(e instanceof OfflineError)) throw e;
        }
      }
      return localCompliance(c);
    },
    [localCompliance],
  );

  // ── Checkout: fresh quote → compliance → payment ────────────────────────
  const checkout = useCallback(
    async (c: Cart = cartRef.current) => {
      if (!c.lines.length) return;
      if (!boot.shift) {
        pos.toast("Open a shift before selling", "warn");
        pos.goTo("shift");
        return;
      }
      setChecking(true);
      setCompError(null);
      try {
        let q = priceBasket(pricing, c.lines, { code: c.code, member: !!c.customer, tier: c.customer?.tier ?? null });
        if (onlineRef.current) {
          try {
            q = await api<QuoteDTO>("/api/pos/quote", { body: { items: c.lines, code: c.code, customerId: c.customer?.id ?? null } });
          } catch (e) {
            if (!(e instanceof OfflineError)) throw e;
          }
        }
        if (c.code && q.codeError) {
          pos.toast(q.codeError, "error");
          return;
        }
        const result = await runCompliance(c);
        setPayQuote(q);
        setComp(result);
        if (!result.ok) {
          setStage("compliance");
          return;
        }
        setPayRef(pos.nextNumber().number);
        setCartOpen(false);
        setStage("payment");
        pos.setBusy(true);
      } catch (e) {
        pos.toast(errorText(e), "error");
      } finally {
        setChecking(false);
      }
    },
    [boot.shift, pricing, runCompliance, pos],
  );
  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;

  const recheckWith = async (next: Cart) => {
    setCart(next);
    if (!next.lines.length) {
      setStage(null);
      return;
    }
    await checkout(next);
  };

  const onAgeCheck = async (method: "ID_SIGHTED" | "ID_NUMBER", idNumber?: string) => {
    const c = cartRef.current;
    setCompBusy(true);
    setCompError(null);
    try {
      if (c.customer && onlineRef.current) {
        const r = await api<{ customer: CustomerDetail }>(`/api/pos/customers/${c.customer.id}/age-check`, { body: { method, idNumber } });
        await recheckWith({ ...c, customer: r.customer });
      } else await recheckWith({ ...c, ageCheck: method });
    } catch (e) {
      setCompError(errorText(e));
    } finally {
      setCompBusy(false);
    }
  };

  const removeWhere = (classes: readonly string[]) => {
    const c = cartRef.current;
    void recheckWith({ ...c, lines: c.lines.filter((l) => !classes.includes(index.get(l.variantId)?.product.regClass ?? "")) });
  };

  // ── Completing the sale ─────────────────────────────────────────────────
  const localReceipt = (p: SalePayload, q: QuoteDTO, c: Cart): ReceiptDTO => ({
    id: p.id,
    number: p.number,
    kind: "SALE",
    channel: "POS",
    title: boot.store.vatRegistered ? "Tax invoice" : "Invoice",
    createdAt: p.createdAt,
    offline: true,
    queued: true,
    refundOf: null,
    staff: me.name,
    customer: c.customer ? { id: c.customer.id, name: `${c.customer.firstName} ${c.customer.lastName ?? ""}`.trim(), memberNo: c.customer.memberNo, tier: c.customer.tier, points: c.customer.points } : null,
    lines: q.lines.map((l) => {
      const e = index.get(l.variantId)!;
      return { id: l.variantId, variantId: l.variantId, name: e.product.name, variantName: e.variant.name, sku: e.variant.sku, qty: l.qty, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents, totalCents: l.totalCents, vatCents: l.vatCents, refundedQty: 0 };
    }),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    memberSavingsCents: q.memberSavingsCents,
    totalCents: q.totalCents,
    vatCents: q.vatCents,
    pointsEarned: 0,
    pointsRedeemed: p.pointsRedeemed,
    payments: p.payments.map((t) => ({
      method: t.method,
      amountCents: t.amountCents,
      tenderedCents: t.tenderedCents ?? null,
      changeCents: t.changeCents ?? null,
      provider: t.provider ?? null,
      reference: t.reference ?? null,
      cardBrand: t.cardBrand ?? null,
      cardLast4: t.cardLast4 ?? null,
    })),
    promoCode: p.promoCode,
    invoiceEmail: null,
    buyer: p.buyer,
    note: null,
    refunds: [],
    invoiceUrl: null,
  });

  const finish = (receipt: ReceiptDTO, invoiceTo: string | null, c: Cart) => {
    pos.adjustStock(c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })));
    setCart(EMPTY_CART);
    setStage(null);
    setPayQuote(null);
    setComp(null);
    setFilter({ kind: "all" });
    pos.setBusy(false);
    setDone({ receipt, invoiceTo });
    if (!receipt.queued) void pos.refreshBoot();
  };

  const completeSale = async (r: PaymentResult) => {
    const q = payQuote!;
    const c = cartRef.current;
    const { seq, number } = pos.nextNumber();
    const unit = new Map(q.lines.map((l) => [l.variantId, l.unitPriceCents]));
    const payload: SalePayload = {
      id: uuid(),
      number,
      seq,
      createdAt: new Date().toISOString(),
      offline: !onlineRef.current,
      shiftId: boot.shift?.id ?? null,
      customerId: c.customer?.id ?? null,
      lines: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: unit.get(l.variantId) ?? 0 })),
      promoCode: c.code,
      pointsRedeemed: r.points,
      payments: r.tenders,
      ageCheck: c.ageCheck ?? undefined,
      buyer: r.buyer,
      invoiceEmail: null,
      staffId: me.id,
    };
    if (!payload.offline) {
      try {
        const res = await api<{ receipt: ReceiptDTO; invoiceTo: string | null }>("/api/pos/sales", { body: payload, timeoutMs: 30_000 });
        pos.commitSeq(seq);
        finish(res.receipt, res.invoiceTo, c);
        return;
      } catch (e) {
        if (!(e instanceof OfflineError)) throw e; // shown on the payment sheet
        payload.offline = true; // the customer has paid: keep the sale and sync it later
      }
    }
    pos.queueSale(payload, q.totalCents);
    pos.commitSeq(seq);
    finish(localReceipt(payload, q, c), c.customer?.email ?? null, c);
  };

  // ── Keyboard / scanner API for the app shell ────────────────────────────
  useEffect(() => {
    apiRef.current = {
      focusSearch: () => searchRef.current?.focus(),
      openCustomer: () => setCustSheet("find"),
      pay: () => void checkoutRef.current(),
      scan,
      add,
    };
  });

  const pickCustomer = (c: CustomerDetail) => {
    setCart((x) => ({ ...x, customer: c, ageCheck: null }));
    setCustSheet(null);
    setCustQuery(undefined);
    pos.toast(`${c.firstName} added to the sale`);
    if (resumeCheckout.current) {
      resumeCheckout.current = false;
      void checkout({ ...cartRef.current, customer: c, ageCheck: null });
    }
  };

  const payDisabledReason = !cart.lines.length ? "Charge" : !boot.shift ? "Open a shift to sell" : null;
  const units = cart.lines.reduce((s, l) => s + l.qty, 0);

  const panel = (
    <CartPanel
      cart={cart}
      index={index}
      quote={quote}
      priced={fresh || !cart.lines.length ? "server" : "local"}
      licensedClasses={licensedClasses}
      onQty={(id, qty) => setCart((c) => ({ ...c, lines: c.lines.map((l) => (l.variantId === id ? { ...l, qty } : l)) }))}
      onRemove={(id) => setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.variantId !== id) }))}
      onClear={() => setConfirmClear(true)}
      onCode={(code) => setCart((c) => ({ ...c, code }))}
      onSuggestion={(s) => {
        setFilter({ kind: "suggestion", label: s.message, productIds: s.productIds, categoryIds: s.categoryIds });
        setQuery("");
        setCartOpen(false);
      }}
      onPay={() => void checkout()}
      payDisabledReason={payDisabledReason}
      checking={checking}
      customerCard={
        <CustomerCard
          customer={cart.customer}
          ageCheck={cart.ageCheck}
          joinSavingsCents={cart.lines.length ? quote.joinSavingsCents : 0}
          onFind={() => setCustSheet("find")}
          onNew={() => setCustSheet("new")}
          onDetach={() => setCart((c) => ({ ...c, customer: null, ageCheck: null }))}
          onScan={canCamera ? () => setScanning("member") : undefined}
        />
      }
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Catalogue">
        <div className="min-h-0 flex-1">
          <Catalog
            ref={searchRef}
            boot={boot}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            onSubmitSearch={submitSearch}
            onAdd={add}
            onScanCamera={canCamera ? () => setScanning("product") : undefined}
            licensedClasses={licensedClasses}
          />
        </div>
        {/* Phones and portrait tablets: the basket total and Charge are always one tap away. */}
        <div className="shrink-0 border-t border-ink-850 bg-ink-950 px-3 py-2.5 lg:hidden" data-testid="charge-bar">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-ink-900 px-4 text-left ring-1 ring-ink-800 active:scale-[0.99]"
              data-testid="open-basket"
            >
              <span className="relative">
                <ShoppingBag className="h-6 w-6 text-ink-200" />
                {units > 0 && <span className="tnum absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-oranje-500 px-1 text-[0.65rem] font-bold text-ink-950">{units}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{cart.customer ? `${cart.customer.firstName} ${cart.customer.lastName ?? ""}`.trim() : units ? "Basket" : "Basket is empty"}</span>
                <span className="block truncate text-xs text-ink-400">{units ? `${units} item${units === 1 ? "" : "s"}${quote.discountCents + quote.memberSavingsCents ? ` · saved ${zar(quote.discountCents + quote.memberSavingsCents)}` : ""}` : "Tap products to add"}</span>
              </span>
              <span className="font-display text-lg font-semibold text-white tnum">{zar(quote.totalCents)}</span>
            </button>
            <PosButton variant="primary" className="h-14 px-6 text-base" disabled={!!payDisabledReason || checking} busy={checking} onClick={() => void checkout()} data-testid="charge">
              Charge
            </PosButton>
          </div>
        </div>
      </section>
      <aside className="hidden w-[25rem] shrink-0 border-l border-ink-850 bg-ink-950 lg:block xl:w-[27rem]" aria-label="Basket">
        {panel}
      </aside>

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Basket" subtitle={units ? `${units} item${units === 1 ? "" : "s"}` : undefined} size="lg" className="lg:hidden sm:h-[min(56rem,calc(100dvh-2rem))]" bodyClassName="p-0 sm:p-0 overflow-hidden">
        {panel}
      </Sheet>

      <CustomerSheet
        open={!!custSheet}
        mode={custSheet ?? "find"}
        onMode={setCustSheet}
        onClose={() => (setCustSheet(null), setCustQuery(undefined), (resumeCheckout.current = false))}
        onPick={pickCustomer}
        online={online}
        joinUrl={boot.joinUrl}
        minAge={boot.settings.compliance.minAge}
        initialQuery={custQuery}
      />

      <CameraScanner
        open={!!scanning}
        title={scanning === "member" ? "Scan member QR" : "Scan a barcode"}
        onClose={() => setScanning(null)}
        onResult={(code) => {
          setScanning(null);
          scan(code);
        }}
      />

      <ComplianceSheet
        open={stage === "compliance"}
        result={comp}
        customer={cart.customer}
        minAge={boot.settings.compliance.minAge}
        online={online}
        busy={compBusy || checking}
        error={compError}
        onClose={() => setStage(null)}
        onAgeCheck={(m, id) => void onAgeCheck(m, id)}
        onFindPatient={() => {
          setStage(null);
          resumeCheckout.current = true;
          setCustSheet("find");
        }}
        onRemoveLicensed={() => removeWhere(licensedClasses)}
        onRemoveRestricted={() => removeWhere(boot.settings.compliance.ageRestricted)}
        onSwitchUser={() => {
          setStage(null);
          pos.switchUser("dispenser", () => void checkoutRef.current());
        }}
      />

      {payQuote && (
        <PaymentSheet
          open={stage === "payment"}
          title="Take payment"
          dueCents={payQuote.totalCents}
          savingsCents={payQuote.memberSavingsCents}
          discountCents={payQuote.discountCents}
          reference={payRef}
          online={online}
          tapProvider={boot.tapProvider}
          storeCode={boot.store.code}
          points={cart.customer ? { balance: cart.customer.points, eligibleCents: redeemableCents(payQuote), minRedeem: boot.settings.loyalty.minRedeem } : null}
          needsBuyer={payQuote.totalCents > FULL_INVOICE_OVER_CENTS}
          onComplete={completeSale}
          onClose={() => (setStage(null), pos.setBusy(false))}
        />
      )}

      <ReceiptSheet
        key={done?.receipt.id}
        receipt={done?.receipt ?? null}
        invoiceTo={done?.invoiceTo ?? null}
        onPrint={() => done && pos.print({ kind: "receipt", receipt: done.receipt })}
        onDone={() => {
          setDone(null);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
      />

      <Confirm
        open={confirmClear}
        title="Clear the basket?"
        body="This removes every item, the customer and any promo code from this sale."
        confirmLabel="Clear basket"
        danger
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setCart(EMPTY_CART);
          setConfirmClear(false);
          setCartOpen(false);
        }}
      />
    </div>
  );
}

