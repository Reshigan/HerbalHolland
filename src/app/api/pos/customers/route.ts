// Member search (phone, name, member no. or scanned member QR) and in-store sign-up.
import { z } from "zod";
import { createCustomer, STORE_CONSENT_WORDING } from "@/server/customers";
import { json, readBody, withStaff, actorOf } from "@/server/pos/http";
import { searchCustomers, customerDetail } from "@/server/pos/customers";

export const GET = withStaff(async (req, pos) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ customers: await searchCustomers(q, pos.device.storeId) });
});

const Body = z
  .object({
    phone: z.string().trim().min(9, "Enter a mobile number"),
    firstName: z.string().trim().min(1, "Enter a first name").max(60),
    lastName: z.string().trim().max(60).optional(),
    email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]).optional(),
    idNumber: z.string().trim().optional(),
    passportSighted: z.boolean().optional(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter their date of birth").optional(),
    deals: z.boolean({ message: "Ask whether they want member deals and news" }),
    interests: z.array(z.string()).max(10).optional(),
    acceptTerms: z.literal(true, { message: "The member must accept the membership terms" }),
  })
  .refine((b) => !!b.idNumber || b.passportSighted, { message: "Enter an SA ID number or confirm you've sighted a passport" })
  .refine((b) => !!b.idNumber || !!b.dob, { message: "Enter their date of birth from the passport" });

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const c = await createCustomer(
    {
      phone: b.phone,
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email || undefined,
      idNumber: b.idNumber?.replace(/\s/g, "") || undefined,
      dob: b.idNumber ? undefined : new Date(`${b.dob}T00:00:00Z`),
      homeStoreId: pos.device.storeId,
      consents: { SMS: b.deals, EMAIL: b.deals && !!b.email, WHATSAPP: false, PUSH: false },
      interests: b.interests,
      consentWording: STORE_CONSENT_WORDING,
      source: "POS",
      termsAccepted: b.acceptTerms,
      ageCheck: b.idNumber ? undefined : "ID_SIGHTED",
    },
    actorOf(pos),
  );
  return json({ customer: await customerDetail(c.id, pos.device.storeId) }, 201);
});
