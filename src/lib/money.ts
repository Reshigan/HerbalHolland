// Money is integer cents (ZAR). Retail prices are VAT-inclusive.
export const VAT_RATE = 0.15;

export const vatOf = (inclCents: number) => Math.round((inclCents * 15) / 115);
export const exVat = (inclCents: number) => inclCents - vatOf(inclCents);
export const incVat = (exclCents: number) => Math.round(exclCents * (1 + VAT_RATE));
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
