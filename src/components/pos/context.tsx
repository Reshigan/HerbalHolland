"use client";
import { createContext, useContext } from "react";
import type { BootData, BootShift, OrderCard, ReceiptDTO, StaffTile, ZReport } from "@/server/pos/types";
import type { OutboxItem, SalePayload } from "./lib/storage";

export type PrintDoc = { kind: "receipt"; receipt: ReceiptDTO; changeCents?: number } | { kind: "z"; report: ZReport };

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
};

export type PosTab = "sell" | "orders" | "sales" | "stock" | "shift";

export const PosContext = createContext<PosCtx | null>(null);

export function usePos() {
  const c = useContext(PosContext);
  if (!c) throw new Error("usePos must be used inside the till");
  return c;
}
