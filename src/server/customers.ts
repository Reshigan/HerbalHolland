// Windmill Club membership: phone OTP sign-in, adult-only enrolment, consent ledger,
// age verification and the SAHPRA patient register.
import { createHmac, randomInt } from "node:crypto";
import { db, tx } from "./db";
import { send } from "./messaging";
import { addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { audit, type Actor } from "./audit";
import { nextNumber, shortCode } from "./counters";
import { sha256 } from "./crypto";
import { ageOn, checkSaId, normalisePhone } from "@/lib/sa";
import type { AgeCheck, MsgChannel } from "@/generated/prisma/client";

export class CustomerError extends Error {}

const idHash = (id: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(id).digest("hex");

export async function requestOtp(raw: string) {
  const phone = normalisePhone(raw);
  if (!phone) throw new CustomerError("Enter a valid South African mobile number");
  const recent = await db.otp.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (recent >= 5) throw new CustomerError("Too many codes requested — try again in 10 minutes");
  const code = String(randomInt(100_000, 1_000_000));
  await db.otp.create({ data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  await send({ channel: "SMS", to: phone, body: "Your Herbal Holland sign-in code is ••••••. It expires in 10 minutes.", kind: "TRANSACTIONAL" });
  return { phone, demoCode: process.env.DEMO_MODE === "true" ? code : undefined };
}

export async function verifyOtp(raw: string, code: string) {
  const phone = normalisePhone(raw);
  if (!phone) throw new CustomerError("Invalid phone number");
  const otp = await db.otp.findFirst({ where: { phone, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.attempts >= 5) throw new CustomerError("That code has expired — request a new one");
  if (otp.codeHash !== sha256(`${phone}:${code.trim()}`)) {
    await db.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new CustomerError("That code isn't right");
  }
  await db.otp.deleteMany({ where: { phone } });
  return { phone, customer: await db.customer.findUnique({ where: { phone } }) };
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
  ageCheck?: AgeCheck; // e.g. ID_SIGHTED when a budtender checked a passport in store
};

export async function createCustomer(a: NewCustomer, actor: Actor) {
  const settings = await getSettings();
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
    if (await db.customer.findUnique({ where: { idHash: hash } })) throw new CustomerError("That ID number is already linked to a member");
  }
  if (dob && ageOn(dob) < settings.compliance.minAge) throw new CustomerError(`The Windmill Club is for adults ${settings.compliance.minAge}+`);

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
      },
    });
    await t.consentEvent.createMany({
      data: channels.map((ch) => ({ customerId: c.id, channel: ch, granted: !!a.consents[ch], source: a.source, wording: CONSENT_WORDING })),
    });
    if (settings.loyalty.signupBonus) await addPoints(t, { customerId: c.id, points: settings.loyalty.signupBonus, kind: "SIGNUP", note: "Welcome to the Windmill Club" });
    await audit(t, actor, "customer.create", { storeId: a.homeStoreId, entity: "Customer", entityId: c.id, data: { source: a.source, ageCheck } });
    return c;
  });
}

export const CONSENT_WORDING =
  "I'd like to hear from Herbal Holland about drops, offers and events on the channels I've ticked. I can opt out at any time by replying STOP or in my Windmill Club settings.";

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
    if (ageOn(dob) < settings.compliance.minAge) throw new CustomerError(`Customer is under ${settings.compliance.minAge}`);
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
