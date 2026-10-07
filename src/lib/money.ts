// Money is integer cents (ZAR). Retail prices are VAT-inclusive.
export const VAT_RATE = 0.15;

export const vatOf = (inclCents: number) => Math.round((inclCents * 15) / 115);
export const exVat = (inclCents: number) => inclCents - vatOf(inclCents);
export const vatOnExcl = (exclCents: number) => Math.round(exclCents * VAT_RATE);

const two = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** R1,234.50 */
export function zar(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}R${two.format(Math.abs(cents) / 100)}`;
}

/** R1,235 — for shelf prices and marketing. */
export function zarWhole(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const v = Math.abs(cents) / 100;
  return `${sign}R${Number.isInteger(v) ? whole.format(v) : two.format(v)}`;
}

/** R12.4k / R3.1m — for dense dashboards. */
export function zarCompact(cents: number) {
  const v = cents / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R${(v / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}m`;
  if (a >= 10_000) return `R${(v / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return zarWhole(Math.round(cents));
}

/** An amount input's value: "1234.50" (no grouping, so it reads straight back); "" for none. */
export const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));

// A rand amount as typed: digits, then a decimal point or comma and up to two digits; or thousands grouped by commas
// (then only a decimal point can follow) or by spaces. Linear patterns, run on at most 40 characters.
const PLAIN = /^(\d+)(?:[.,](\d{0,2}))?$/;
const COMMA_GROUPS = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{0,2}))?$/;
const SPACE_GROUPS = /^(\d{1,3}(?: \d{3})+)(?:[.,](\d{0,2}))?$/;
const isMinus = (c: string) => c === "-" || c === "\u2212"; // U+2212: the minus sign the app prints on adjustments

/**
 * A rand amount someone typed → integer cents; null when empty, malformed or ambiguous. Takes "12", "12.5", "12,50"
 * (decimal comma), "1 234,50", "1 234.50", "1,234.50", "R1,234.50" and "R 1 234"; no-break and thin spaces group
 * thousands like a space. A comma before exactly three digits groups thousands ("1,234" is R1,234.00); before one or
 * two digits at the end it's the decimal comma. A leading minus ("-R50", "R -50") only with `signed`.
 */
export function parseRand(raw: string | null | undefined, { signed = false }: { signed?: boolean } = {}): number | null {
  const text = String(raw ?? "");
  if (text.length > 40) return null;
  let s = text.replace(/[\u00A0\u2009\u202F]/g, " ").trim();
  let negative = isMinus(s.charAt(0));
  if (negative) s = s.slice(1).trimStart();
  if (s.charAt(0) === "R" || s.charAt(0) === "r") s = s.slice(1).trimStart();
  if (!negative && isMinus(s.charAt(0))) (negative = true), (s = s.slice(1).trimStart());
  if (negative && !signed) return null;
  const m = PLAIN.exec(s) ?? COMMA_GROUPS.exec(s) ?? SPACE_GROUPS.exec(s);
  if (!m) return null;
  const cents = Number(m[1].replace(/[ ,]/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents ? -cents : cents;
}

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const bps = (b: number) => `${(b / 100).toFixed(b % 100 ? 1 : 0)}%`;
export const applyBps = (cents: number, b: number) => Math.round((cents * b) / 10_000);

/** Split `total` across `weights` so the parts always sum exactly to total. */
export function allocateProportionally(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}
