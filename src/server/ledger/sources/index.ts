// Every automatic ledger source, by name. Each rule set exports its handlers and the sources to queue nightly:
// ./store — the store side (trading days, stock, cash, expenses, supplier invoices, stock orders);
// ./hq — HQ and the network (online collections, vouchers, points, trade ledger, statements and their payments).
import type { SourceHandler } from "../core";
import { STORE_SOURCES, storeBackfill, storeNightly } from "./store";
import { HQ_SOURCES, hqBackfill, hqNightly } from "./hq";

export const SOURCES: Record<string, SourceHandler> = { ...STORE_SOURCES, ...HQ_SOURCES };

/** Sources to queue each night (the day that ended, and month-end work on the 1st). */
export const NIGHTLY: ((now: Date) => Promise<{ source: string; sourceId: string }[]>)[] = [storeNightly, hqNightly];

/** Sources with activity between two SAST days (inclusive): to post history (the demo seed) or re-post a period. */
export const BACKFILL: ((from: string, to: string) => Promise<{ source: string; sourceId: string }[]>)[] = [storeBackfill, hqBackfill];
