// Gift vouchers (pure rules). A voucher is money, not an incentive: it pays for anything in the shop, medicines
// included (Medicines Act s18A is about inducements, and a voucher carries no bonus value), and it never earns or
// unlocks anything on top. Consumer Protection Act s63(2): a prepaid voucher is valid for three years from issue.
export const VOUCHER_AMOUNTS_CENTS = [20_000, 50_000, 100_000] as const;
export const VOUCHER_VALID_YEARS = 3;
export const VOUCHER_MESSAGE_MAX = 240;
export const VOUCHER_SKU_PREFIX = "GIFT-";
export const VOUCHER_PRODUCT_SLUG = "gift-voucher";
export const isVoucherSku = (sku: string) => sku.startsWith(VOUCHER_SKU_PREFIX);
export const voucherSku = (amountCents: number) => `${VOUCHER_SKU_PREFIX}${amountCents / 100}`;

/** No 0/O or 1/I: a code read out over the phone or typed from a card comes out right. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BODY = /^HH([A-HJ-NP-Z2-9]{12})$/;

/** "HH-K7PM-3QXR-9ZAB" from 12 random letters and digits. */
export function makeVoucherCode(random: () => number = Math.random) {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  return `HH-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** As typed ("hh k7pm 3qxr 9zab", "HH-K7PM…") → the canonical code, or null when it can't be one. */
export function normaliseVoucherCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0/, "O");
  const m = BODY.exec(s);
  return m ? `HH-${m[1].slice(0, 4)}-${m[1].slice(4, 8)}-${m[1].slice(8, 12)}` : null;
}

/** Valid until the end (SAST) of the same calendar day three years on. */
export function voucherExpiry(issuedAt: Date) {
  const sast = new Date(issuedAt.getTime() + 2 * 3_600_000);
  const y = sast.getUTCFullYear() + VOUCHER_VALID_YEARS;
  const mm = String(sast.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(sast.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${mm}-${dd}T23:59:59+02:00`);
}

export type VoucherFacts = { status: "PENDING" | "ACTIVE" | "REDEEMED" | "EXPIRED" | "CANCELLED"; balanceCents: number; expiresAt: Date };

/** Why a voucher can't pay for an order right now, in the member's words — or null when it can. */
export function voucherProblem(v: VoucherFacts | null | undefined, now = new Date(), fmtDate: (d: Date) => string = (d) => d.toISOString().slice(0, 10)): string | null {
  if (!v) return "We don't recognise that voucher code — check it against the email or card.";
  if (v.status === "PENDING") return "That voucher hasn't been paid for yet.";
  if (v.status === "CANCELLED") return "That voucher was cancelled.";
  if (v.status === "EXPIRED" || v.expiresAt.getTime() < now.getTime()) return `That voucher expired on ${fmtDate(v.expiresAt)}.`;
  if (v.status === "REDEEMED" || v.balanceCents <= 0) return "That voucher has been used up.";
  return null;
}

/** How much of the amount still due a voucher's balance can cover. */
export const voucherApply = (balanceCents: number, dueCents: number) => Math.max(0, Math.min(balanceCents, dueCents));
