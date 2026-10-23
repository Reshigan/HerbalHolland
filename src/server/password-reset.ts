// Staff "forgot password": a signed link by email, good for RESET_MINUTES and only until the password changes
// (the token carries a fingerprint of the current hash, so a used or superseded link stops working without any table).
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { appSecret } from "./secret";
import { hashSecret, sha256 } from "./crypto";
import { audit } from "./audit";
import { emailLayout, esc, sendEmail } from "./email";
import { background } from "./background";
import { graphConfigured } from "./graph-mail";
import { APP_URL } from "./invoices";

export const RESET_MINUTES = 30;
export const RESET_SENT = "If that email belongs to a staff account, a reset link is on its way. It works for 30 minutes.";

const mac = (body: string) => createHmac("sha256", appSecret()).update(`password-reset:${body}`).digest("base64url");
const fingerprint = (hash: string | null) => sha256(hash ?? "").slice(0, 16);

export function signReset(user: { id: string; passwordHash: string | null }, now = Date.now()) {
  const body = `${user.id}.${now + RESET_MINUTES * 60_000}.${fingerprint(user.passwordHash)}`;
  return `${body}.${mac(body)}`;
}

/** The user the token still opens, or null (bad signature, expired, or the password has changed since). */
export async function readReset(token: string | null | undefined, now = Date.now()) {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [id, exp, fp] = body.split(".");
  if (!id || !(Number(exp) > now)) return null;
  const user = await db.user.findUnique({ where: { id } });
  return user?.active && fingerprint(user.passwordHash) === fp ? user : null;
}

/**
 * Always answers the same way, and in the same time (the email goes out in the background), so the form can't be used
 * to find out which emails have accounts. Only an account that already signs in with a password gets a link: a till
 * PIN account without one can't be given back-office access this way.
 */
export async function requestReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase().slice(0, 254);
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (!user?.active || !user.email || !user.passwordHash || !graphConfigured()) return;
  const url = `${APP_URL()}/login/reset?t=${signReset(user)}`;
  const first = user.name.split(" ")[0];
  background("password reset email", sendEmail({
    to: user.email,
    subject: "Reset your Herbal Holland password",
    html: emailLayout({
      preheader: "A link to choose a new password, valid for 30 minutes.",
      eyebrow: "Herbal Holland platform",
      heading: `Hi ${esc(first)}, let's reset your password`,
      body: `<p style="margin:0 0 12px;font-size:14px;line-height:21px">Someone asked for a password reset on your account. If it was you, choose a new password with the button below within ${RESET_MINUTES} minutes.</p><p style="margin:0;font-size:14px;line-height:21px">If it wasn't you, ignore this email: your password stays as it is.</p>`,
      cta: { label: "Choose a new password", href: url },
      footerHtml: "You received this because a password reset was requested for your Herbal Holland staff sign-in.",
    }),
    text: `Hi ${first},\n\nSomeone asked for a password reset on your Herbal Holland account. If it was you, choose a new password here within ${RESET_MINUTES} minutes:\n${url}\n\nIf it wasn't you, ignore this email: your password stays as it is.`,
    logText: `Password reset link sent (valid ${RESET_MINUTES} minutes; the link is not kept here).`,
  }));
  await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.reset_requested", { storeId: user.storeId, entity: "User", entityId: user.id });
}

/**
 * Sets the password from a valid link; every session is signed out. The write is conditional on the hash the link was
 * issued against, so of two links used at once only the first takes: the second finds the hash gone and fails.
 */
export async function completeReset(user: { id: string; name: string; storeId: string | null; passwordHash: string | null }, password: string) {
  const { count } = await db.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: { passwordHash: await hashSecret(password), mustChangePassword: false, tempPasswordUntil: null, passwordFails: 0, passwordLockedAt: null },
  });
  if (!count) return false;
  await db.session.deleteMany({ where: { userId: user.id } });
  await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.password_reset", { storeId: user.storeId, entity: "User", entityId: user.id });
  return true;
}
