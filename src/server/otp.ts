// One-time sign-in codes: members by SMS, trade buyers by email. Each step for an address runs under a Postgres
// advisory lock, so the limits hold however many requests arrive at once: five codes per address per 10 minutes, five
// tries per code, and ten wrong tries per address per hour across all its codes (then it waits out the hour).
// Two wider limits stop anyone running up the SMS bill (src/server/throttle.ts): ten codes an hour from one connection,
// and a network-wide ceiling on texts an hour (OTP_SMS_HOURLY_MAX, default 500) that pauses SMS codes when reached.
import { randomInt } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { sha256 } from "./crypto";
import { hit, ipKey } from "./throttle";
import { audit, SYSTEM } from "./audit";

export type OtpAddress = { phone: string } | { email: string };
export const OTP_MINUTES = 10;
const CODES_PER_WINDOW = 5;
const TRIES_PER_CODE = 5;
const WRONG_PER_HOUR = 10;
const HOUR_MS = 3_600_000;
const CODES_PER_IP_HOUR = 30; // mobile networks put many shoppers behind one address (carrier-grade NAT)

/** A wider limit refused the code (the connection's, or the SMS ceiling); the message says what to do. */
export class OtpLimitError extends Error {}

const value = (a: OtpAddress) => ("phone" in a ? a.phone : a.email);
const hashOf = (a: OtpAddress, code: string) => sha256(`${value(a)}:${code}`);
const lock = (t: Tx, a: OtpAddress) => t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`otp:${"phone" in a ? "phone" : "email"}:${value(a)}`}))`;

/**
 * A new six-digit code for the address, or null when five went out in the last 10 minutes. Pass the requester's IP
 * (clientIpFrom) from a request; it's only left out by scripts and tests. Throws OtpLimitError past the wider limits.
 */
export async function issueCode(a: OtpAddress, opts?: { ip: string | null }): Promise<string | null> {
  if (opts && !(await hit(`otp-ip:${ipKey(opts.ip)}`, CODES_PER_IP_HOUR, HOUR_MS))) throw new OtpLimitError("Too many codes requested — try again in an hour");
  if ("phone" in a) await smsCeiling();
  return tx(async (t) => {
    await lock(t, a);
    const recent = await t.otp.count({ where: { ...a, createdAt: { gte: new Date(Date.now() - OTP_MINUTES * 60_000) } } });
    if (recent >= CODES_PER_WINDOW) return null;
    const code = String(randomInt(100_000, 1_000_000));
    await t.otp.create({ data: { ...a, codeHash: hashOf(a, code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) } });
    return code;
  });
}

/** Counts one text against the hourly ceiling; when it's reached, says so once an hour (log + audit) and refuses. */
async function smsCeiling() {
  const max = Number(process.env.OTP_SMS_HOURLY_MAX ?? 500);
  if (await hit("otp-sms:all", max, HOUR_MS)) return;
  if (await hit("otp-sms:alerted", 1, HOUR_MS)) {
    console.error(`[otp] SMS ceiling reached: ${max} sign-in codes in the last hour — new SMS codes are refused until the hour passes (OTP_SMS_HOURLY_MAX)`);
    await audit(db, SYSTEM, "otp.ceiling", { data: { max } });
  }
  throw new OtpLimitError("We can't send codes right now — please try again shortly");
}

export type CodeCheck = "ok" | "wrong" | "expired" | "locked";

/** Checks a code against the address's latest unexpired one; a right one uses up every code the address has. */
export function checkCode(a: OtpAddress, code: string): Promise<CodeCheck> {
  return tx(async (t) => {
    await lock(t, a);
    const now = Date.now();
    const wrong = await t.otp.aggregate({ where: { ...a, createdAt: { gte: new Date(now - 3_600_000) } }, _sum: { attempts: true } });
    if ((wrong._sum.attempts ?? 0) >= WRONG_PER_HOUR) return "locked";
    const otp = await t.otp.findFirst({ where: { ...a, expiresAt: { gt: new Date(now) } }, orderBy: { createdAt: "desc" } });
    if (!otp || otp.attempts >= TRIES_PER_CODE) return "expired";
    if (otp.codeHash !== hashOf(a, code.trim())) {
      await t.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return "wrong";
    }
    await t.otp.deleteMany({ where: a });
    return "ok";
  });
}
