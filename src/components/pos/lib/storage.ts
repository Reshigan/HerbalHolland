// Till-local persistence (localStorage): the offline bootstrap, the signed-in staff
// member, the device receipt sequence, the in-progress cart and the outbox of sales
// waiting to sync. Everything is namespaced and wiped when the device is re-paired.
import type { BootData, SessionInfo, StaffTile, AgeCheckKind, CustomerDetail, TenderMethod } from "@/server/pos/types";

const NS = "hh-pos:v1:";
const KEYS = ["device", "boot", "session", "auth", "seq", "cart", "pins"] as const;

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
    /* storage full or unavailable — the till keeps working from memory */
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
};
export const EMPTY_CART: Cart = { lines: [], code: null, customer: null, ageCheck: null };
export const loadCart = () => read<Cart>("cart") ?? EMPTY_CART;
export const saveCart = (c: Cart) => write("cart", c.lines.length || c.customer || c.code ? c : null);

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
  lines: { variantId: string; qty: number; unitPriceCents: number }[];
  promoCode: string | null;
  pointsRedeemed: number;
  payments: QueuedTender[];
  ageCheck?: AgeCheckKind; // counter check; members' own verification is used otherwise
  buyer: { name: string; address: string; vatNumber?: string } | null;
  invoiceEmail: string | null;
  staffId: string;
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
