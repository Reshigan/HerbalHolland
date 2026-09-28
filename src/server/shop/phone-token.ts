// Short-lived proof that a phone number passed OTP verification, carried in an
// httpOnly cookie between "verify code" and "finish registration" so a new member
// can only ever be created for a number they control.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.SESSION_SECRET ?? "dev";
const mac = (body: string) => createHmac("sha256", secret()).update(`verified-phone:${body}`).digest("base64url");

export function signPhone(phone: string, ttlMinutes = 20, now = Date.now()) {
  const body = `${phone}.${now + ttlMinutes * 60_000}`;
  return `${body}.${mac(body)}`;
}

export function readPhoneToken(token: string | null | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [phone, exp] = body.split(".");
  if (!phone || !(Number(exp) > now)) return null;
  return phone;
}
