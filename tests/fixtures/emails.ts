// Fixtures for the email render tests and the preview script (scripts/preview-emails.ts). Names carry HTML
// characters on purpose: every template must escape what it's given.
import type { InvoiceEmailInput, OrderEmailInput, StatementEmailInput, StockOrderEmailInput } from "@/server/email-templates";
import type { ZReport } from "@/server/pos/types";
import { buildStatement } from "@/lib/statement";

export const TRICKY = `Calm CBD Oil <script>alert(1)</script> & "Co"`;
export const WHEN = new Date("2026-09-12T10:24:00+02:00");

export const store = { name: "Hatfield", code: "PTA01", addressLine: "12 Burnett Street", suburb: "Hatfield", city: "Pretoria", company: { legalName: "Jacaranda Wellness (Pty) Ltd", vatNumber: "4123456789" } };

export const sale: InvoiceEmailInput = {
  id: "sale-1",
  number: "PTA01-A00042",
  kind: "SALE",
  createdAt: WHEN,
  totalCents: 123_450,
  vatCents: 16_102,
  discountCents: 6_000,
  memberSavingsCents: 3_700,
  pointsEarned: 61,
  store,
  customer: { firstName: "Lindiwe" },
  refundOf: null,
  lines: [
    { id: "l1", qty: 2, unitPriceCents: 49_900, discountCents: 6_000, totalCents: 93_800, variant: { name: "600 mg · 30 ml", product: { name: TRICKY } } },
    { id: "l2", qty: 1, unitPriceCents: 29_650, discountCents: 0, totalCents: 29_650, variant: { name: "Black", product: { name: "Sunset Grinder" } } },
  ],
  payments: [
    { method: "CARD", amountCents: 100_000, reference: "YC-8842", cardLast4: "4242" },
    { method: "LOYALTY", amountCents: 23_450 },
  ],
};

export const refund: InvoiceEmailInput = {
  ...sale,
  id: "sale-2",
  number: "PTA01-A00042-R01",
  kind: "REFUND",
  totalCents: -29_650,
  vatCents: -3_867,
  discountCents: 0,
  memberSavingsCents: 0,
  pointsEarned: 0,
  refundOf: { number: "PTA01-A00042" },
  lines: [{ id: "l3", qty: -1, unitPriceCents: 29_650, discountCents: 0, totalCents: -29_650, variant: { name: "Black", product: { name: "Sunset Grinder" } } }],
  payments: [{ method: "CARD", amountCents: -29_650, reference: "YC-8842", cardLast4: "4242" }],
};

export const stockOrder: StockOrderEmailInput = {
  id: "so-1",
  number: "SO-000318",
  status: "RECEIVED",
  totalCents: 0,
  buyer: { code: "PTA01", name: "Hatfield", company: { legalName: "Jacaranda Wellness (Pty) Ltd", vatNumber: "4123456789" } },
  seller: { name: "Centurion DC", company: { legalName: "Herbal Holland (Pty) Ltd", vatNumber: "4870123456" } },
  lines: [
    { qty: 24, receivedQty: 24, unitCostCents: 21_500, variant: { name: "600 mg · 30 ml", product: { name: "Calm CBD Oil" } } },
    { qty: 12, receivedQty: 10, unitCostCents: 9_800, variant: { name: "Black", product: { name: "Sunset Grinder & Co" } } },
  ],
};
export const stockOrderValueIncl = Math.round((24 * 21_500 + 10 * 9_800) * 1.15);

const statementInput = {
  netSalesExVatCents: 41_250_000,
  onlineSalesExVatCents: 6_120_000,
  onlineCollectedCents: 7_038_000,
  pointsIssuedCents: 206_250,
  pointsRedeemedCents: 148_900,
  offersFundedCents: 32_400,
  wholesaleCents: 12_420_000,
  networkSoldCents: 0,
  networkBoughtCents: 186_000,
  royaltyBps: 600,
  levyBps: 200,
  ecomBps: 1000,
};
export const statement: StatementEmailInput = { store: { name: "Hatfield", code: "PTA01" }, month: "2026-08", memberSavingsCents: 412_300, input: statementInput, ...buildStatement(statementInput) };
export const statementCompany = { legalName: "Jacaranda Wellness (Pty) Ltd", vatNumber: "4123456789" };

export const zReport: ZReport = {
  shiftId: "shift-9f2a7c1d",
  closed: true,
  store: { code: "PTA01", name: "Hatfield", legalName: "Jacaranda Wellness (Pty) Ltd", vatNumber: "4123456789" },
  device: { name: "Front till", prefix: "A" },
  openedAt: "2026-09-12T07:02:00+02:00",
  closedAt: "2026-09-12T18:14:00+02:00",
  openedBy: "Thabo Nkosi",
  closedBy: "Thabo Nkosi",
  sales: { count: 84, grossCents: 6_412_350, vatCents: 836_393, netCents: 5_575_957, discountCents: 214_000, memberSavingsCents: 188_400, units: 171 },
  refunds: { count: 2, totalCents: 41_900 },
  online: { count: 6, grossCents: 412_000 },
  tenders: [
    { method: "CARD", label: "Card", amountCents: 4_210_000, count: 58 },
    { method: "CASH", label: "Cash", amountCents: 1_640_450, count: 22 },
    { method: "PAYSHAP", label: "PayShap", amountCents: 320_000, count: 3 },
    { method: "LOYALTY", label: "Points", amountCents: 200_000, count: 9 },
  ],
  points: { issued: 3_120, redeemed: 2_000 },
  cash: { floatCents: 100_000, cashNetCents: 1_640_450, expectedCents: 1_740_450, countedCents: 1_735_450, varianceCents: -5_000, counts: { "20000": 62, "10000": 41, "5000": 14, "2000": 9, "1000": 3, "500": 5, "200": 6, "100": 2, "50": 1 } },
  takingsCents: 6_370_450,
  dispensing: { count: 5, units: 7, grams: 21, cents: 612_000 },
  notes: "Card machine restarted at 14:10",
  emailedTo: null,
};

export const order: OrderEmailInput = {
  code: "X7K2P9",
  fulfilment: "COLLECT",
  store: { name: "Hatfield", addressLine: "12 Burnett Street", suburb: "Hatfield", city: "Pretoria" },
  customer: { firstName: "Lindiwe" },
  lines: [
    { name: TRICKY, variant: "600 mg · 30 ml", qty: 1, totalCents: 46_900 },
    { name: "Sunset Grinder", variant: "Black", qty: 2, totalCents: 59_300 },
  ],
  subtotalCents: 109_200,
  discountCents: 3_000,
  deliveryCents: 0,
  pointsRedeemed: 50,
  totalCents: 106_200,
  paid: true,
  collectionCode: "4821",
  ageRestricted: true,
  pointsEarned: 53,
};

export const courierOrder: OrderEmailInput = {
  ...order,
  code: "M3T8QA",
  fulfilment: "COURIER",
  deliveryCents: 9_900,
  totalCents: 116_100,
  address: "14 Jacaranda Street, Hatfield, Pretoria, 0083",
  courier: "Aramex",
  trackingNo: "HH2K7Q9D4F",
  collectionCode: null,
};
