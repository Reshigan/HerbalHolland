// Till-local persistence (localStorage): the offline bootstrap, the signed-in staff
// member, the device receipt sequence, the in-progress cart and the outbox of sales
// waiting to sync. Everything is namespaced and wiped when the device is re-paired.
import type { BootData, SessionInfo, StaffTile, AgeCheckKind, CustomerDetail, TenderMethod, TradeAccountDTO } from "@/server/pos/types";

const NS = "hh-pos:v1:";
// Wiped when the browser is paired as a different till. The printer set-up ("printer") survives a re-pair: the
// hardware on the counter doesn't change with the store.
const KEYS = ["device", "boot", "session", "auth", "seq", "cart", "pins", "training", "training-sales", "display", "audit-queue", "idle-ms"] as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(NS + key);
    else localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the till keeps working from memory */
  }
}

/** Clears cached data when this browser is paired as a different till (the outbox is kept). */
export function claimDevice(deviceId: string) {
  if (read<string>("device") === deviceId) return;
  for (const k of KEYS) if (k !== "device") write(k, null);
  write("device", deviceId);
}

export const loadBoot = () => read<BootData>("boot");
export const saveBoot = (b: BootData) => write("boot", b);
export const loadSession = () => read<SessionInfo>("session");
export const saveSession = (s: SessionInfo) => write("session", s);

export type AuthState = { me: StaffTile | null; locked: boolean; offline?: boolean; at: number };
export const loadAuth = () => read<AuthState>("auth");
export const saveAuth = (a: AuthState) => write("auth", a);

/** Last receipt sequence used on this till: never behind the server's. */
export const peekSeq = (serverSeq: number) => Math.max(serverSeq, read<number>("seq") ?? 0);
/** Marks a sequence as used once its sale is posted or queued (numbers are never reused). */
export const commitSeq = (seq: number) => write("seq", Math.max(seq, read<number>("seq") ?? 0));

// ── Cart ─────────────────────────────────────────────────────────────────────

export type CartLine = { variantId: string; qty: number };
export type Cart = {
  lines: CartLine[];
  code: string | null;
  customer: CustomerDetail | null;
  ageCheck: AgeCheckKind | null; // counter check for walk-ins (ID sighted / SA ID number)
  /** Trade-sale mode: the trade account buying (WHOLESALE prices ex VAT; no member, points or deals). A basket is retail or trade, never both. */
  trade: TradeAccountDTO | null;
};
export const EMPTY_CART: Cart = { lines: [], code: null, customer: null, ageCheck: null, trade: null };
/** The in-progress cart; one saved before trade-sale mode existed has no `trade` field. */
export const loadCart = (): Cart => {
  const c = read<Partial<Cart>>("cart");
  return c ? { ...EMPTY_CART, ...c } : EMPTY_CART;
};
export const saveCart = (c: Cart) => write("cart", c.lines.length || c.customer || c.code || c.trade ? c : null);

// ── Outbox ───────────────────────────────────────────────────────────────────

export type QueuedTender = {
  method: TenderMethod;
  amountCents: number;
  tenderedCents?: number;
  changeCents?: number;
  provider?: string;
  reference?: string;
  cardBrand?: string;
  cardLast4?: string;
};

export type SalePayload = {
  id: string;
  number: string;
  seq: number;
  createdAt: string;
  offline: boolean;
  shiftId: string | null;
  customerId: string | null;
  memberNo?: string | null; // a member taken from their card while offline: resolved when the sale syncs
  lines: { variantId: string; qty: number; unitPriceCents: number }[];
  promoCode: string | null;
  pointsRedeemed: number;
  payments: QueuedTender[];
  ageCheck?: AgeCheckKind; // counter check; members' own verification is used otherwise
  buyer: { name: string; address: string; vatNumber?: string } | null;
  invoiceEmail: string | null;
  staffId: string;
  /** Who built the basket when a dispenser (staffId) completed the sale: commission credits them. */
  soldById?: string | null;
  /** Trade-sale mode: the account buying (the server prices and invoices it; never queued offline). */
  trade?: { tradeAccountId: string } | null;
};

export type OutboxItem = {
  payload: SalePayload;
  deviceId: string; // only this till may sync it (a re-paired device must not post into another store)
  totalCents: number;
  queuedAt: string;
  attempts: number;
  error?: string;
};

const OUTBOX = "outbox";
export const loadOutbox = () => read<OutboxItem[]>(OUTBOX) ?? [];
export const saveOutbox = (items: OutboxItem[]) => write(OUTBOX, items.length ? items : null);
export function enqueue(item: OutboxItem) {
  const items = loadOutbox().filter((i) => i.payload.id !== item.payload.id);
  saveOutbox([...items, item]);
}
export function updateQueued(id: string, patch: (i: OutboxItem) => OutboxItem | null) {
  const out: OutboxItem[] = [];
  for (const i of loadOutbox()) {
    if (i.payload.id !== id) out.push(i);
    else {
      const next = patch(i);
      if (next) out.push(next);
    }
  }
  saveOutbox(out);
}

// ── Offline PIN verifiers (only for staff who signed in on this till while online) ──

export type PinVerifier = { salt: string; hash: string; exp: number };
export const loadPins = () => read<Record<string, PinVerifier>>("pins") ?? {};
export const savePins = (p: Record<string, PinVerifier>) => write("pins", p);

// ── Till hardware & modes (device-local settings; never on the server) ──────

import type { PrinterSettings } from "./print";
import type { TrainingState } from "./training";
import type { ReceiptDTO } from "@/server/pos/types";

export const loadPrinter = () => read<PrinterSettings>("printer");
export const savePrinter = (p: PrinterSettings | null) => write("printer", p);

export const loadTraining = () => read<TrainingState>("training");
export const saveTraining = (t: TrainingState | null) => write("training", t);
/** Practice receipts rung up in training (the last 20), so the Sales tab can show and re-print them. */
export const loadTrainingSales = () => read<ReceiptDTO[]>("training-sales") ?? [];
export const saveTrainingSales = (r: ReceiptDTO[]) => write("training-sales", r.length ? r.slice(-20) : null);

/** Customer display: the pairing key for a separate screen and whether the till feeds it through the server. */
export type DisplaySettings = { key: string; remote: boolean };
export const loadDisplay = () => read<DisplaySettings>("display");
export const saveDisplay = (d: DisplaySettings | null) => write("display", d);

/** Sensitive actions taken while offline (drawer opened, training started/ended, a refused queued sale discarded), posted to the audit log on sync. */
export type QueuedAudit = { id: string; action: "drawer.open" | "training.start" | "training.end" | "outbox.discard"; at: string; staffId: string; staffName: string; note?: string; deviceId: string };
export const loadAuditQueue = () => read<QueuedAudit[]>("audit-queue") ?? [];
export const saveAuditQueue = (q: QueuedAudit[]) => write("audit-queue", q.length ? q : null);

/** Quiet-hours delay override (ms): a test hook set from ?idleMs= on the till's URL. */
export const loadIdleMs = () => read<number>("idle-ms");
export const saveIdleMs = (ms: number | null) => write("idle-ms", ms);
