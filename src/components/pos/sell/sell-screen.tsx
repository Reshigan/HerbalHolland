"use client";
// Sell: catalogue + basket, then compliance → payment → receipt. Prices come from the
// server's quote when online (authoritative) and from the till's cached price book
// offline; offline sales are cash only and queue in the outbox. Member-only extras
// (My Deals, welcome gifts, limited drops, event check-in and gift vouchers) need the connection.
// Trade-sale mode (a business buying on its trade account): the server prices the basket ex VAT at
// the account's trade prices, the trade basket rule replaces the member rules (the 18+ counter
// check stays), "On account" may pay within the account's terms, and nothing is ever queued.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { checkCompliance, incentiveExcluded, REG_CLASS_LABEL } from "@/lib/compliance";
import { search as searchProducts, searchIndex } from "@/lib/pos-search";
import { zar, zarWhole } from "@/lib/money";
import { voucherCodeFrom } from "@/lib/vouchers";
import { api, ApiError, errorText, OfflineError, TillError } from "../lib/api";
import { priceBasket, redeemableCents, type PricingData } from "../lib/pricing";
import { classifyBlock, dropIndex, memberNoFrom, offlineMember, parseBatchScan, parseOrderQr, rsvpTicketFrom, uuid } from "../lib/rules";
import { EMPTY_CART, type Cart, type SalePayload } from "../lib/storage";
import { buildSnapshot } from "../lib/display";
import { printerPaired } from "../lib/print";
import { usePos } from "../context";
import { Confirm, PosButton, Sheet } from "../ui";
import { Catalog, type Filter } from "./catalog";
import { CartPanel, CustomerCard, TradeCard, WelcomeGiftButton, type VariantIndex, type WelcomeGift } from "./cart-panel";
import { CustomerSheet } from "./customer-sheet";
import { TradeSheet } from "./trade-sheet";
import { ComplianceSheet } from "./compliance-sheet";
import { PaymentSheet, FULL_INVOICE_OVER_CENTS, type PaymentResult, type VoucherScan } from "./payment-sheet";
import { ReceiptSheet } from "./receipt-sheet";
import { CameraScanner } from "./scanner";
import { BatchSheet } from "./batch-sheet";
import type { BatchLookup } from "@/server/pos/batch";
import type { BootDrop, CheckInDTO, ComplianceDTO, CustomerDetail, CustomerHit, QuoteDTO, ReceiptDTO, TradeAccountDTO } from "@/server/pos/types";

/** Trade mode before the server has priced the basket: nothing to show but the lines (retail prices would mislead). */
const UNPRICED: QuoteDTO = { lines: [], subtotalCents: 0, discountCents: 0, offerCents: 0, totalCents: 0, vatCents: 0, pointsMultiplier: 1, applied: [], suggestions: [], pointsEstimate: 0, memberSavingsCents: 0, joinSavingsCents: 0, exCents: 0 };

export type SellApi = { focusSearch: () => void; openCustomer: () => void; pay: () => void; scan: (code: string) => void; add: (variantId: string) => void };

export function SellScreen({ cart, setCart, apiRef }: { cart: Cart; setCart: (c: Cart | ((c: Cart) => Cart)) => void; apiRef: React.RefObject<SellApi | null> }) {
  const pos = usePos();
  const { boot, me, online, soldBy } = pos;
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [custSheet, setCustSheet] = useState<null | "find" | "new">(null);
  const [custQuery, setCustQuery] = useState<string | undefined>();
  const [tradeSheet, setTradeSheet] = useState(false);
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
  const [batch, setBatch] = useState<BatchLookup | null>(null);
  const [payProgress, setPayProgress] = useState<{ dueCents: number; paidCents: number; tapping: boolean; method: string | null } | null>(null);
  const [voucherScan, setVoucherScan] = useState<VoucherScan | null>(null);
  const resumeCheckout = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  // One sale id per payment: a retry after a lost answer posts nothing twice (the server answers with the receipt).
  const saleIdRef = useRef<string | null>(null);
  const training = !!pos.training;
  const licensedToldRef = useRef(false);
  useEffect(() => {
    licensedToldRef.current = false;
  }, [me.id]);

  const cartRef = useRef(cart);
  cartRef.current = cart;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const licensedClasses = boot.settings.compliance.licensedOnly;
  const index: VariantIndex = useMemo(() => {
    const m: VariantIndex = new Map();
    for (const p of boot.products) for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [boot.products]);
  const drops = useMemo(() => dropIndex(boot.drops), [boot.drops]);
  // One product search for the grid and Enter-to-add (typos, plurals, category and class words).
  const productSearch = useMemo(() => {
    const cats = new Map(boot.categories.map((c) => [c.id, c.name]));
    const idx = searchIndex(boot.products, (p) => [
      p.name, p.brand, p.strain, p.tagline, cats.get(p.categoryId), REG_CLASS_LABEL[p.regClass],
      ...p.variants.flatMap((v) => [v.name, v.sku, v.barcode]),
    ]);
    return (q: string) => searchProducts(idx, q);
  }, [boot.products, boot.categories]);

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
  const key = JSON.stringify([cart.lines, cart.code, cart.customer?.id ?? null, cart.trade?.id ?? null]);
  const [server, setServer] = useState<{ key: string; q: QuoteDTO; customerId: string | null } | null>(null);
  useEffect(() => {
    // An empty basket is still quoted for a member: the server may have a welcome gift for them.
    if (!online || (!cart.lines.length && !cart.customer)) return;
    let live = true;
    const customerId = cart.customer?.id ?? null;
    const t = setTimeout(() => {
      api<QuoteDTO>("/api/pos/quote", { body: { items: cart.lines, code: cart.code, customerId, tradeAccountId: cart.trade?.id ?? null } })
        .then((q) => live && setServer({ key, q, customerId }))
        .catch(() => undefined);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);
  const fresh = online && server?.key === key;
  // Trade prices only ever come from the server: until they land (or without a connection) the basket is unpriced.
  const quote = fresh ? server!.q : cart.trade ? UNPRICED : local;

  // Welcome gift: the server's suggestion for a member who has never bought (kept while re-quoting).
  const welcomeIds = useMemo(() => new Set(boot.promotions.filter((p) => p.firstPurchaseOnly).map((p) => p.id)), [boot.promotions]);
  const memberQuote = online && cart.customer && server?.customerId === cart.customer.id ? server.q : null;
  const welcome: WelcomeGift | null = useMemo(() => {
    const s = memberQuote?.suggestions.find((x) => welcomeIds.has(x.promoId) && /add it/i.test(x.message));
    if (!s) return null;
    const giftable = boot.products.filter((p) => !incentiveExcluded(boot.settings.compliance).includes(p.regClass)); // never a medicine (s18A)
    const product = giftable.find((p) => s.productIds.includes(p.id)) ?? giftable.find((p) => s.categoryIds.includes(p.categoryId));
    if (!product || cart.lines.some((l) => index.get(l.variantId)?.product.id === product.id)) return null;
    const variant = product.variants.find((v) => v.available > 0); // never offer what isn't on the shelf
    if (!variant) return null;
    const pct = boot.promotions.find((p) => p.id === s.promoId)?.rewardPercent ?? 100;
    return { promoId: s.promoId, variantId: variant.id, label: `Welcome gift: add ${product.name} ${pct >= 100 ? "free" : `at ${pct}% off`}` };
  }, [memberQuote, welcomeIds, boot.products, boot.promotions, boot.settings.compliance, cart.lines, index]);

  // ── Basket ──────────────────────────────────────────────────────────────
  const add = useCallback(
    (variantId: string) => {
      const e = index.get(variantId);
      if (!e) return;
      const drop = drops.get(variantId);
      if (drop && !onlineRef.current) {
        pos.toast(`${drop.name} is a limited drop: member limits can't be checked offline. Sell it when the till is back online.`, "warn");
        return;
      }
      setCart((c) => {
        const ex = c.lines.find((l) => l.variantId === variantId);
        return { ...c, lines: ex ? c.lines.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + 1 } : l)) : [...c.lines, { variantId, qty: 1 }] };
      });
      if (e.variant.available <= 0) pos.toast(`${e.product.name} shows none on hand here. Check the shelf.`, "warn");
      else if (!me.canDispense && licensedClasses.includes(e.product.regClass) && !licensedToldRef.current) {
        licensedToldRef.current = true; // once per sign-in: the compliance step says it again at Charge
        pos.toast("Licensed: a dispenser must complete this sale", "warn");
      }
    },
    [index, drops, setCart, pos, me.canDispense, licensedClasses],
  );

  const scan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (cartRef.current.trade && (memberNoFrom(code) || rsvpTicketFrom(code) || voucherCodeFrom(code))) {
        // A basket is retail or trade, never both: members, tickets and vouchers (consumer money) wait for retail mode.
        pos.toast(voucherCodeFrom(code) ? "Gift vouchers can't pay for a trade sale. Leave trade mode first." : "Leave trade mode to add a member. A sale is retail or trade, never both.", "warn");
        return;
      }
      if (parseOrderQr(code)) {
        pos.openOrderScan(code); // collection QR → that order's handover
        return;
      }
      const ticket = rsvpTicketFrom(code);
      if (ticket) {
        void checkInRef.current(ticket); // event ticket QR → door check-in, member attached
        return;
      }
      const member = memberNoFrom(code);
      if (member) {
        void attachMemberRef.current(member); // member card QR (or typed member no.) → attach straight away
        return;
      }
      const voucher = voucherCodeFrom(code);
      if (voucher) {
        voucherScannedRef.current(voucher); // a gift voucher's code (email, card or balance-check QR) → the voucher tender
        return;
      }
      const hit = [...index.values()].find((e) => e.variant.barcode === code || e.variant.sku.toLowerCase() === code.toLowerCase());
      if (hit) {
        add(hit.variant.id);
        pos.toast(`Added ${hit.product.name} · ${hit.variant.name}`);
        return;
      }
      const batchCode = parseBatchScan(code);
      if (batchCode) {
        void lookupBatchRef.current(batchCode); // the code on a pack, or its lab-certificate QR → the batch
        return;
      }
      pos.toast(`Nothing on this till matches “${code}”`, "error");
    },
    [index, add, pos],
  );

  /** Gift voucher code → the Gift voucher tender on the payment sheet, looked up (opening payment first when needed). */
  const voucherScanned = (code: string) => {
    if (!onlineRef.current) {
      pos.toast(`Gift voucher ${code}: vouchers need a connection. Take another tender, or wait until the till is back online.`, "warn");
      return;
    }
    if (stageRef.current === "payment") {
      setVoucherScan({ code, n: Date.now() });
      return;
    }
    if (!cartRef.current.lines.length) {
      pos.toast(`Gift voucher ${code}: add the items first, then scan it at payment`, "warn");
      return;
    }
    setVoucherScan({ code, n: Date.now() });
    pos.toast(`Gift voucher ${code}: taking payment`);
    void checkoutRef.current();
  };
  const voucherScannedRef = useRef(voucherScanned);
  voucherScannedRef.current = voucherScanned;

  /** Batch code → status, dates, potency and stock of that lot here (read-only; needs the connection). */
  const lookupBatch = async (code: string) => {
    if (!onlineRef.current) {
      pos.toast(`Batch ${code}: looking up a batch needs a connection`, "warn");
      return;
    }
    try {
      const r = await api<{ batch: BatchLookup }>(`/api/pos/batch?code=${encodeURIComponent(code)}`);
      setBatch(r.batch);
    } catch (e) {
      pos.toast(errorText(e), "error");
    }
  };
  const lookupBatchRef = useRef(lookupBatch);
  lookupBatchRef.current = lookupBatch;

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    const exact = [...index.values()].find((e) => e.variant.barcode === q || e.variant.sku.toLowerCase() === q.toLowerCase());
    if (exact || memberNoFrom(q) || parseOrderQr(q) || rsvpTicketFrom(q) || voucherCodeFrom(q) || parseBatchScan(q)) {
      scan(q);
      setQuery("");
      return;
    }
    const matches = productSearch(q);
    if (matches.length === 1 && matches[0].variants.length === 1) {
      add(matches[0].variants[0].id);
      setQuery("");
    }
  };

  // ── Compliance ──────────────────────────────────────────────────────────
  /**
   * Trade-sale mode: the server's trade basket rule (each blocked line's reason rides on the quote) instead of the
   * member, patient and members-only rules (the buyer is a business), but the till's own 18+ counter check stays
   * for age-restricted lines (the person at the counter must be an adult).
   */
  const tradeCompliance = useCallback(
    (c: Cart, q: QuoteDTO): ComplianceDTO => {
      const blocks: ComplianceDTO["blocks"] = (q.blocks ?? []).map((message) => ({ kind: "TRADE" as const, message }));
      const restricted = boot.settings.compliance.ageRestricted;
      const needsAgeCheck = c.lines.some((l) => restricted.includes(index.get(l.variantId)?.product.regClass ?? "APPAREL"));
      if (needsAgeCheck && c.ageCheck !== "ID_SIGHTED" && c.ageCheck !== "ID_NUMBER")
        blocks.push({ kind: "AGE", message: `Age verification required (${boot.settings.compliance.minAge}+): the person buying for ${c.trade?.name ?? "the business"} must be an adult` });
      return { ok: blocks.length === 0, blocks, needsAgeCheck, needsPrescription: false, gramsInCart: 0, staffCanDispense: me.canDispense };
    },
    [boot.settings.compliance, index, me.canDispense],
  );

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
        blocks.push({ kind: "OTHER", message: "Licensed medicines need a connection to check the patient's authorisation. Remove them or wait until you're back online." });
      for (const d of new Set(c.lines.map((l) => drops.get(l.variantId)).filter((d): d is BootDrop => !!d)))
        blocks.push({ kind: "DROP", message: `${d.name} is a limited drop: member limits can't be checked offline. Remove it, or sell it when the till is back online.` });
      return { ok: blocks.length === 0, blocks, needsAgeCheck: r.needsAgeCheck, needsPrescription: r.needsPrescription, gramsInCart: r.gramsInCart, staffCanDispense: me.canDispense };
    },
    [index, drops, boot, me.canDispense, licensedClasses],
  );

  const runCompliance = useCallback(
    async (c: Cart): Promise<ComplianceDTO> => {
      if (onlineRef.current) {
        try {
          return await api<ComplianceDTO>("/api/pos/compliance", { body: { items: c.lines, customerId: c.customer?.id || null, ageCheck: c.ageCheck } });
        } catch (e) {
          if (!(e instanceof OfflineError)) throw e;
        }
      }
      return localCompliance(c);
    },
    [localCompliance],
  );

  // ── Checkout: fresh quote → compliance → payment ────────────────────────
  const checkingRef = useRef(false);
  const checkout = useCallback(
    async (c: Cart = cartRef.current) => {
      if (!c.lines.length || checkingRef.current) return;
      if (!boot.shift) {
        pos.toast("Open a shift before selling", "warn");
        pos.goTo("shift");
        return;
      }
      if (c.trade && !onlineRef.current) {
        pos.toast("Trade sales need a connection. Wait for the till to come back online, or leave trade mode.", "warn");
        return;
      }
      checkingRef.current = true;
      setChecking(true);
      setCompError(null);
      try {
        let q: QuoteDTO;
        if (c.trade) {
          // Priced, checked and invoiced by the server: no cached price book stands in for trade prices.
          q = await api<QuoteDTO>("/api/pos/quote", { body: { items: c.lines, code: c.code, tradeAccountId: c.trade.id } });
        } else {
          q = priceBasket(pricing, c.lines, { code: c.code, member: !!c.customer, tier: c.customer?.tier ?? null });
          if (onlineRef.current) {
            try {
              q = await api<QuoteDTO>("/api/pos/quote", { body: { items: c.lines, code: c.code, customerId: c.customer?.id || null } });
            } catch (e) {
              // A lost connection flips the till offline (cached prices, cash only). A slow answer doesn't: charging on cached
              // prices would miss the member's My Deals, and the server would then refuse the paid sale. Ask to try again.
              if (!(e instanceof OfflineError) || e.timedOut) throw e;
            }
          }
        }
        if (c.code && q.codeError) {
          pos.toast(q.codeError, "error");
          return;
        }
        const result = c.trade ? tradeCompliance(c, q) : await runCompliance(c);
        setPayQuote(q);
        setComp(result);
        if (!result.ok) {
          setStage("compliance");
          return;
        }
        setPayRef(pos.nextNumber().number);
        saleIdRef.current = uuid();
        setCartOpen(false);
        setStage("payment");
        pos.setBusy(true);
      } catch (e) {
        pos.toast(errorText(e), "error");
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [boot.shift, pricing, runCompliance, tradeCompliance, pos],
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
      if (c.customer && onlineRef.current && !training) {
        const r = await api<{ customer: CustomerDetail }>(`/api/pos/customers/${c.customer.id}/age-check`, { body: { method, idNumber } });
        await recheckWith({ ...c, customer: r.customer });
      } else if (c.customer && training) {
        // Training: the member's record is never written; the check counts for this practice sale only.
        await recheckWith({ ...c, customer: { ...c.customer, ageVerified: true, ageCheck: method }, ageCheck: method });
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
  const removeDrops = () => {
    const c = cartRef.current;
    void recheckWith({ ...c, lines: c.lines.filter((l) => !drops.has(l.variantId)) });
  };
  /** Trade mode: drops the lines the trade basket rule refused (their reasons came back on the quote). */
  const removeTradeBlocked = () => {
    const c = cartRef.current;
    const blocked = new Set((payQuote?.lines ?? []).filter((l) => l.blocked).map((l) => l.variantId));
    void recheckWith({ ...c, lines: c.lines.filter((l) => !blocked.has(l.variantId)) });
  };

  // ── Completing the sale ─────────────────────────────────────────────────
  const localReceipt = (p: SalePayload, q: QuoteDTO, c: Cart): ReceiptDTO => ({
    id: p.id,
    number: p.number,
    kind: "SALE",
    channel: c.trade ? "WHOLESALE" : "POS",
    title: boot.store.vatRegistered || c.trade ? "Tax invoice" : "Invoice",
    createdAt: p.createdAt,
    offline: true,
    queued: true,
    refundOf: null,
    staff: me.name,
    soldBy: soldBy?.name ?? null,
    customer: c.customer ? { id: c.customer.id, name: `${c.customer.firstName} ${c.customer.lastName ?? ""}`.trim(), memberNo: c.customer.memberNo, tier: c.customer.tier, points: c.customer.points } : null,
    lines: q.lines.map((l) => {
      const e = index.get(l.variantId)!;
      return { id: l.variantId, variantId: l.variantId, name: e.product.name, variantName: e.variant.name, sku: e.variant.sku, qty: l.qty, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents, offerCents: 0, totalCents: l.totalCents, vatCents: l.vatCents, exCents: l.exCents ?? l.totalCents - l.vatCents, refundedQty: 0 };
    }),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    offerCents: 0, // My Deals never apply offline
    offers: [],
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
    // A practice trade sale (training) still looks like a tax invoice: the account's names and VAT number; the server
    // puts the full buyer block (with the address) on a real one.
    buyer: c.trade ? { name: c.trade.legalName !== c.trade.name ? `${c.trade.legalName} (trading as ${c.trade.name})` : c.trade.legalName, address: "Address on the trade account", ...(c.trade.vatNumber ? { vatNumber: c.trade.vatNumber } : {}) } : p.buyer,
    trade: c.trade
      ? { accountId: c.trade.id, number: c.trade.number, name: c.trade.name, terms: c.trade.terms, paymentDays: c.trade.paymentDays, onAccountCents: p.payments.filter((t) => t.method === "ACCOUNT").reduce((s, t) => s + t.amountCents, 0), creditedCents: 0, dueAt: null, orderNumber: null }
      : null,
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
    setPayProgress(null);
    setVoucherScan(null);
    saleIdRef.current = null;
    setFilter({ kind: "all" });
    pos.setBusy(false);
    setDone({ receipt, invoiceTo });
    if (!receipt.queued && !receipt.training) void pos.refreshBoot();
    // Paired printer: print with the sale (the drawer pulse rides on the receipt for cash); no printer: the Print
    // button stays. The drawer opens on cash either way when the setting is on (never in training).
    const cash = receipt.payments.some((p) => p.method === "CASH");
    if (printerPaired(pos.printer) && pos.printer.autoPrint) pos.print({ kind: "receipt", receipt, drawer: cash });
    else if (cash) pos.openDrawer("cash");
  };

  const completeSale = async (r: PaymentResult) => {
    const q = payQuote!;
    const c = cartRef.current;
    const { seq, number } = pos.nextNumber();
    const unit = new Map(q.lines.map((l) => [l.variantId, l.unitPriceCents]));
    // A gift voucher is redeemed on the server as the sale posts: never on a sale rung up or queued offline.
    const hasVoucher = r.tenders.some((t) => t.method === "VOUCHER");
    if (hasVoucher && !onlineRef.current && !training)
      throw new TillError("Gift voucher needs a connection", "The till is offline, so the gift voucher can't be redeemed and this sale won't be queued with it. Remove the voucher payment and take another tender, or wait for the connection and try again.");
    // A trade sale is priced, checked and invoiced on the account by the server: it can't be queued for later.
    if (c.trade && !onlineRef.current && !training)
      throw new TillError("Trade sale needs a connection", "The till is offline, so this trade sale can't be priced or invoiced on the account, and it won't be queued. Wait for the connection and try again, or leave trade mode and ring it up as a retail sale.");
    const payload: SalePayload = {
      id: saleIdRef.current ?? uuid(),
      number,
      seq,
      createdAt: new Date().toISOString(),
      offline: !onlineRef.current,
      shiftId: boot.shift?.id ?? null,
      customerId: c.customer?.id || null,
      memberNo: c.customer?.offline ? c.customer.memberNo : null,
      lines: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: unit.get(l.variantId) ?? 0 })),
      promoCode: c.code,
      pointsRedeemed: r.points,
      payments: r.tenders,
      ageCheck: c.ageCheck ?? undefined,
      buyer: r.buyer,
      invoiceEmail: null,
      staffId: me.id,
      soldById: soldBy?.id ?? null, // a dispenser completing someone else's basket: the sale is theirs
      trade: c.trade ? { tradeAccountId: c.trade.id } : null,
    };
    if (training) {
      // Sandbox: nothing is posted, queued, printed for real, taken from stock or awarded, and the receipt says so.
      pos.commitSeq(seq);
      const receipt: ReceiptDTO = { ...localReceipt(payload, q, c), offline: false, queued: false, training: true, title: boot.store.vatRegistered ? "Tax invoice" : "Invoice" };
      pos.trainingSale(receipt);
      finish(receipt, null, c);
      return;
    }
    if (!payload.offline) {
      try {
        const res = await api<{ receipt: ReceiptDTO; invoiceTo: string | null }>("/api/pos/sales", { body: payload, timeoutMs: 30_000 });
        pos.commitSeq(seq);
        finish(res.receipt, res.invoiceTo, c);
        return;
      } catch (e) {
        // A limited drop refused the sale (e.g. the member bought their limit online a moment ago).
        const drop = e instanceof ApiError && e.status === 422 ? (boot.drops ?? []).find((d) => e.message.startsWith(d.name)) : undefined;
        if (drop)
          throw new TillError(
            "Limited drop: this sale can't go through",
            `${errorText(e)}. Remove the payment below, then go back to the basket and take the drop items out or reduce them.`,
          );
        if (!(e instanceof OfflineError)) throw e; // shown on the payment sheet
        if (hasVoucher)
          throw new TillError(
            "Gift voucher needs a connection",
            `${errorText(e)}. This sale wasn't queued: a gift voucher is redeemed on the server. Check Sales in case it went through; otherwise try again when the connection is back, or remove the voucher payment and take another tender.`,
          );
        if (c.trade)
          throw new TillError(
            "Trade sale needs a connection",
            `${errorText(e)}. This trade sale wasn't queued: the server prices it and invoices the account. Check Sales in case it went through; otherwise try again when the connection is back.`,
          );
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
      openCustomer: () => (cartRef.current.trade ? setTradeSheet(true) : setCustSheet("find")),
      pay: () => void checkoutRef.current(),
      scan,
      add,
    };
  });

  // Customer display: what the person being served may see, on every change of the sale.
  const { display: publishDisplay, idleMessages } = pos;
  useEffect(() => {
    publishDisplay(
      buildSnapshot({
        store: { name: boot.store.name, code: boot.store.code },
        cart,
        quote,
        productOf: (id) => {
          const e = index.get(id);
          return e && { name: e.product.name, variantName: e.variant.name, regClass: e.product.regClass };
        },
        licensedClasses,
        stage: done ? "done" : stage === "payment" ? "pay" : "basket",
        pay: payProgress,
        done: done?.receipt ?? null,
        idle: idleMessages,
        training,
      }),
    );
  }, [publishDisplay, boot.store.name, boot.store.code, cart, quote, index, licensedClasses, stage, payProgress, done, idleMessages, training]);

  /** Member card QR / member number → attach the member (prices re-quote at their tier). */
  const attachMember = async (memberNo: string) => {
    if (cartRef.current.trade) {
      pos.toast("Leave trade mode to add a member. A sale is retail or trade, never both.", "warn");
      return;
    }
    if (!onlineRef.current) {
      pickCustomer(offlineMember(memberNo), `${memberNo} added (checked when the till reconnects)`, "warn");
      return;
    }
    try {
      const r = await api<{ customers: CustomerHit[] }>(`/api/pos/customers?q=${encodeURIComponent(memberNo)}`);
      if (r.customers.length !== 1) {
        setCustQuery(memberNo);
        setCustSheet("find");
        return;
      }
      const d = await api<{ customer: CustomerDetail }>(`/api/pos/customers/${r.customers[0].id}`);
      pickCustomer(d.customer);
    } catch (e) {
      pos.toast(errorText(e), "error");
    }
  };
  const attachMemberRef = useRef(attachMember);
  attachMemberRef.current = attachMember;
  // Back online with a member taken from their card offline: look them up properly (prices re-quote at their tier).
  const offlineNo = cart.customer?.offline ? cart.customer.memberNo : null;
  useEffect(() => {
    if (online && offlineNo) void attachMemberRef.current(offlineNo);
  }, [online, offlineNo]);

  const pickCustomer = (c: CustomerDetail, message = `${c.firstName} added to the sale`, tone: "ok" | "warn" = "ok") => {
    setCart((x) => ({ ...x, customer: c, ageCheck: null, trade: null })); // a member ends trade mode: never both
    setCustSheet(null);
    setCustQuery(undefined);
    pos.toast(message, tone);
    if (resumeCheckout.current) {
      resumeCheckout.current = false;
      void checkout({ ...cartRef.current, customer: c, ageCheck: null, trade: null });
    }
  };

  // ── Trade-sale mode ─────────────────────────────────────────────────────
  /** The account chosen: the basket re-quotes at its trade prices (ex VAT); any member and counter check go. */
  const pickTrade = (a: TradeAccountDTO) => {
    setCart((x) => ({ ...x, trade: a, customer: null, ageCheck: null }));
    setTradeSheet(false);
    pos.toast(a.status === "ON_HOLD" ? `Trade sale for ${a.name}. The account is on hold, so money only.` : `Trade sale for ${a.name} (prices ex VAT)`, a.status === "ON_HOLD" ? "warn" : "ok");
  };
  /** Back to retail: the account goes and the basket re-quotes at shelf prices. */
  const leaveTrade = () => {
    setCart((x) => ({ ...x, trade: null, ageCheck: null }));
    pos.toast("Left trade mode: back to retail prices");
  };

  /** Event ticket (HHRSVP:{code}) → door check-in at this store, today; the member joins the sale at their tier. */
  const checkIn = async (ticket: string) => {
    if (!onlineRef.current) {
      pos.toast("Offline: event check-in needs a connection. Try again when the till is back online.", "warn");
      return;
    }
    try {
      const r = await api<CheckInDTO>("/api/pos/events/checkin", { body: { code: ticket } });
      if (r.first) pickCustomer(r.customer, `Welcome to ${r.event.title}. ${r.customer.firstName} is checked in.`);
      else pickCustomer(r.customer, `Already checked in: ${r.customer.firstName}, ${r.event.title}`, "warn");
    } catch (e) {
      pos.toast(errorText(e), "error");
    }
  };
  const checkInRef = useRef(checkIn);
  checkInRef.current = checkIn;

  const addGift = (g: WelcomeGift) => {
    add(g.variantId);
    pos.toast("Welcome gift added to the basket");
  };

  const payDisabledReason = !cart.lines.length ? "Charge" : !boot.shift ? "Open a shift to sell" : cart.trade && !fresh ? (online ? "Pricing…" : "Needs a connection") : null;
  const units = cart.lines.reduce((s, l) => s + l.qty, 0);

  const panel = (
    <CartPanel
      cart={cart}
      index={index}
      quote={quote}
      priced={cart.trade ? (fresh ? "server" : "pending") : fresh || !cart.lines.length ? "server" : "local"}
      licensedClasses={licensedClasses}
      vatRegistered={boot.store.vatRegistered}
      drops={drops}
      hideSuggestions={welcome ? [welcome.promoId] : []}
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
      onDetachCustomer={() => setCart((c) => ({ ...c, customer: null, ageCheck: null }))}
      customerCard={
        cart.trade ? (
          <TradeCard account={cart.trade} ageCheck={cart.ageCheck} onLeave={leaveTrade} />
        ) : (
          <CustomerCard
            customer={cart.customer}
            ageCheck={cart.ageCheck}
            joinSavingsCents={cart.lines.length ? quote.joinSavingsCents : 0}
            online={online}
            usedOffers={quote.lines.flatMap((l) => (l.offerCents > 0 && l.offerName ? [l.offerName] : []))}
            welcome={welcome}
            onAddGift={addGift}
            onFind={() => setCustSheet("find")}
            onNew={() => setCustSheet("new")}
            onDetach={() => setCart((c) => ({ ...c, customer: null, ageCheck: null }))}
            onScan={() => setScanning("member")}
            onTrade={() => setTradeSheet(true)}
          />
        )
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
            onScanCamera={() => setScanning("product")}
            licensedClasses={licensedClasses}
            drops={drops}
            search={productSearch}
            // Phones and portrait tablets: a first-time member's welcome gift is one tap from the catalogue.
            notice={welcome && <WelcomeGiftButton gift={welcome} onAdd={addGift} />}
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
                {units > 0 && <span className="tnum absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-bold text-ink-950">{units}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {cart.trade ? `Trade · ${cart.trade.name}` : cart.customer ? `${cart.customer.firstName} ${cart.customer.lastName ?? ""}`.trim() : units ? "Basket" : "Basket is empty"}
                </span>
                <span className="block truncate text-xs text-ink-400">{units ? `${units} item${units === 1 ? "" : "s"}${quote.discountCents + quote.memberSavingsCents ? ` · −${zarWhole(quote.discountCents + quote.memberSavingsCents)}` : ""}` : "Tap products to add"}</span>
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
        training={training}
      />

      <TradeSheet open={tradeSheet} online={online} onClose={() => setTradeSheet(false)} onPick={pickTrade} />

      <BatchSheet batch={batch} onTill={!!batch && index.has(batch.variant.id)} onAdd={add} onClose={() => setBatch(null)} />

      <CameraScanner
        open={!!scanning}
        title={scanning === "member" ? "Scan member card or event ticket" : "Scan a barcode"}
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
        onRemoveDrops={removeDrops}
        onRemoveTrade={removeTradeBlocked}
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
          offerCents={payQuote.offerCents ?? 0}
          reference={payRef}
          online={online}
          tapProvider={training ? "SIMULATED" : boot.tapProvider}
          points={cart.customer && !cart.trade ? { balance: cart.customer.points, eligibleCents: redeemableCents(payQuote), minRedeem: boot.settings.loyalty.minRedeem } : null}
          needsBuyer={!cart.trade && payQuote.totalCents > FULL_INVOICE_OVER_CENTS}
          voucherScan={cart.trade ? null : voucherScan}
          trade={cart.trade}
          onComplete={completeSale}
          onProgress={setPayProgress}
          onClose={() => (setStage(null), setPayProgress(null), setVoucherScan(null), pos.setBusy(false))}
        />
      )}

      <ReceiptSheet
        key={done?.receipt.id}
        receipt={done?.receipt ?? null}
        invoiceTo={done?.invoiceTo ?? null}
        onPrint={() => done && pos.print({ kind: "receipt", receipt: done.receipt })}
        onDone={() => {
          setDone(null);
          pos.handoffDone(); // a dispenser who stepped in for this sale: offer the till back
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
      />

      <Confirm
        open={confirmClear}
        title="Clear the basket?"
        body="This removes every item, the member or trade account, and any promo code from this sale."
        confirmLabel="Clear basket"
        danger
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setCart(EMPTY_CART);
          setConfirmClear(false);
          setCartOpen(false);
          pos.handoffDone();
        }}
      />
    </div>
  );
}

