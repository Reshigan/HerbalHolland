"use client";
import { createContext, useContext } from "react";
import type { BootData, BootShift, OrderCard, ReceiptDTO, StaffTile, ZReport } from "@/server/pos/types";
import type { DisplaySettings, OutboxItem, SalePayload } from "./lib/storage";
import type { PrinterSettings } from "./lib/print";
import type { TrainingState } from "./lib/training";
import type { DisplaySnapshot } from "./lib/display";

/** `drawer`: kick the cash drawer with the receipt (cash sales on a paired printer). */
export type PrintDoc = { kind: "receipt"; receipt: ReceiptDTO; changeCents?: number; drawer?: boolean } | { kind: "z"; report: ZReport };

export type PosCtx = {
  boot: BootData;
  me: StaffTile;
  online: boolean;
  outbox: OutboxItem[];
  syncing: boolean;
  orders: OrderCard[] | null;
  ordersAt: string | null;
  setShift: (s: BootShift | null) => void;
  refreshBoot: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  syncNow: () => Promise<void>;
  queueSale: (p: SalePayload, totalCents: number) => void;
  /** Drops a queued offline sale the server refused (e.g. one tendered with a gift voucher): manager PIN, audited. */
  discardQueued: (id: string) => void;
  adjustStock: (moves: { variantId: string; qty: number }[]) => void;
  commitSeq: (seq: number) => void;
  nextNumber: () => { seq: number; number: string };
  lock: () => void;
  switchUser: (reason: "dispenser" | "manager", then?: () => void) => void;
  print: (doc: PrintDoc) => void;
  setBusy: (busy: boolean) => void;
  goTo: (tab: PosTab) => void;
  /** A scanned order collection QR ("HHORDER:…") waiting for the Orders board to open its handover. */
  orderScan: string | null;
  openOrderScan: (text: string) => void;
  clearOrderScan: () => void;
  toast: (msg: string, tone?: "ok" | "warn" | "error") => void;
  // ── Till hardware & modes ──
  /** Receipt printer set-up on this device (lib/print.ts); prints fall back to the browser dialog when none is paired. */
  printer: PrinterSettings;
  setPrinter: (p: PrinterSettings) => void;
  /** Kicks the cash drawer: "cash" after a cash tender (honours the setting), "manual" needs the manager PIN and is audited. */
  openDrawer: (reason: "cash" | "manual") => void;
  /** Training mode (sandbox): null when off. Starting and exiting need a manager's PIN. */
  training: TrainingState | null;
  startTraining: () => void;
  exitTraining: () => void;
  showTour: () => void;
  /** Keeps a practice receipt so the Sales tab can show and re-print it (never posted). */
  trainingSale: (receipt: ReceiptDTO) => void;
  /** Customer display: publish what the customer may see (BroadcastChannel + the paired screen's feed). */
  display: (snapshot: DisplaySnapshot) => void;
  displaySettings: DisplaySettings | null;
  setDisplaySettings: (d: DisplaySettings | null) => void;
  /** Idle messages for the customer display (brand lines, deals never on medicines, the next event). */
  idleMessages: string[];
};

export type PosTab = "sell" | "orders" | "sales" | "stock" | "shift";

export const PosContext = createContext<PosCtx | null>(null);

export function usePos() {
  const c = useContext(PosContext);
  if (!c) throw new Error("usePos must be used inside the till");
  return c;
}
