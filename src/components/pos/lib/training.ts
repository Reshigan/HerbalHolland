// Training mode: the whole till runs against a clearly marked sandbox. Nothing here touches the server — these are
// the pure rules (what the sandbox may call, how training receipts are numbered, the guided tour) so they can be
// unit-tested (tests/till-hardware.test.ts). The till keeps the mode's state in localStorage (storage.ts) and
// api.ts refuses every write while it is on.

export type TrainingState = {
  since: string; // ISO — when the manager switched it on
  byId: string; // the manager who enabled it
  byName: string;
  seq: number; // sandbox receipt sequence (never the device's real one)
  sales: number; // practice sales rung up so far
  tourDone: boolean;
};

export class TrainingError extends Error {
  constructor(message = "Training mode — nothing is real. Exit training (manager PIN) to do this for real.") {
    super(message);
  }
}

/**
 * Requests the sandbox may make. Reads are fine (they only look), and so are the calls that don't change anything of
 * record: quotes and compliance checks (pure calculations), the PIN session (people still lock and switch users),
 * the customer display feed (in-memory), a gift voucher lookup (it only reads the balance; a practice sale never
 * redeems it), a trade account lookup (a practice trade sale never posts or touches the account's ledger) and the
 * audit call itself (entering/leaving training is audited).
 * Every other write — sales, refunds, sign-ups, age checks, check-ins, orders (trade handovers included), shifts,
 * invoices, card sessions, pairing — is refused, so a practice sale can never post, print for real, move stock or
 * award points.
 */
const WRITES_ALLOWED = ["/api/pos/quote", "/api/pos/compliance", "/api/pos/session", "/api/pos/display", "/api/pos/audit", "/api/pos/vouchers", "/api/pos/trade/accounts"];

export function trainingAllows(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = path.split("?")[0];
  if (m === "GET" || m === "HEAD") return true;
  return WRITES_ALLOWED.includes(p);
}

/** Sandbox receipt numbers never resemble a real one (real: PTA01-B00042). */
export const trainingNumber = (seq: number) => `TRAINING ${String(seq).padStart(4, "0")}`;
export const isTrainingNumber = (n: string) => /^TRAINING \d+$/.test(n);

/** The sandbox shift the till sells against when no real shift is open. */
export const TRAINING_SHIFT = { id: "training", openingFloatCents: 100_000, openedBy: "Training mode" };

export const TRAINING_BANNER = "TRAINING — nothing is real";

/** The five-step tour for new cashiers, shown when training starts (and again from the banner). */
export const TOUR: { title: string; body: string; tip?: string }[] = [
  {
    title: "Find what they're buying",
    body: "Tap a product in the catalogue, or scan its barcode — with a scanner, or the camera button next to the search box. Categories are down the side; Deals shows what's on promotion today.",
    tip: "Keyboard: F2 jumps to search.",
  },
  {
    title: "Add the member",
    body: "Every sale is a member's sale. Scan the QR on their Rewards card, search by phone or name, or sign them up in about 20 seconds — read them the key terms and tick the box.",
    tip: "Keyboard: F4 opens the member search.",
  },
  {
    title: "Check the basket",
    body: "Prices are the member's tier prices; deals and My Deals apply on their own. Medicines never carry a deal or points — the till says so on the line. Use the steppers to change quantities.",
  },
  {
    title: "Charge and take payment",
    body: "Tap Charge. The till checks age, patient authorisation and who may dispense before it takes money. Then choose the tender: card, cash (change is worked out), PayShap or points — or split it.",
    tip: "Keyboard: F9 charges the basket.",
  },
  {
    title: "Receipt and next sale",
    body: "Change due shows big. Print or email the receipt, then tap New sale. In training, receipts print with a TRAINING watermark and nothing is recorded — practise as much as you like.",
  },
];
