// Replenishment forecast: a 14-day moving average of daily sales (seasonality ignored) × lead time, plus safety stock
// for the variation in daily demand over the lead time. Used for the suggested order quantity on the replenishment screen.
export const FORECAST_WINDOW = 14;
const DAY = 86_400_000;

/** Mean of the last `window` values (shorter series are padded with zero days: no sales is a fact, not missing data). */
export function movingAverage(daily: number[], window = FORECAST_WINDOW) {
  if (window <= 0) return 0;
  const tail = daily.slice(-window);
  return tail.reduce((s, v) => s + v, 0) / window;
}

/** Population standard deviation over the same window (zero-padded like the average). */
export function stdDev(daily: number[], window = FORECAST_WINDOW) {
  if (window <= 0) return 0;
  const tail = [...Array(Math.max(0, window - daily.length)).fill(0), ...daily.slice(-window)] as number[];
  const mean = tail.reduce((s, v) => s + v, 0) / window;
  return Math.sqrt(tail.reduce((s, v) => s + (v - mean) ** 2, 0) / window);
}

export type Forecast = {
  perDay: number;
  perWeek: number;
  /** Units expected to sell before an order placed today arrives. */
  leadDemand: number;
  /** Buffer against demand above average during the lead time (z × σ × √lead). */
  safetyStock: number;
};

export function forecast(daily: number[], opts: { leadDays?: number; window?: number; serviceZ?: number } = {}): Forecast {
  const lead = Math.max(1, opts.leadDays ?? 3);
  const window = opts.window ?? FORECAST_WINDOW;
  const perDay = movingAverage(daily, window);
  const sd = stdDev(daily, window);
  return {
    perDay,
    perWeek: perDay * 7,
    leadDemand: perDay * lead,
    safetyStock: perDay > 0 ? Math.ceil((opts.serviceZ ?? 1.65) * sd * Math.sqrt(lead)) : 0,
  };
}

export type ForecastInput = {
  available: number;
  onOrder: number;
  reorderPoint: number;
  parLevel: number;
  /** Daily units sold, oldest first (the last FORECAST_WINDOW entries are used). */
  daily: number[];
  leadDays?: number;
  coverDays?: number;
  packSize?: number;
};

/**
 * Suggested order quantity from the forecast: reorder once the stock position (on hand + on order) can't cover the
 * lead time plus safety stock (or falls to the reorder point), and top up to lead + cover days of forecast sales plus
 * safety stock (never below par). Whole packs.
 */
export function forecastQty(i: ForecastInput) {
  const lead = i.leadDays ?? 3;
  const cover = i.coverDays ?? 14;
  const f = forecast(i.daily, { leadDays: lead });
  const position = i.available + i.onOrder;
  const trigger = Math.max(i.reorderPoint, Math.ceil(f.leadDemand) + f.safetyStock);
  if (position > trigger) return 0;
  const target = Math.max(i.parLevel, Math.ceil(f.perDay * (lead + cover)) + f.safetyStock);
  const need = Math.max(0, target - position);
  const pack = Math.max(1, i.packSize ?? 1);
  return Math.ceil(need / pack) * pack;
}

/**
 * Turns rollup rows (one per day with sales) into a dense daily series for the `days` days ending on `endDay`
 * (YYYY-MM-DD), zero for days without sales, oldest first.
 */
export function dailySeries(rows: { date: string; units: number }[], days: number, endDay: string) {
  const end = Date.parse(`${endDay}T00:00:00Z`);
  const out = new Array<number>(days).fill(0);
  for (const r of rows) {
    const i = days - 1 - Math.round((end - Date.parse(`${r.date}T00:00:00Z`)) / DAY);
    if (i >= 0 && i < days) out[i] += r.units;
  }
  return out;
}
