// Route-handler plumbing for /api/pos/*: device + staff authentication, JSON bodies
// validated with zod, and domain errors mapped to { error } responses with proper codes.
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getDevice, getPosStaff } from "@/server/auth";
import { SaleError } from "@/server/sales";
import { OrderError } from "@/server/orders";
import { CustomerError } from "@/server/customers";
import { StockError } from "@/server/inventory";
import { LoyaltyError } from "@/server/loyalty";
import { EventError } from "@/server/events";
import { VoucherError } from "@/server/shop/vouchers";
import { TradeAccountError } from "@/server/trade/accounts";
import { TradeOrderError } from "@/server/trade/orders";
import { TradeLedgerError } from "@/server/trade/ledger";
import type { Actor } from "@/server/audit";
import { sameOrigin } from "@/lib/same-origin";
import { Prisma } from "@/generated/prisma/client";

export class PosError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

const NO_STORE = { "cache-control": "no-store" };

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status, headers: NO_STORE });
export const fail = (status: number, error: string, code?: string) => NextResponse.json({ error, ...(code && { code }) }, { status, headers: NO_STORE });

export type PosDevice = NonNullable<Awaited<ReturnType<typeof getDevice>>>;
export type PosStaff = NonNullable<Awaited<ReturnType<typeof getPosStaff>>>;

export const actorOf = (pos: PosStaff): Actor => ({ type: "USER", id: pos.user.id, name: pos.user.name });

function handleError(e: unknown) {
  if (e instanceof PosError) return fail(e.status, e.message, e.code);
  if (e instanceof ZodError) return fail(400, e.issues[0]?.message ?? "Invalid request");
  if (
    e instanceof SaleError || e instanceof OrderError || e instanceof CustomerError || e instanceof StockError || e instanceof LoyaltyError || e instanceof EventError || e instanceof VoucherError ||
    e instanceof TradeAccountError || e instanceof TradeOrderError || e instanceof TradeLedgerError
  )
    return fail(422, e.message);
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail(409, "That's already on record for another member or sale");
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return fail(404, "Not found");
  console.error("[pos]", e);
  return fail(500, "Something went wrong on our side — please try again");
}

// The device and PIN cookies go with any request the browser makes, so a change (anything but a read) must come from
// the till's own pages, never from a page on another site.
const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const crossSite = (req: Request) => !READS.has(req.method) && !sameOrigin(req.headers, req.url);
const CROSS_SITE = () => fail(403, "This request didn't come from the till", "CROSS_SITE");

/** Device-authenticated handler (pairing is done; no staff PIN needed — the lock screen). */
export function withDevice<C = unknown>(handler: (req: Request, device: PosDevice, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (crossSite(req)) return CROSS_SITE();
    try {
      const device = await getDevice();
      if (!device) return fail(401, "This device isn't paired to a store", "UNPAIRED");
      return await handler(req, device, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

/** Device + staff session (PIN) authenticated handler. */
export function withStaff<C = unknown>(handler: (req: Request, pos: PosStaff, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (crossSite(req)) return CROSS_SITE();
    try {
      const device = await getDevice();
      if (!device) return fail(401, "This device isn't paired to a store", "UNPAIRED");
      const pos = await getPosStaff();
      if (!pos || pos.user.storeId !== device.storeId) return fail(401, "Enter your PIN to continue", "LOCKED");
      return await handler(req, pos, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

/** Unauthenticated handler (pairing) with the same error mapping and cross-site check (pairing sets the device cookie). */
export function open<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (crossSite(req)) return CROSS_SITE();
    try {
      return await handler(req, ctx);
    } catch (e) {
      return handleError(e);
    }
  };
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  // JSON only: a page on another site can't send that without the browser asking first (no cross-site form posts).
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PosError("Expected a JSON body", 415);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new PosError("Expected a JSON body");
  }
  return schema.parse(raw);
}
