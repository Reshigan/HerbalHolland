"use client";
// The till. A client app over /api/pos/* that keeps selling offline: the bootstrap is
// cached locally, cash sales queue in an outbox and sync (idempotently) when back online.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, CloudOff, History, Loader2, Lock, RefreshCw, ShieldCheck, ShoppingBag, Store, UploadCloud, Wallet, Wifi } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtTime } from "@/lib/format";
import { api, ApiError, errorText, OfflineError, onPosEvent, setTrainingGuard } from "./lib/api";
import {
  claimDevice, commitSeq as storeCommitSeq, enqueue, EMPTY_CART, loadAuth, loadBoot, loadCart, loadOutbox, loadSession, peekSeq,
  saveAuth, saveBoot, saveCart, saveSession, updateQueued, type AuthState, type Cart, type OutboxItem, type SalePayload,
  loadAuditQueue, loadDisplay, loadIdleMs, loadPrinter, loadTraining, loadTrainingSales, saveAuditQueue, saveDisplay, saveIdleMs, savePrinter, saveTraining, saveTrainingSales,
  type DisplaySettings, type QueuedAudit,
} from "./lib/storage";
import { rememberPin, verifyOffline, canUnlockOffline } from "./lib/pin";
import { parseOrderQr, receiptNumber, uuid } from "./lib/rules";
import { voucherCodeFrom } from "@/lib/vouchers";
import { DEFAULT_PRINTER, kickDrawer, printerPaired, sendBytes, type PrinterSettings } from "./lib/print";
import { receiptBytes } from "./lib/receipt";
import { zReportBytes } from "./lib/print-z";
import { TRAINING_SHIFT, trainingNumber, type TrainingState } from "./lib/training";
import { DISPLAY_CHANNEL, DISPLAY_HEARTBEAT_MS, idleMessages as buildIdleMessages, idleSnapshot, type DisplaySnapshot } from "./lib/display";
import { idleDelay, saleIsOpen } from "./lib/idle";
import { incentiveExcluded } from "@/lib/compliance";
import { PosContext, type PosCtx, type PosTab, type PrintDoc } from "./context";
import { LockScreen, initials } from "./lock-screen";
import { SellScreen, type SellApi } from "./sell/sell-screen";
import { OrdersBoard } from "./orders-board";
import { SalesHistory } from "./sales-history";
import { StockLookup } from "./stock-lookup";
import { ShiftPanel } from "./shift-panel";
import { PrintArea } from "./print";
import { TrainingBanner, TrainingOutline, TrainingTour } from "./training";
import { QuietScreen } from "./quiet-screen";
import { Chip, PosButton, Sheet, Alert } from "./ui";
import type { BootData, BootShift, OrderCard, ReceiptDTO, SessionInfo, StaffTile } from "@/server/pos/types";

const IDLE_LOCK_MS = 5 * 60_000;
const SYNC_EVERY_MS = 15_000;
const BOOT_EVERY_MS = 3 * 60_000;
const ORDERS_EVERY_MS = 20_000;

type Toast = { id: number; msg: string; tone: "ok" | "warn" | "error" };

const TABS: { key: PosTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "sell", label: "Sell", icon: ShoppingBag },
  { key: "orders", label: "Orders", icon: Store },
  { key: "sales", label: "Sales", icon: History },
  { key: "stock", label: "Stock", icon: Boxes },
  { key: "shift", label: "Shift", icon: Wallet },
];

export function PosApp({ deviceId }: { deviceId: string }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [boot, setBootState] = useState<BootData | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [auth, setAuthState] = useState<AuthState>({ me: null, locked: true, at: 0 });
  const [switching, setSwitching] = useState<"dispenser" | "manager" | null>(null);
  const [expired, setExpired] = useState(false);
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<PosTab>("sell");
  const [cart, setCartState] = useState<Cart>(EMPTY_CART);
  const [orders, setOrders] = useState<OrderCard[] | null>(null);
  const [ordersAt, setOrdersAt] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<{ doc: PrintDoc; n: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [orderScan, setOrderScan] = useState<string | null>(null);
  // Till hardware & modes (device-local): printer, training sandbox, customer display, quiet hours.
  const [printer, setPrinterState] = useState<PrinterSettings>(DEFAULT_PRINTER);
  const [training, setTrainingState] = useState<TrainingState | null>(null);
  const [tour, setTour] = useState(false);
  const [displaySettings, setDisplayState] = useState<DisplaySettings | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [idleMs, setIdleMs] = useState(3 * 60_000);

  const authRef = useRef(auth);
  authRef.current = auth;
  const bootRef = useRef(boot);
  bootRef.current = boot;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const busyRef = useRef(false);
  const syncingRef = useRef(false);
  const afterUnlock = useRef<(() => void) | null>(null);
  const sellApi = useRef<SellApi | null>(null);
  const printerRef = useRef(printer);
  printerRef.current = printer;
  const trainingRef = useRef(training);
  trainingRef.current = training;
  const displayRef = useRef(displaySettings);
  displayRef.current = displaySettings;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastSnapRef = useRef<DisplaySnapshot | null>(null);
  const remotePost = useRef<{ timer: ReturnType<typeof setTimeout> | null; pending: DisplaySnapshot | null }>({ timer: null, pending: null });

  const setAuth = useCallback((a: AuthState) => {
    setAuthState(a);
    saveAuth(a);
  }, []);
  const setBoot = useCallback((b: BootData) => {
    setBootState(b);
    saveBoot(b);
  }, []);
  const setCart = useCallback((c: Cart | ((c: Cart) => Cart)) => {
    setCartState((prev) => {
      const next = typeof c === "function" ? c(prev) : c;
      saveCart(next);
      return next;
    });
  }, []);
  const setPrinter = useCallback((p: PrinterSettings) => {
    setPrinterState(p);
    savePrinter(p);
  }, []);
  const setTraining = useCallback((t: TrainingState | null) => {
    setTrainingState(t);
    saveTraining(t);
    setTrainingGuard(!!t);
  }, []);
  const setDisplaySettings = useCallback((d: DisplaySettings | null) => {
    setDisplayState(d);
    saveDisplay(d);
  }, []);

  const toast = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  // ── Data ────────────────────────────────────────────────────────────────
  const refreshBoot = useCallback(async () => {
    try {
      setBoot(await api<BootData>("/api/pos/bootstrap"));
      setBootError(null);
    } catch (e) {
      if (!(e instanceof OfflineError) && !(e instanceof ApiError && e.status === 401)) setBootError(errorText(e));
    }
  }, [setBoot]);

  const refreshOrders = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderCard[]; at: string }>("/api/pos/orders");
      setOrders(r.orders);
      setOrdersAt(r.at);
    } catch {
      /* keep the last board; the indicator shows we're offline */
    }
  }, []);

  /** Sensitive actions taken offline (drawer opened, training started/ended) reach the audit log on the next sync. */
  const flushAudit = useCallback(async () => {
    const q = loadAuditQueue().filter((e) => e.deviceId === deviceId);
    if (!q.length) return;
    try {
      await api("/api/pos/audit", { body: { entries: q.map(({ deviceId: _d, ...e }) => e) }, quiet401: true, sync: true });
      saveAuditQueue(loadAuditQueue().filter((e) => e.deviceId !== deviceId));
    } catch {
      /* still offline or locked: it stays queued */
    }
  }, [deviceId]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    void flushAudit();
    const items = loadOutbox();
    setOutbox(items);
    if (!items.length) return;
    syncingRef.current = true;
    setSyncing(true);
    let synced = 0;
    for (const item of items) {
      if (item.deviceId && item.deviceId !== deviceId) continue; // queued on this browser under a previous pairing
      try {
        await api("/api/pos/sales", { body: item.payload, quiet401: true, timeoutMs: 30_000, sync: true });
        updateQueued(item.payload.id, () => null);
        synced++;
      } catch (e) {
        if (e instanceof OfflineError || (e instanceof ApiError && e.status === 401)) break;
        updateQueued(item.payload.id, (i) => ({ ...i, attempts: i.attempts + 1, error: errorText(e) }));
      }
    }
    setOutbox(loadOutbox());
    syncingRef.current = false;
    setSyncing(false);
    if (synced) {
      toast(`${synced} offline sale${synced === 1 ? "" : "s"} synced`);
      void refreshBoot();
    }
  }, [refreshBoot, toast, deviceId, flushAudit]);

  /** Checks the server session still matches who the till thinks is signed in. */
  const revalidate = useCallback(
    async (initial = false) => {
      try {
        const s = await api<SessionInfo>("/api/pos/session");
        setSession(s);
        saveSession(s);
        const cur = authRef.current;
        if (s.me && cur.me?.id === s.me.id && !cur.locked) {
          setAuth({ me: s.me, locked: false, at: Date.now() });
          await refreshBoot();
        } else if (!cur.locked || (initial && cur.me && !s.me)) {
          // Signed in offline, or the session expired: ask for the PIN again.
          setExpired(!!cur.me && !cur.locked);
          setAuth({ me: null, locked: true, at: Date.now() });
        }
      } catch {
        /* offline: keep going with the cached session */
      }
    },
    [refreshBoot, setAuth],
  );

  // ── Boot sequence ───────────────────────────────────────────────────────
  useEffect(() => {
    claimDevice(deviceId);
    setSession(loadSession());
    setBootState(loadBoot());
    setOutbox(loadOutbox());
    setCartState(loadCart());
    const a = loadAuth();
    if (a) setAuthState(a);
    authRef.current = a ?? authRef.current;
    setOnline(navigator.onLine);
    // Device-local settings and modes. The training guard is armed before the first request goes out.
    const pr = loadPrinter();
    if (pr) setPrinterState({ ...DEFAULT_PRINTER, ...pr });
    const tr = loadTraining();
    setTrainingState(tr);
    trainingRef.current = tr;
    setTrainingGuard(!!tr);
    setDisplayState(loadDisplay());
    const ms = idleDelay(window.location.search, loadIdleMs());
    if (new URLSearchParams(window.location.search).has("idleMs")) saveIdleMs(ms);
    setIdleMs(ms);
    setReady(true);
    void revalidate(true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/pos" })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // Warm the offline cache with the shell and every asset this page loaded.
          const urls = [location.pathname, ...performance.getEntriesByType("resource").map((e) => e.name)].filter((u) => {
            const url = new URL(u, location.href);
            return url.origin === location.origin && !url.pathname.startsWith("/api/");
          });
          reg.active?.postMessage({ type: "CACHE_URLS", urls });
        })
        .catch(() => undefined);
    }
  }, [deviceId, revalidate]);

  // Connectivity: browser events + request outcomes.
  useEffect(() => {
    const up = () => {
      const was = onlineRef.current;
      setOnline(true);
      if (!was) {
        void revalidate();
        void syncNow();
      }
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const off = onPosEvent((e) => {
      if (e === "offline") down();
      else if (e === "online") {
        if (!onlineRef.current && navigator.onLine) up();
      } else if (e === "locked") {
        setExpired(!!authRef.current.me);
        setAuth({ me: null, locked: true, at: Date.now() });
      } else if (e === "unpaired") window.location.assign("/pos/pair");
    });
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      off();
    };
  }, [revalidate, syncNow, setAuth]);

  const unlocked = !!auth.me && !auth.locked;

  // Background loops: outbox sync, bootstrap refresh, order board.
  useEffect(() => {
    if (!ready) return;
    void syncNow();
    const t = setInterval(() => {
      if (!navigator.onLine) return;
      // Offline after a server hiccup: probe cheaply; a success flips the till back online (and syncs).
      if (!onlineRef.current) void api("/api/pos/session", { quiet401: true, timeoutMs: 8_000 }).catch(() => undefined);
      else void syncNow();
    }, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [ready, syncNow]);
  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => navigator.onLine && !busyRef.current && void refreshBoot(), BOOT_EVERY_MS);
    return () => clearInterval(t);
  }, [unlocked, refreshBoot]);
  useEffect(() => {
    if (!unlocked || !online) return;
    void refreshOrders();
    const t = setInterval(() => void refreshOrders(), ORDERS_EVERY_MS);
    return () => clearInterval(t);
  }, [unlocked, online, refreshOrders]);

  // ── Locking ─────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    setSwitching(null);
    setExpired(false);
    setAuth({ me: null, locked: true, at: Date.now() });
    if (onlineRef.current) void api("/api/pos/session", { method: "DELETE", quiet401: true }).catch(() => undefined);
  }, [setAuth]);

  const switchUser = useCallback((reason: "dispenser" | "manager", then?: () => void) => {
    afterUnlock.current = then ?? null;
    setSwitching(reason);
  }, []);

  const unlock = useCallback(
    async (staff: StaffTile, pin: string): Promise<string | null> => {
      const finish = (me: StaffTile, offline: boolean) => {
        setAuth({ me, locked: false, offline, at: Date.now() });
        setSwitching(null);
        setExpired(false);
        const then = afterUnlock.current;
        afterUnlock.current = null;
        if (then) setTimeout(then, 50);
      };
      try {
        const r = await api<{ me: StaffTile }>("/api/pos/session", { body: { userId: staff.id, pin }, quiet401: true });
        void rememberPin(r.me.id, pin);
        finish(r.me, false);
        void refreshBoot();
        void syncNow();
        return null;
      } catch (e) {
        if (e instanceof OfflineError) {
          if (!canUnlockOffline(staff.id)) return "Offline — this staff member hasn't signed in on this till today";
          if (await verifyOffline(staff.id, pin)) {
            finish(staff, true);
            return null;
          }
          return "That PIN isn't right";
        }
        return errorText(e);
      }
    },
    [refreshBoot, setAuth, syncNow],
  );

  // Auto-lock after inactivity (never mid-payment).
  useEffect(() => {
    if (!unlocked) return;
    let t = setTimeout(() => !busyRef.current && lock(), IDLE_LOCK_MS);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => (busyRef.current ? reset() : lock()), IDLE_LOCK_MS);
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [unlocked, lock]);

  // Keyboard: F2 search · F4 customer · F9 pay · keyboard-wedge barcode scanners.
  useEffect(() => {
    if (!unlocked) return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (switching) return;
      const dialog = !!document.querySelector("[role=dialog]");
      if (e.key === "F2" || e.key === "F4" || e.key === "F9") {
        if (dialog) return; // sheets own the keyboard (Esc closes them)
        e.preventDefault();
        setTab("sell");
        setTimeout(() => (e.key === "F2" ? sellApi.current?.focusSearch() : e.key === "F4" ? sellApi.current?.openCustomer() : sellApi.current?.pay()), 0);
        return;
      }
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      // Event creation time, not handling time: a busy main thread mustn't break up a fast scan.
      const now = e.timeStamp;
      if (e.key === "Enter") {
        const code = buf;
        buf = "";
        if (code.length < 4 || now - last >= 120) return;
        // Sheets own the keyboard — except a gift voucher scanned while the Sell tab's payment sheet is open, which
        // fills its tender (the handover sheet's voucher field takes a scan directly, as it has the focus).
        if (dialog && (!voucherCodeFrom(code) || tabRef.current !== "sell")) return;
        e.preventDefault();
        if (parseOrderQr(code)) {
          // Customer's collection QR → straight to that order's handover.
          setOrderScan(code);
          setTab("orders");
        } else {
          setTab("sell");
          setTimeout(() => sellApi.current?.scan(code), 0);
        }
      } else if (e.key.length === 1) {
        buf = now - last > 80 ? e.key : buf + e.key;
        last = now;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlocked, switching]);

  // Printing: the paired ESC/POS printer (Bluetooth / USB) when there is one; otherwise the document is rendered into
  // the print area and the browser's print dialog opens (receipt-styled print CSS in print.tsx).
  useEffect(() => {
    if (!printDoc) return;
    const t = setTimeout(() => window.print(), 60);
    return () => clearTimeout(t);
  }, [printDoc]);
  const classOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of boot?.products ?? []) for (const v of p.variants) m.set(v.id, p.regClass);
    return m;
  }, [boot?.products]);
  const classRef = useRef(classOf);
  classRef.current = classOf;
  const print = useCallback(
    async (doc: PrintDoc) => {
      const p = printerRef.current;
      const b = bootRef.current;
      if (printerPaired(p) && b) {
        try {
          const excluded = incentiveExcluded(b.settings.compliance);
          const licensed = (id: string) => b.settings.compliance.licensedOnly.includes(classRef.current.get(id) as never);
          const noIncentive = (id: string) => excluded.includes(classRef.current.get(id) as never);
          const bytes =
            doc.kind === "receipt"
              ? receiptBytes(doc.receipt, { cols: p.cols, codePage: p.codePage, store: b.store, devicePrefix: b.device.prefix, licensed, noIncentive, training: !!trainingRef.current, drawer: doc.drawer && p.drawerOnCash ? p.drawerPin : null })
              : zReportBytes(doc.report, { cols: p.cols, codePage: p.codePage });
          await sendBytes(p, bytes);
          toast(doc.kind === "receipt" ? "Receipt printed" : "Report printed");
          return;
        } catch (e) {
          toast(`${errorText(e)} — opening the print dialog instead`, "warn");
        }
      }
      setPrintDoc((prev) => ({ doc, n: (prev?.n ?? 0) + 1 }));
    },
    [toast],
  );

  // ── Cash drawer, audit trail, training mode ─────────────────────────────
  const recordAudit = useCallback(
    (action: QueuedAudit["action"], note?: string) => {
      const me = authRef.current.me;
      if (!me) return;
      const entry: QueuedAudit = { id: uuid(), action, at: new Date().toISOString(), staffId: me.id, staffName: me.name, note, deviceId };
      const queue = () => saveAuditQueue([...loadAuditQueue(), entry]);
      if (!onlineRef.current) return queue();
      api("/api/pos/audit", { body: { entries: [{ id: entry.id, action, at: entry.at, staffId: me.id, staffName: me.name, note }] }, quiet401: true }).catch(queue);
    },
    [deviceId],
  );
  const kick = useCallback(async () => {
    const p = printerRef.current;
    if (!printerPaired(p)) {
      toast("No receipt printer is paired — the drawer opens through the printer (Shift → This till)", "warn");
      return;
    }
    try {
      await kickDrawer(p);
    } catch (e) {
      toast(errorText(e), "error");
    }
  }, [toast]);
  const openDrawer = useCallback(
    (reason: "cash" | "manual") => {
      if (trainingRef.current) {
        if (reason === "manual") toast("Training — the drawer stays shut", "warn");
        return;
      }
      if (reason === "cash") {
        // Tablets without a printer have no drawer to open: nothing to say.
        if (printerRef.current.drawerOnCash && printerPaired(printerRef.current)) void kick();
        return;
      }
      // Outside a sale: a manager's PIN, then the kick is logged under that manager.
      switchUser("manager", () => {
        void kick();
        recordAudit("drawer.open", "Opened outside a sale");
        toast("Drawer opened — logged");
      });
    },
    [kick, recordAudit, toast, switchUser],
  );

  /** A queued sale the server refused stays in the outbox until a manager discards it (the sale is rung up again). */
  const discardQueued = useCallback(
    (id: string) => {
      const item = loadOutbox().find((i) => i.payload.id === id);
      if (!item) return;
      switchUser("manager", () => {
        updateQueued(id, () => null);
        setOutbox(loadOutbox());
        recordAudit("outbox.discard", `${item.payload.number} · ${zar(item.totalCents)} · ${item.error ?? "discarded"}`.slice(0, 200));
        toast(`${item.payload.number} discarded — logged`);
      });
    },
    [recordAudit, switchUser, toast],
  );

  const startTraining = useCallback(() => {
    const go = () => {
      const me = authRef.current.me!;
      setTraining({ since: new Date().toISOString(), byId: me.id, byName: me.name, seq: 0, sales: 0, tourDone: false });
      saveTrainingSales([]);
      setCart(EMPTY_CART);
      setTab("sell");
      setTour(true);
      recordAudit("training.start");
      toast("Training mode on — nothing is real", "warn");
    };
    if (authRef.current.me?.role === "MANAGER") go();
    else switchUser("manager", go);
  }, [recordAudit, setCart, setTraining, switchUser, toast]);
  const exitTraining = useCallback(() => {
    switchUser("manager", () => {
      recordAudit("training.end", `${trainingRef.current?.sales ?? 0} practice sales`);
      setTraining(null);
      saveTrainingSales([]);
      setCart(EMPTY_CART);
      setTour(false);
      toast("Training mode off — the till is live again");
    });
  }, [recordAudit, setCart, setTraining, switchUser, toast]);
  const trainingSale = useCallback(
    (receipt: ReceiptDTO) => {
      saveTrainingSales([...loadTrainingSales(), receipt]);
      const t = trainingRef.current;
      if (t) setTraining({ ...t, sales: t.sales + 1 });
    },
    [setTraining],
  );

  // ── Customer display ────────────────────────────────────────────────────
  const idleMessages = useMemo(
    () => (boot ? buildIdleMessages({ promotions: boot.promotions, products: boot.products, compliance: boot.settings.compliance, nextEvent: boot.nextEvent }) : []),
    [boot],
  );
  const postRemote = useCallback((snap: DisplaySnapshot) => {
    const d = displayRef.current;
    if (!d?.remote || !onlineRef.current) return;
    const r = remotePost.current;
    r.pending = snap;
    if (r.timer) return; // trailing edge: the latest snapshot goes when the timer fires
    r.timer = setTimeout(() => {
      r.timer = null;
      const s = r.pending;
      r.pending = null;
      if (s) void api("/api/pos/display", { body: { key: d.key, snapshot: s }, quiet401: true }).catch(() => undefined);
    }, 300);
  }, []);
  const display = useCallback(
    (snap: DisplaySnapshot) => {
      lastSnapRef.current = snap;
      channelRef.current?.postMessage(snap);
      postRemote(snap);
    },
    [postRemote],
  );
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    ch.onmessage = (e) => {
      if ((e.data as { type?: string })?.type === "hello" && lastSnapRef.current) ch.postMessage(lastSnapRef.current);
    };
    channelRef.current = ch;
    const t = setInterval(() => lastSnapRef.current && postRemote(lastSnapRef.current), DISPLAY_HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      ch.close();
      channelRef.current = null;
    };
  }, [postRemote]);

  const openOrderScan = useCallback((text: string) => {
    setOrderScan(text);
    setTab("orders");
  }, []);
  const clearOrderScan = useCallback(() => setOrderScan(null), []);

  // Locked: the customer display goes back to its idle loop.
  useEffect(() => {
    if (unlocked || !boot) return;
    display(idleSnapshot({ name: boot.store.name, code: boot.store.code }, idleMessages, !!training));
  }, [unlocked, boot, idleMessages, training, display]);

  // Quiet hours: no sale open and nothing touched for a while → the calm dashboard over the Sell screen.
  useEffect(() => {
    if (!unlocked) return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => {
      if (!busyRef.current && !saleIsOpen(cartRef.current) && tabRef.current === "sell" && !document.querySelector("[role=dialog]")) setQuiet(true);
      else t = setTimeout(arm, idleMs);
    };
    const reset = () => {
      clearTimeout(t);
      setQuiet(false);
      t = setTimeout(arm, idleMs);
    };
    t = setTimeout(arm, idleMs);
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [unlocked, idleMs]);
  const saleOpen = saleIsOpen(cart);
  useEffect(() => {
    if (saleOpen || tab !== "sell") setQuiet(false);
  }, [saleOpen, tab]);

  // ── Context ─────────────────────────────────────────────────────────────
  const ctx: PosCtx | null = useMemo(() => {
    if (!boot || !auth.me) return null;
    return {
      // Training: sell against the real shift's catalogue, or a sandbox shift when none is open.
      boot: training && !boot.shift ? { ...boot, shift: { ...TRAINING_SHIFT, openedAt: training.since } } : boot,
      me: auth.me,
      online,
      outbox,
      syncing,
      orders,
      ordersAt,
      setShift: (s: BootShift | null) => bootRef.current && setBoot({ ...bootRef.current, shift: s }),
      refreshBoot,
      refreshOrders,
      syncNow,
      queueSale: (payload: SalePayload, totalCents: number) => {
        if (trainingRef.current) return; // practice sales are never queued
        enqueue({ payload, deviceId, totalCents, queuedAt: new Date().toISOString(), attempts: 0 });
        setOutbox(loadOutbox());
      },
      adjustStock: (moves) => {
        const b = bootRef.current;
        if (!b || trainingRef.current) return; // training never touches stock
        const delta = new Map(moves.map((m) => [m.variantId, m.qty]));
        setBoot({
          ...b,
          products: b.products.map((p) => ({
            ...p,
            variants: p.variants.map((v) => (delta.has(v.id) ? { ...v, onHand: v.onHand - delta.get(v.id)!, available: v.available - delta.get(v.id)! } : v)),
          })),
        });
      },
      // Training keeps its own sandbox sequence: the device's real receipt numbers are never used up.
      commitSeq: (seq: number) => {
        const t = trainingRef.current;
        if (t) setTraining({ ...t, seq: Math.max(t.seq, seq) });
        else storeCommitSeq(seq);
      },
      nextNumber: () => {
        const t = trainingRef.current;
        if (t) return { seq: t.seq + 1, number: trainingNumber(t.seq + 1) };
        const b = bootRef.current!;
        const seq = peekSeq(b.device.seq) + 1;
        return { seq, number: receiptNumber(b.store.code, b.device.prefix, seq) };
      },
      lock,
      switchUser,
      print: (doc: PrintDoc) => void print(doc),
      setBusy: (b: boolean) => void (busyRef.current = b),
      goTo: setTab,
      toast,
      orderScan,
      openOrderScan,
      clearOrderScan,
      printer,
      setPrinter,
      openDrawer,
      discardQueued,
      training,
      startTraining,
      exitTraining,
      showTour: () => setTour(true),
      trainingSale,
      display,
      displaySettings,
      setDisplaySettings,
      idleMessages,
    };
  }, [boot, auth.me, online, outbox, syncing, orders, ordersAt, setBoot, refreshBoot, refreshOrders, syncNow, lock, switchUser, toast, deviceId, orderScan, openOrderScan, clearOrderScan, printer, setPrinter, openDrawer, discardQueued, training, startTraining, exitTraining, trainingSale, display, displaySettings, setDisplaySettings, idleMessages, print, setTraining]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (!ready) return <Splash />;

  const lockScreen = session && (auth.locked || !auth.me || switching) && (
    <LockScreen
      key={switching ?? "lock"}
      session={session}
      online={online}
      queued={outbox.length}
      reason={switching ?? (expired ? "expired" : null)}
      preselect={null}
      onUnlock={unlock}
      onCancel={switching ? () => (setSwitching(null), (afterUnlock.current = null)) : undefined}
    />
  );

  if (!session) return <Splash message={online ? "Connecting to the store…" : "Offline — this till hasn't been set up on this device yet. Connect once to download the store."} />;
  if (!unlocked) return <>{lockScreen}</>;
  if (!boot || !ctx) return <Splash message={bootError ?? "Loading the catalogue…"} retry={bootError ? refreshBoot : undefined} />;

  const newOrders = orders?.filter((o) => o.status === "PLACED" && !o.trade).length ?? 0; // trade orders are picked in the back office
  const failed = outbox.filter((o) => o.error).length;

  return (
    <PosContext.Provider value={ctx}>
      <div className="fixed inset-0 flex flex-col bg-ink-950 text-ink-100 print:hidden">
        {/* Top bar */}
        <header className="box-content flex h-16 shrink-0 items-center gap-2 border-b border-ink-850 bg-ink-950 px-3 pt-[env(safe-area-inset-top)] sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5 text-brand-500">
            <Mark className="h-9 w-9" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-[0.95rem] font-semibold text-white">{boot.store.name}</div>
              <div className="truncate text-[0.7rem] text-ink-400">
                {boot.device.name} · {boot.store.code}-{boot.device.prefix}
              </div>
            </div>
          </div>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Till sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
                  tab === t.key ? "bg-ink-800 text-white" : "text-ink-400 hover:bg-ink-900 hover:text-ink-100",
                )}
              >
                <t.icon className="h-[18px] w-[18px]" />
                {t.label}
                {t.key === "orders" && newOrders > 0 && <span className="tnum rounded-full bg-brand-500 px-1.5 text-[0.7rem] font-bold text-ink-950">{newOrders}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setOutboxOpen(true)}
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition",
                online ? "text-[#7fd49a] ring-leaf-500/30 hover:bg-leaf-500/10" : "text-[#f3c65a] ring-amber-500/40 hover:bg-amber-500/10",
              )}
              aria-label={`${online ? "Online" : "Offline"}${outbox.length ? `, ${outbox.length} sales waiting to sync` : ""}`}
              data-testid="connectivity"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : online ? <Wifi className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
              <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
              {outbox.length > 0 && (
                <span className={cn("tnum inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.7rem]", failed ? "bg-rose-500 text-white" : "bg-amber-500 text-ink-950")} data-testid="queued-count">
                  <UploadCloud className="h-3 w-3" />
                  {outbox.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 rounded-full bg-ink-900 p-1 ring-1 ring-ink-800 sm:pr-3" aria-label={`Signed in: ${auth.me!.name}`}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 font-display text-xs font-bold text-ink-950">{initials(auth.me!.name)}</span>
              <span className="hidden max-w-32 truncate text-sm font-semibold text-white sm:inline">{auth.me!.name.split(" ")[0]}</span>
              {auth.me!.canDispense && <ShieldCheck className="hidden h-4 w-4 text-brand-400 sm:block" aria-label="Authorised dispenser" />}
            </div>
            <PosButton variant="outline" onClick={lock} className="px-3 sm:px-4" aria-label="Lock the till">
              <Lock className="h-4 w-4" />
              <span className="hidden lg:inline">Lock</span>
            </PosButton>
          </div>
        </header>

        <TrainingBanner />
        {!boot.shift && !training && tab !== "shift" && (
          <div className="flex shrink-0 items-center justify-between gap-3 bg-amber-500/10 px-4 py-2 text-sm text-[#f3c65a]">
            <span>No shift is open on this till — open one with a counted float to start selling.</span>
            <button type="button" onClick={() => setTab("shift")} className="h-12 shrink-0 rounded-full bg-amber-500 px-5 text-sm font-bold text-ink-950">
              Open shift
            </button>
          </div>
        )}

        <main className="relative min-h-0 flex-1">
          <div className={cn("h-full", tab !== "sell" && "hidden")}>
            <SellScreen cart={cart} setCart={setCart} apiRef={sellApi} />
          </div>
          {quiet && tab === "sell" && (
            <QuietScreen
              onWake={(t) => {
                setQuiet(false);
                if (t) setTab(t);
              }}
            />
          )}
          {tab === "orders" && <OrdersBoard />}
          {tab === "sales" && <SalesHistory />}
          {tab === "stock" && <StockLookup onAdd={(variantId) => (setTab("sell"), setTimeout(() => sellApi.current?.add(variantId), 0))} />}
          {tab === "shift" && <ShiftPanel />}
        </main>

        {/* Phone navigation */}
        <nav className="grid shrink-0 grid-cols-5 border-t border-ink-850 bg-ink-950 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Till sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold", tab === t.key ? "text-brand-400" : "text-ink-400")}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
              {t.key === "orders" && newOrders > 0 && <span className="tnum absolute right-[22%] top-2 rounded-full bg-brand-500 px-1.5 text-[0.65rem] font-bold text-ink-950">{newOrders}</span>}
            </button>
          ))}
        </nav>
      </div>

      <OutboxSheet open={outboxOpen} onClose={() => setOutboxOpen(false)} />
      {training && <TrainingOutline />}
      <TrainingTour
        open={tour}
        onClose={() => {
          setTour(false);
          const t = trainingRef.current;
          if (t && !t.tourDone) setTraining({ ...t, tourDone: true });
        }}
      />
      {printDoc && <PrintArea key={printDoc.n} doc={printDoc.doc} boot={boot} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 print:hidden" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ring-1 animate-rise",
              t.tone === "ok" && "bg-ink-800 text-white ring-ink-700",
              t.tone === "warn" && "bg-amber-500 text-ink-950 ring-amber-500",
              t.tone === "error" && "bg-rose-500 text-white ring-rose-500",
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
      {lockScreen}
    </PosContext.Provider>
  );
}

function Splash({ message, retry }: { message?: string; retry?: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-950 px-6 text-center text-ink-200">
      <div className="flex flex-col items-center">
        <Mark className="h-16 w-16 text-brand-500" spin="fast" />
        <p className="mt-5 max-w-sm text-sm text-ink-400">{message ?? "Starting the till…"}</p>
        {retry && (
          <PosButton variant="primary" className="mt-5" onClick={retry}>
            <RefreshCw className="h-4 w-4" /> Try again
          </PosButton>
        )}
      </div>
    </div>
  );
}

function OutboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pos = usePosSafe();
  if (!pos) return null;
  const { outbox, online, syncing, syncNow, boot, discardQueued } = pos;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={online ? "Online" : "Offline"}
      subtitle={online ? "Connected to Herbal Holland" : "Cash sales are saved on this till and sync automatically"}
      size="sm"
      footer={
        <div className="flex justify-between gap-2">
          <span className="self-center text-xs text-ink-400">Catalogue updated {fmtTime(boot.fetchedAt)}</span>
          <PosButton variant="primary" busy={syncing} disabled={!online || !outbox.length} onClick={() => void syncNow()}>
            <UploadCloud className="h-4 w-4" /> Sync now
          </PosButton>
        </div>
      }
    >
      {!outbox.length ? (
        <p className="text-sm text-ink-300">Nothing waiting — every sale on this till is synced.</p>
      ) : (
        <ul className="space-y-2">
          {outbox.map((o) => (
            <li key={o.payload.id} className="rounded-2xl bg-ink-850 px-4 py-3 ring-1 ring-ink-800">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-white">{o.payload.number}</span>
                <span className="tnum font-semibold text-white">{zar(o.totalCents)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-ink-400">
                <span>Queued {fmtTime(o.queuedAt)}</span>
                {o.deviceId && o.deviceId !== boot.device.id ? (
                  <Chip tone="red">Another till</Chip>
                ) : o.error ? (
                  <Chip tone="red">Needs attention</Chip>
                ) : (
                  <Chip tone="amber">Waiting</Chip>
                )}
              </div>
              {o.deviceId && o.deviceId !== boot.device.id ? (
                <Alert className="mt-2">Rung up before this device was re-paired. Ask HQ support to post it for the original store — it won&apos;t sync here.</Alert>
              ) : (
                o.error && (
                  <Alert className="mt-2">
                    <div data-testid="outbox-error">{o.error}</div>
                    <PosButton variant="danger" size="sm" className="mt-2" onClick={() => discardQueued(o.payload.id)}>
                      Discard this queued sale (manager PIN)
                    </PosButton>
                  </Alert>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function usePosSafe() {
  return useContext(PosContext);
}
