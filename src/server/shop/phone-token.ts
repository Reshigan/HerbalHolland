// Short-lived proof that a phone number passed OTP verification, carried in an
// httpOnly cookie between "verify code" and "finish registration" so a new member
// can only ever be created for a number they control.
import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "../secret";

const mac = (body: string) => createHmac("sha256", appSecret()).update(`verified-phone:${body}`).digest("base64url");

/** `sentTo`: the email the code went to when it went by email (base64url, so dots in it don't split the token). */
export function signPhone(phone: string, ttlMinutes = 20, now = Date.now(), sentTo: string | null = null) {
  const body = `${phone}.${now + ttlMinutes * 60_000}.${sentTo ? Buffer.from(sentTo).toString("base64url") : ""}`;
  return `${body}.${mac(body)}`;
}

export function readPhoneToken(token: string | null | undefined, now = Date.now()): { phone: string; sentTo: string | null } | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [phone, exp, to] = body.split(".");
  if (!phone || !(Number(exp) > now)) return null;
  return { phone, sentTo: to ? Buffer.from(to, "base64url").toString() : null };
}
