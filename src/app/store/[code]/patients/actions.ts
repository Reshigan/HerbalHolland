"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { addPatientAuthorisation } from "@/server/customers";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { parseDay, str } from "@/server/store/rules";
import { normalisePhone } from "@/lib/sa";
import { addDays } from "@/lib/format";

export async function addAuthorisation(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const who = str(fd, "member");
    if (!who) return fail("Enter the member number or mobile number", "member");
    const phone = normalisePhone(who);
    const customer = await db.customer.findFirst({
      where: { homeStoreId: store.id, OR: [{ memberNo: who.toUpperCase() }, ...(phone ? [{ phone }] : [])] },
    });
    if (!customer) return fail(`No member of ${store.name} matches “${who}”`, "member");
    const authNumber = str(fd, "authNumber").toUpperCase().slice(0, 40);
    if (authNumber.length < 4) return fail("Enter the SAHPRA authorisation number", "authNumber");
    const prescriber = str(fd, "prescriber").slice(0, 120);
    if (prescriber.length < 3) return fail("Enter the prescriber's name", "prescriber");
    const prescriberRegNo = str(fd, "prescriberRegNo").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{2}\d{4,8}$/.test(prescriberRegNo)) return fail("HPCSA registration numbers look like MP0123456", "prescriberRegNo");
    const scope = str(fd, "scope").slice(0, 200);
    if (scope.length < 3) return fail("Describe the authorised products, e.g. “Dried flower, oils”", "scope");
    const grams = Number(str(fd, "monthlyLimitGrams").replace(",", "."));
    if (!Number.isFinite(grams) || grams <= 0 || grams > 1_000) return fail("Monthly limit must be between 0 and 1,000 g", "monthlyLimitGrams");
    const validFrom = parseDay(str(fd, "validFrom"));
    const validToDay = parseDay(str(fd, "validTo"));
    if (!validFrom) return fail("Enter the start date", "validFrom");
    if (!validToDay) return fail("Enter the end date", "validTo");
    const validTo = new Date(addDays(validToDay, 1).getTime() - 1); // valid to the end of that day
    if (validTo <= validFrom) return fail("The end date must be after the start date", "validTo");
    if (await db.patientAuth.findFirst({ where: { customerId: customer.id, authNumber } })) return fail("This authorisation is already on file for the member", "authNumber");
    await addPatientAuthorisation(
      customer.id,
      { authNumber, prescriber, prescriberRegNo, scope, monthlyLimitGrams: Math.round(grams * 10) / 10, validFrom, validTo, documentRef: str(fd, "documentRef").slice(0, 120) || undefined },
      actor,
    );
    revalidatePath(`/store/${store.code}/patients`);
    return done(`Authorisation ${authNumber} added for ${customer.firstName} ${customer.lastName ?? ""}.`);
  });
}

export async function revokeAuthorisation(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const auth = await db.patientAuth.findFirst({ where: { id, customer: { homeStoreId: store.id } } });
    if (!auth) return fail("Authorisation not found");
    if (auth.status === "REVOKED") return fail("Already revoked");
    await db.patientAuth.update({ where: { id }, data: { status: "REVOKED" } });
    await audit(db, actor, "patient.authorisation_revoke", { storeId: store.id, entity: "PatientAuth", entityId: id, data: { authNumber: auth.authNumber, reason: str(fd, "reason").slice(0, 200) || undefined } });
    revalidatePath(`/store/${store.code}/patients`);
    return done(`Authorisation ${auth.authNumber} revoked.`);
  });
}
