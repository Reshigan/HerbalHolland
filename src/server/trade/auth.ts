// Trade portal sign-in: a six-digit code emailed to a buyer (never a password), a 12-hour session in the hh_trade
// cookie. Only an active buyer on an account that isn't closed can sign in; every trade mutation re-checks the
// account's status itself (accounts.ts requireTradeAccount, orders.ts).
import { redirect } from "next/navigation";
import { db } from "../db";
import { COOKIE, endSession, getTradeBuyer, startSession, TRADE_SESSION_HOURS, tradeBuyerForToken, type TradeBuyerSession } from "../auth";
import { checkCode, issueCode, OTP_MINUTES } from "../otp";
import { CODE_PROBLEM } from "../customers";
import { deliverEmail } from "../email";
import { audit } from "../audit";
import { normaliseEmail } from "@/lib/trade";
import { tradeCodeEmail } from "./emails";
import { tradeActor } from "./accounts";

export class TradeAuthError extends Error {}

export { getTradeBuyer, tradeBuyerForToken, COOKIE, TRADE_SESSION_HOURS, type TradeBuyerSession };

const CODE_MINUTES = OTP_MINUTES;

/**
 * Emails a sign-in code (src/server/otp.ts: five per address per ten minutes). An address that isn't a buyer's gets no
 * email (and no hint): the reply looks the same either way. DEMO_MODE returns the code so the demo can sign in
 * without a mailbox.
 */
export async function requestTradeCode(raw: string) {
  const email = normaliseEmail(raw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new TradeAuthError("Enter your email address");
  const buyer = await db.tradeBuyer.findUnique({ where: { email }, include: { account: { select: { status: true } } } });
  if (!buyer?.active || buyer.account.status === "CLOSED") return { email, demoCode: undefined as string | undefined };
  const code = await issueCode({ email });
  if (!code) throw new TradeAuthError("Too many codes requested — try again in 10 minutes");
  const r = tradeCodeEmail({ code, minutes: CODE_MINUTES });
  let reason: string | null = null;
  let delivered = false;
  try {
    delivered = await deliverEmail({ to: email, subject: r.subject, html: r.html, text: r.text, kind: "TRANSACTIONAL" });
  } catch (err) {
    reason = String((err as Error)?.message ?? err).slice(0, 300);
    console.error("[trade] sign-in code email failed", reason);
  }
  // Logged without the code (HQ → Messages shows that a code went out, never what it was).
  const masked = tradeCodeEmail({ code: "••••••", minutes: CODE_MINUTES });
  await db.messageLog.create({ data: { channel: "EMAIL", to: email, kind: "TRANSACTIONAL", status: reason ? "FAILED" : "SENT", reason: reason ?? (delivered ? null : "logged (SMTP_URL not set)"), body: `${masked.subject}\n\n${masked.text}` } });
  if (reason) throw new TradeAuthError("We couldn't send your code just now — please try again in a minute");
  return { email, demoCode: process.env.DEMO_MODE === "true" ? code : undefined };
}

/**
 * Checks a code (src/server/otp.ts: the latest unexpired one, five tries each, ten wrong an hour). Returns the buyer
 * with their account (active, account not closed) — the caller then starts the session (signInTradeBuyer).
 */
export async function verifyTradeCode(raw: string, code: string) {
  const email = normaliseEmail(raw);
  const r = await checkCode({ email }, code);
  if (r !== "ok") throw new TradeAuthError(CODE_PROBLEM[r]);
  const buyer = await db.tradeBuyer.findUnique({ where: { email }, include: { account: true } });
  if (!buyer?.active) throw new TradeAuthError("This sign-in has been switched off — ask the account's owner to add you again");
  if (buyer.account.status === "CLOSED") throw new TradeAuthError("This trade account is closed");
  return buyer;
}

/** Starts the portal session (12 hours) for a verified buyer and records the sign-in. */
export async function signInTradeBuyer(buyer: { id: string; name: string; tradeAccountId: string }) {
  await startSession("trade", { tradeBuyerId: buyer.id }, TRADE_SESSION_HOURS);
  await db.tradeBuyer.update({ where: { id: buyer.id }, data: { lastSignInAt: new Date() } });
  await audit(db, tradeActor(buyer), "trade.signin", { entity: "TradeAccount", entityId: buyer.tradeAccountId });
}

/** Both steps for a route handler: verify, then sign in. */
export async function signInWithTradeCode(email: string, code: string) {
  const buyer = await verifyTradeCode(email, code);
  await signInTradeBuyer(buyer);
  return buyer;
}

export const signOutTrade = () => endSession("trade");

/** The signed-in buyer (with their account), or a redirect to the portal's sign-in page. */
export async function requireTradeBuyer() {
  const buyer = await getTradeBuyer();
  if (!buyer) redirect("/trade/login");
  return buyer;
}
