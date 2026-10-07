"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { createCustomer, recordAgeCheck, setConsent, STORE_CONSENT_WORDING } from "@/server/customers";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { bool, str } from "@/server/store/rules";
import type { AgeCheck, MsgChannel } from "@/generated/prisma/client";
import { isEmail } from "@/lib/email";

const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

async function member(storeId: string, id: string) {
  const c = await db.customer.findFirst({ where: { id, homeStoreId: storeId } });
  if (!c) throw new UserError("That member doesn't belong to this store");
  return c;
}

/** Enrols a walk-in adult in Herbal Holland Rewards with this store as home store. */
export async function addMember(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await attempt(async () => {
    const { store, actor } = await manage(code);
    const firstName = str(fd, "firstName").slice(0, 60);
    if (firstName.length < 2) return fail("Enter the member's first name", "firstName");
    const phone = str(fd, "phone");
    if (!phone) return fail("A South African mobile number is required", "phone");
    const email = str(fd, "email").slice(0, 120);
    if (email && !isEmail(email)) return fail("That email address doesn't look right", "email");
    const idNumber = str(fd, "idNumber").replace(/\s/g, "");
    const sighted = bool(fd, "idSighted");
    if (!idNumber && !sighted) return fail("Confirm the member is 18+: capture an SA ID number or tick that you've seen their ID", "idSighted");
    const dobRaw = str(fd, "dob");
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? new Date(`${dobRaw}T00:00:00Z`) : undefined;
    if (!idNumber && !dob) return fail("Without an SA ID number, enter their date of birth from the document you saw", "dob");
    const deals = str(fd, "deals");
    if (deals !== "yes" && deals !== "no") return fail("Ask whether they want member deals and news. Their answer is recorded.", "deals");
    if (!bool(fd, "acceptTerms")) return fail("The member must read the key terms and accept the membership terms", "acceptTerms");
    const c = await createCustomer(
      {
        phone,
        firstName,
        lastName: str(fd, "lastName").slice(0, 60) || undefined,
        email: email || undefined,
        idNumber: idNumber || undefined,
        dob: idNumber ? undefined : dob,
        homeStoreId: store.id,
        consents: { SMS: deals === "yes", EMAIL: deals === "yes" && !!email, WHATSAPP: false, PUSH: false },
        interests: fd.getAll("interest").map(String),
        consentWording: STORE_CONSENT_WORDING,
        source: "ADMIN",
        termsAccepted: true,
        ageCheck: sighted ? "ID_SIGHTED" : undefined,
      },
      actor,
    );
    id = c.id;
    return done(`${c.firstName} joined as member ${c.memberNo}`);
  });
  if (id) {
    revalidatePath(`/store/${code}/customers`);
    redirect(`/store/${code}/customers/${id}`);
  }
  return res;
}

/** Records a consent change the member asked for (POPIA s69 evidence goes to the consent ledger). */
export async function changeConsent(code: string, customerId: string, channel: MsgChannel, granted: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    if (!CHANNELS.includes(channel)) return fail("Unknown channel");
    const c = await member(store.id, customerId);
    await setConsent(c.id, channel, granted, "ADMIN");
    await audit(db, actor, "customer.consent", { storeId: store.id, entity: "Customer", entityId: c.id, data: { channel, granted } });
    revalidatePath(`/store/${store.code}/customers/${c.id}`);
    return done(`${channel === "WHATSAPP" ? "WhatsApp" : channel === "SMS" ? "SMS" : channel === "EMAIL" ? "Email" : "Push"} marketing ${granted ? "switched on" : "switched off"} for ${c.firstName}.`);
  });
}

export async function checkAge(code: string, customerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const c = await member(store.id, customerId);
    const method = str(fd, "method") as AgeCheck;
    if (method !== "ID_SIGHTED" && method !== "ID_NUMBER") return fail("Choose how you checked their age", "method");
    const idNumber = str(fd, "idNumber").replace(/\s/g, "");
    if (method === "ID_NUMBER" && !idNumber) return fail("Enter the 13-digit SA ID number", "idNumber");
    await recordAgeCheck(c.id, method, actor, idNumber || undefined);
    revalidatePath(`/store/${store.code}/customers/${c.id}`);
    return done(method === "ID_NUMBER" ? "ID number validated and age check recorded." : "ID sighting recorded.");
  });
}
