// Herbal Holland Rewards membership: phone OTP sign-in, adult-only enrolment, consent ledger,
// age verification and the SAHPRA patient register.
import { createHmac } from "node:crypto";
import { db, tx } from "./db";
import { send } from "./messaging";
import { APP_URL } from "./invoices";
import { addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { audit, type Actor } from "./audit";
import { nextNumber, shortCode } from "./counters";
import { checkCode, issueCode, OtpLimitError } from "./otp";
import { count, hit } from "./throttle";
import { ageOn, checkSaId, normalisePhone } from "@/lib/sa";
import type { AgeCheck, MsgChannel } from "@/generated/prisma/client";
import { DEALS_QUESTION, TERMS_VERSION } from "@/lib/terms";
import { interestsFrom } from "@/lib/rfm";
import { appSecret } from "./secret";

export class CustomerError extends Error {}

/** Why a sign-in code didn't work (members and trade buyers alike). */
export const CODE_PROBLEM = { wrong: "That code isn't right", expired: "That code has expired. Request a new one", locked: "Too many wrong codes. Try again in an hour" } as const;

const idHash = (id: string) => createHmac("sha256", appSecret()).update(id).digest("hex");

/** Texts a sign-in code. Requests pass the requester's IP (clientIpFrom) for the per-connection limit (src/server/otp.ts). */
export async function requestOtp(raw: string, opts?: { ip: string | null }) {
  const phone = normalisePhone(raw);
  if (!phone) throw new CustomerError("Enter a valid South African mobile number");
  const code = await issueCode({ phone }, opts).catch((e) => {
    throw e instanceof OtpLimitError ? new CustomerError(e.message) : e;
  });
  if (!code) throw new CustomerError("Too many codes requested. Try again in 10 minutes");
  const text = (c: string) => `Your Herbal Holland code is ${c}. It expires in 10 minutes.`;
  const sms = await send({ channel: "SMS", to: phone, body: `${text(code)}\n\n@${new URL(APP_URL()).hostname} #${code}`, logBody: text("••••••"), kind: "TRANSACTIONAL" });
  if (sms.status === "FAILED") throw new CustomerError("We couldn't send your code just now. Please try again in a minute");
  return { phone, demoCode: process.env.DEMO_MODE === "true" ? code : undefined };
}

export async function verifyOtp(raw: string, code: string) {
  const phone = normalisePhone(raw);
  if (!phone) throw new CustomerError("Invalid phone number");
  const r = await checkCode({ phone }, code);
  if (r !== "ok") throw new CustomerError(CODE_PROBLEM[r]);
  return { phone, customer: await db.customer.findUnique({ where: { phone } }) };
}

// ── Someone else's ID number or email ──────────────────────────────────────────
// "That ID number is already linked to a member" tells whoever typed it something about another person, so online it
// is rationed: three a day per phone being joined or per signed-in member, then nothing more can be checked that way
// (staff in a store can still help). Every collision is audited.
const COLLISIONS_PER_DAY = 3;
const DAY_MS = 86_400_000;
export const COLLISION_REFUSED = "We can't check that right now. Try again tomorrow, or visit a store with your ID";

/** An ID number already linked to another member (a CustomerError, so staff screens show it as before). */
export class CollisionError extends CustomerError {}

/** Whether this phone (joining) or member (signed in) has used up today's collisions. */
export const collisionsUsedUp = async (key: string) => (await count(`collision:${key}`, DAY_MS)) >= COLLISIONS_PER_DAY;

/** Records a collision for `key` ("phone:+27…" or "member:<id>"); false when it's over today's limit. */
export async function noteCollision(key: string, actor: Actor, field: "idNumber" | "email") {
  const allowed = await hit(`collision:${key}`, COLLISIONS_PER_DAY, DAY_MS);
  await audit(db, actor, "member.collision", { ...(actor.id && { entity: "Customer", entityId: actor.id }), data: { field, by: key, refused: !allowed } });
  return allowed;
}

export type NewCustomer = {
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string;
  idNumber?: string;
  dob?: Date;
  homeStoreId?: string | null;
  referralCode?: string;
  consents: Partial<Record<MsgChannel, boolean>>;
  source: string;
  joinedVia?: string | null; // raw ?src= tag; normalised by joinTag
  termsAccepted: boolean; // accepted the membership terms (TERMS_VERSION); required to join
  interests?: string[]; // what they told us they're into (INTERESTS keys), for relevant deals
  consentWording?: string; // what they were asked, for the consent ledger (default: the online wording)
  ageCheck?: AgeCheck; // e.g. ID_SIGHTED when a member advisor checked a passport in store
};

/** A join-link tag (`/club/join?src=flyer-hillcrest`): lowercase letters, digits and dashes, up to 40 characters. */
export const joinTag = (raw?: string | null) => {
  const t = raw?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(t) ? t : null;
};

export async function createCustomer(a: NewCustomer, actor: Actor) {
  const settings = await getSettings();
  if (!a.termsAccepted) throw new CustomerError("Membership needs the member to accept the membership terms");
  const phone = normalisePhone(a.phone);
  if (!phone) throw new CustomerError("Enter a valid South African mobile number");
  if (await db.customer.findUnique({ where: { phone } })) throw new CustomerError("That number is already a member");

  let dob = a.dob ?? null;
  let ageCheck: AgeCheck = a.ageCheck ?? "NONE";
  let hash: string | null = null;
  let last4: string | null = null;
  if (a.idNumber) {
    const id = checkSaId(a.idNumber);
    if (!id.valid) throw new CustomerError(id.reason);
    dob = id.dob;
    hash = idHash(a.idNumber.replace(/\s/g, ""));
    last4 = a.idNumber.slice(-4);
    if (ageCheck === "NONE") ageCheck = "ID_NUMBER";
    if (await db.customer.findUnique({ where: { idHash: hash } })) throw new CollisionError("That ID number is already linked to a member");
  }
  if (dob && isNaN(+dob)) throw new CustomerError("Enter a valid date of birth");
  if (dob && ageOn(dob) < settings.compliance.minAge) throw new CustomerError(`Herbal Holland Rewards is for adults ${settings.compliance.minAge}+`);

  const referrer = a.referralCode ? await db.customer.findUnique({ where: { referralCode: a.referralCode.trim().toUpperCase() } }) : null;
  const channels: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

  return tx(async (t) => {
    const n = await nextNumber(t, "MEMBER");
    const c = await t.customer.create({
      data: {
        memberNo: `HH${String(100000 + n).padStart(7, "0")}`,
        phone,
        email: a.email?.trim().toLowerCase() || null,
        firstName: a.firstName.trim(),
        lastName: a.lastName?.trim() || null,
        dob,
        idHash: hash,
        idLast4: last4,
        ageCheck,
        ageVerifiedAt: ageCheck === "NONE" ? null : new Date(),
        homeStoreId: a.homeStoreId ?? null,
        referralCode: `${a.firstName.trim().slice(0, 4).toUpperCase().replace(/[^A-Z]/g, "X")}${shortCode(4)}`,
        referredById: referrer?.id ?? null,
        consentWhatsapp: !!a.consents.WHATSAPP,
        consentSms: !!a.consents.SMS,
        consentEmail: !!a.consents.EMAIL,
        consentPush: !!a.consents.PUSH,
        consentAt: new Date(),
        source: a.source,
        joinedVia: joinTag(a.joinedVia),
        termsVersion: TERMS_VERSION,
        interests: interestsFrom(a.interests ?? []),
        termsAcceptedAt: new Date(),
      },
    });
    await t.consentEvent.createMany({
      data: channels.map((ch) => ({ customerId: c.id, channel: ch, granted: !!a.consents[ch], source: a.source, wording: a.consentWording ?? CONSENT_WORDING })),
    });
    if (settings.loyalty.signupBonus) await addPoints(t, { customerId: c.id, points: settings.loyalty.signupBonus, kind: "SIGNUP", note: "Welcome to Herbal Holland Rewards" });
    await audit(t, actor, "customer.create", { storeId: a.homeStoreId, entity: "Customer", entityId: c.id, data: { source: a.source, ageCheck, termsVersion: TERMS_VERSION } });
    return c;
  });
}

/** Recorded for members who join in store: staff ask DEALS_QUESTION and record the answer. */
export const STORE_CONSENT_WORDING = `Asked in store: “${DEALS_QUESTION}”`;

export const CONSENT_WORDING =
  "I'd like to hear from Herbal Holland about drops, offers and events on the channels I've ticked. I can opt out at any time by replying STOP or in my Herbal Holland Rewards settings.";

export async function setConsent(customerId: string, channel: MsgChannel, granted: boolean, source: string) {
  const field = ({ WHATSAPP: "consentWhatsapp", SMS: "consentSms", EMAIL: "consentEmail", PUSH: "consentPush" } as const)[channel];
  await db.$transaction([
    db.customer.update({ where: { id: customerId }, data: { [field]: granted, consentAt: new Date() } }),
    db.consentEvent.create({ data: { customerId, channel, granted, source, wording: granted ? CONSENT_WORDING : "Opted out" } }),
  ]);
}

/** Records an age check. ID_NUMBER validates format + checksum only; VERIFIED needs a live provider (VerifyNow / Smile ID). */
export async function recordAgeCheck(customerId: string, method: AgeCheck, actor: Actor, idNumber?: string) {
  const settings = await getSettings();
  let dob: Date | undefined;
  if (idNumber) {
    const id = checkSaId(idNumber);
    if (!id.valid) throw new CustomerError(id.reason);
    dob = id.dob;
    if (ageOn(dob) < settings.compliance.minAge) throw new CustomerError(`Members must be ${settings.compliance.minAge} or older`);
  }
  const c = await db.customer.update({
    where: { id: customerId },
    data: {
      ageCheck: method,
      ageVerifiedAt: new Date(),
      ...(dob && { dob, idHash: idHash(idNumber!.replace(/\s/g, "")), idLast4: idNumber!.slice(-4) }),
    },
  });
  await audit(db, actor, "customer.age_check", { entity: "Customer", entityId: customerId, data: { method } });
  return c;
}

export async function addPatientAuthorisation(
  customerId: string,
  a: { authNumber: string; prescriber: string; prescriberRegNo: string; scope: string; monthlyLimitGrams: number; validFrom: Date; validTo: Date; documentRef?: string },
  actor: Actor,
) {
  if (a.validTo <= a.validFrom) throw new CustomerError("Authorisation end date must be after the start date");
  const auth = await db.patientAuth.create({ data: { customerId, ...a, verifiedById: actor.id ?? null } });
  await audit(db, actor, "patient.authorisation_add", { entity: "PatientAuth", entityId: auth.id, data: { authNumber: a.authNumber } });
  return auth;
}
