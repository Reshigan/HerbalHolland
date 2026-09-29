// JSON shapes exchanged between the POS client (/pos) and its route handlers (/api/pos/*).
// Type-only: safe to import from client components.
import type { ComplianceSettings, RegClass } from "@/lib/compliance";
import type { PromoInput } from "@/lib/promotions";
import type { PriceListRule } from "@/lib/pricing-rules";

export type { TierKey } from "@/lib/loyalty-rules";
import type { TierKey } from "@/lib/loyalty-rules";
export type AgeCheckKind = "NONE" | "ID_SIGHTED" | "ID_NUMBER" | "VERIFIED";
export type TenderMethod = "CARD" | "CASH" | "PAYSHAP" | "EFT";
export type TapProviderKind = "SIMULATED" | "HALO_APPLINK" | "YOCO" | "EXTERNAL";

export type StaffTile = { id: string; name: string; role: string; canDispense: boolean };

export type SessionInfo = {
  device: { id: string; name: string; prefix: string };
  store: { id: string; code: string; name: string; suburb: string; city: string };
  staff: StaffTile[];
  me: StaffTile | null;
  demo: boolean;
};

export type BootVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  grams: number | null;
  rrpCents: number;
  shelfCents: number | null; // franchisee's own shelf price
  markdownPct: number; // near-expiry markdown on the next lot to sell
  onHand: number;
  available: number; // on hand − open online reservations
};

export type BootProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  tagline: string | null;
  categoryId: string;
  regClass: RegClass;
  strain: string | null;
  tobaccoRelated: boolean;
  featured: boolean;
  variants: BootVariant[];
  facts?: BootFacts | null; // food, supplements and skin care (tills cached before product facts have none)
};

/** What's in a pack, for members who ask at the counter: net content, ingredients and declared allergens. */
export type BootFacts = { netContent: number | null; netUnit: string | null; ingredients: string | null; allergens: string[] };

/** Promotion as cached on the till: engine input plus its schedule (evaluated at sale time offline). */
export type BootPromotion = PromoInput & {
  description: string | null;
  startsAt: string;
  endsAt: string;
  days: number[];
  startMinute: number | null;
  endMinute: number | null;
  firstPurchaseOnly?: boolean; // welcome gift: only the server can tell a member has never bought (never applied offline)
};

/** Limited release governing some of this till's variants (live, or opening later). The server enforces its rules. */
export type BootDrop = {
  id: string;
  slug: string;
  name: string;
  variantIds: string[];
  startsAt: string;
  endsAt: string | null;
  earlyTier: TierKey | null;
  earlyMinutes: number;
  perMemberLimit: number;
  membersOnly: boolean;
};

export type BootPriceList = Omit<PriceListRule, "startsAt" | "endsAt" | "createdAt"> & {
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type BootShift = { id: string; openedAt: string; openingFloatCents: number; openedBy: string };

export type BootStore = {
  id: string;
  code: string;
  name: string;
  legalName: string;
  vatNumber: string | null;
  vatRegistered: boolean;
  addressLine: string;
  suburb: string;
  city: string;
  postalCode: string;
  phone: string | null;
  email: string | null;
  licences: RegClass[];
  licenceRef: string | null;
  receiptFooter: string | null;
  regionId: string;
};

export type BootData = {
  version: 1;
  fetchedAt: string;
  device: { id: string; name: string; prefix: string; seq: number };
  store: BootStore;
  staff: StaffTile[];
  categories: { id: string; slug: string; name: string; icon: string }[];
  products: BootProduct[];
  promotions: BootPromotion[];
  priceLists: BootPriceList[];
  drops?: BootDrop[]; // optional: tills cached before drops existed
  settings: {
    compliance: ComplianceSettings;
    loyalty: { earnPer100: number; minRedeem: number; maxRedeemPct: number; tierSavingsPct: Record<TierKey, number> };
  };
  shift: BootShift | null;
  /** The store's next event (for the till's quiet-hours dashboard); tills cached before this field have none. */
  nextEvent?: { title: string; startsAt: string; endsAt: string } | null;
  tapProvider: TapProviderKind;
  joinUrl: string; // Herbal Holland Rewards self-registration link for this store
};

// ── Pricing ─────────────────────────────────────────────────────────────────

export type QuoteLineDTO = {
  variantId: string;
  qty: number;
  unitPriceCents: number; // after price rules, before promotions
  shelfCents: number;
  rrpCents: number;
  priceRule: string | null;
  grossCents: number;
  discountCents: number;
  totalCents: number;
  vatCents: number;
  promoId?: string;
  noEarn: boolean;
  memberSavingsCents: number; // instant Rewards saving vs the walk-in price
  offerCents: number; // My Deals part of discountCents (online only)
  offerName: string | null; // e.g. "15% off Calm CBD Oil"
};

export type QuoteDTO = {
  lines: QuoteLineDTO[];
  subtotalCents: number;
  discountCents: number; // all deals, My Deals included
  offerCents: number; // My Deals total
  totalCents: number;
  vatCents: number;
  pointsMultiplier: number;
  applied: { id: string; name: string; discountCents: number }[];
  suggestions: { promoId: string; name: string; message: string; productIds: string[]; categoryIds: string[] }[];
  codeError?: string;
  pointsEstimate: number;
  memberSavingsCents: number; // "Rewards savings" on this basket (members)
  joinSavingsCents: number; // walk-ins: what joining Rewards (Seed) would save on this basket now
};

// ── Customers ───────────────────────────────────────────────────────────────

// Each store sees only its own trading: visits and last visit are counted at this till's store.
export type CustomerHit = {
  id: string;
  memberNo: string;
  name: string;
  phone: string; // masked
  tier: TierKey;
  points: number;
  patient: boolean;
  visitsHere: number;
  lastVisitHere: string | null;
};

export type CustomerDetail = {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string | null;
  phone: string; // masked
  email: string | null;
  tier: TierKey;
  points: number;
  ageCheck: AgeCheckKind;
  ageVerified: boolean;
  age: number | null;
  homeStore: string | null;
  visitsHere: number; // sales at this store only
  lastVisitHere: string | null;
  foundingNo: number | null; // Founding Member number
  tierFloor: { tier: TierKey; until: string } | null; // active guaranteed minimum tier
  offers: { id: string; title: string; endsAt: string }[]; // My Deals on the card (auto-apply online)
  patient: {
    authNumber: string;
    prescriber: string;
    prescriberRegNo: string;
    scope: string;
    monthlyLimitGrams: number;
    remainingGrams: number;
    validTo: string;
  } | null;
  offline?: boolean; // taken from the member's card while the till was offline: checked when it reconnects
};

/** Door check-in from an event ticket (HHRSVP:{code}): the member to attach and their event. */
export type CheckInDTO = {
  customer: CustomerDetail;
  event: { id: string; title: string; startsAt: string; endsAt: string };
  first: boolean; // false = the ticket was already checked in
};

// ── Compliance ──────────────────────────────────────────────────────────────

export type BlockKind = "MEMBER" | "AGE" | "UNDERAGE" | "PATIENT" | "QUANTITY" | "DISPENSER" | "LICENCE" | "CHANNEL" | "DAILY_LIMIT" | "DROP" | "OTHER";

export type ComplianceDTO = {
  ok: boolean;
  blocks: { kind: BlockKind; message: string }[];
  needsAgeCheck: boolean;
  needsPrescription: boolean;
  gramsInCart: number;
  staffCanDispense: boolean;
};

// ── Sales & receipts ────────────────────────────────────────────────────────

export type ReceiptLine = {
  id: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  qty: number;
  unitPriceCents: number;
  discountCents: number;
  offerCents: number; // My Deals part of discountCents
  totalCents: number;
  vatCents: number;
  refundedQty: number;
};

export type ReceiptPayment = {
  method: string;
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number | null;
  provider: string | null;
  reference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
};

export type ReceiptDTO = {
  id: string;
  number: string;
  kind: "SALE" | "REFUND";
  channel: "POS" | "ONLINE";
  title: string;
  createdAt: string;
  offline: boolean;
  queued?: boolean; // client-side: not yet synced
  training?: boolean; // client-side: rung up in training mode — never posted, printed with a TRAINING watermark
  refundOf: { id: string; number: string } | null;
  staff: string | null;
  customer: { id: string; name: string; memberNo: string; tier: TierKey; points: number } | null;
  lines: ReceiptLine[];
  subtotalCents: number;
  discountCents: number; // all deals, My Deals included
  offerCents: number; // My Deals
  offers: string[]; // names of the My Deals used
  memberSavingsCents: number;
  totalCents: number;
  vatCents: number;
  pointsEarned: number;
  pointsRedeemed: number;
  payments: ReceiptPayment[];
  promoCode: string | null;
  invoiceEmail: string | null;
  buyer: { name: string; address: string; vatNumber?: string } | null;
  note: string | null;
  refunds: { id: string; number: string; totalCents: number; createdAt: string }[];
  invoiceUrl: string | null;
};

export type SaleRow = {
  id: string;
  number: string;
  kind: "SALE" | "REFUND";
  channel: "POS" | "ONLINE";
  createdAt: string;
  totalCents: number;
  customer: string | null;
  staff: string | null;
  methods: string[];
  items: number;
  refunded: boolean;
  offline: boolean;
};

// ── Shifts ──────────────────────────────────────────────────────────────────

export type ZReport = {
  shiftId: string;
  closed: boolean;
  store: { code: string; name: string; legalName: string; vatNumber: string | null };
  device: { name: string; prefix: string } | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string | null;
  sales: { count: number; grossCents: number; vatCents: number; netCents: number; discountCents: number; memberSavingsCents: number; units: number };
  refunds: { count: number; totalCents: number };
  online: { count: number; grossCents: number };
  tenders: { method: string; label: string; amountCents: number; count: number }[];
  points: { issued: number; redeemed: number };
  cash: {
    floatCents: number;
    cashNetCents: number;
    expectedCents: number;
    countedCents: number | null;
    varianceCents: number | null;
    counts: Record<string, number> | null;
  };
  takingsCents: number;
  /** Licensed medicines dispensed in the shift (tills cached before this field carry none). */
  dispensing?: { count: number; units: number; grams: number; cents: number } | null;
  notes: string | null;
  emailedTo: string | null;
};

// ── Online orders ───────────────────────────────────────────────────────────

export type OrderCard = {
  id: string;
  code: string;
  status: "PLACED" | "PICKING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED";
  fulfilment: "COLLECT" | "SAME_DAY" | "COURIER";
  paid: boolean;
  dueCents: number;
  totalCents: number;
  pointsRedeemed: number;
  customer: { name: string; phone: string; memberNo: string; ageVerified: boolean };
  lines: { name: string; variantName: string; sku: string; qty: number; licensed: boolean }[];
  units: number;
  licensed: boolean;
  ageRestricted: boolean;
  placedAt: string;
  readyAt: string | null;
  doneAt: string | null;
  address: string | null;
  deliveryNotes: string | null;
  courier: string | null;
  trackingNo: string | null;
  idChecked: boolean;
};

// ── Stock lookup ────────────────────────────────────────────────────────────

export type StockHit = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  regClass: RegClass;
  strain: string | null;
  priceCents: number;
  here: { onHand: number; reserved: number; available: number };
  nearby: { code: string; name: string; suburb: string; distanceKm: number | null; available: number }[];
};
