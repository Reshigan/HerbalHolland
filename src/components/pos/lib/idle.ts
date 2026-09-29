// Quiet hours: when no sale is open and nobody has touched the till for a while, the Sell screen shows a calm
// dashboard built from what the till already caches (bootstrap, order board, outbox) plus the shift's X-report.
// Pure rules, unit-tested in tests/till-hardware.test.ts.
import type { BootData, OrderCard, ZReport } from "@/server/pos/types";
import type { OutboxItem } from "./storage";

export const QUIET_AFTER_MS = 3 * 60_000;
/** Test hook: ?idleMs=5000 on the till's URL (or the stored override) shortens the wait. */
export const IDLE_OVERRIDE_KEY = "idle-ms";

export function idleDelay(search: string, stored: number | null): number {
  const q = Number(new URLSearchParams(search).get("idleMs"));
  if (Number.isFinite(q) && q >= 1000) return q;
  if (stored && stored >= 1000) return stored;
  return QUIET_AFTER_MS;
}

export type QuietTask = { key: string; text: string; tone: "ok" | "warn"; tab?: "sell" | "orders" | "sales" | "stock" | "shift" };

export type QuietDashboard = {
  takings: { cents: number; sales: number; refunds: number } | null; // null = no shift open / not loaded
  handover: OrderCard[]; // ready click & collect orders waiting for their member
  toPick: number; // placed + picking
  lowStock: { name: string; variantName: string; available: number }[];
  tasks: QuietTask[];
  nextEvent: BootData["nextEvent"];
};

/** Whether the till is quiet: nothing in the basket, no member attached, nothing being paid. */
export const saleIsOpen = (cart: { lines: { qty: number }[]; customer: unknown }) => cart.lines.length > 0 || !!cart.customer;

export function quietDashboard(i: { boot: BootData; orders: OrderCard[] | null; outbox: OutboxItem[]; x: ZReport | null; online: boolean; now?: Date }): QuietDashboard {
  const now = i.now ?? new Date();
  const orders = i.orders ?? [];
  const handover = orders.filter((o) => o.status === "READY" && o.fulfilment === "COLLECT").sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? ""));
  const toPick = orders.filter((o) => o.status === "PLACED" || o.status === "PICKING").length;
  const lowStock = i.boot.products
    .flatMap((p) => p.variants.map((v) => ({ name: p.name, variantName: v.name, available: v.available })))
    .filter((v) => v.available <= 3)
    .sort((a, b) => a.available - b.available || a.name.localeCompare(b.name))
    .slice(0, 6);

  const tasks: QuietTask[] = [];
  if (!i.boot.shift) tasks.push({ key: "shift", text: "No shift is open — open one with a counted float before the first sale", tone: "warn", tab: "shift" });
  const queued = i.outbox.filter((o) => !o.deviceId || o.deviceId === i.boot.device.id).length;
  if (queued) tasks.push({ key: "outbox", text: `${queued} offline sale${queued === 1 ? "" : "s"} waiting to sync — check the connection`, tone: "warn", tab: "sell" });
  const late = orders.filter((o) => (o.status === "PLACED" || o.status === "PICKING") && now.getTime() - new Date(o.placedAt).getTime() > 15 * 60_000).length;
  if (late) tasks.push({ key: "late", text: `${late} online order${late === 1 ? "" : "s"} past the 15-minute ready time`, tone: "warn", tab: "orders" });
  else if (toPick) tasks.push({ key: "pick", text: `${toPick} online order${toPick === 1 ? "" : "s"} to pick`, tone: "ok", tab: "orders" });
  const out = i.boot.products.reduce((n, p) => n + p.variants.filter((v) => v.available <= 0).length, 0);
  if (out) tasks.push({ key: "out", text: `${out} line${out === 1 ? "" : "s"} showing none on the shelf — check and count`, tone: "ok", tab: "stock" });
  const ageH = (now.getTime() - new Date(i.boot.fetchedAt).getTime()) / 3_600_000;
  if (ageH > 6) tasks.push({ key: "stale", text: `Catalogue last refreshed ${Math.round(ageH)} hours ago${i.online ? " — refresh it from Shift → This till" : " (offline)"}`, tone: "ok", tab: "shift" });
  if (!tasks.length) tasks.push({ key: "clear", text: "All clear — nothing waiting on this till", tone: "ok" });

  const takings = i.x && i.boot.shift ? { cents: i.x.takingsCents, sales: i.x.sales.count, refunds: i.x.refunds.count } : null;
  const nextEvent = i.boot.nextEvent && new Date(i.boot.nextEvent.endsAt) > now ? i.boot.nextEvent : null;
  return { takings, handover, toPick, lowStock, tasks, nextEvent };
}
