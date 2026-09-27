// Member search (phone, name, member no. or scanned member QR) and in-store sign-up.
import { z } from "zod";
import { createCustomer } from "@/server/customers";
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
    consents: z.object({ SMS: z.boolean(), WHATSAPP: z.boolean(), EMAIL: z.boolean() }),
    acceptTerms: z.literal(true, { message: "The member must accept the membership terms" }),
  })
  .refine((b) => !!b.idNumber || b.passportSighted, { message: "Enter an SA ID number or confirm you've sighted a passport" });

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const c = await createCustomer(
    {
      phone: b.phone,
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email || undefined,
      idNumber: b.idNumber?.replace(/\s/g, "") || undefined,
      homeStoreId: pos.device.storeId,
      consents: { SMS: b.consents.SMS, WHATSAPP: b.consents.WHATSAPP, EMAIL: b.consents.EMAIL && !!b.email, PUSH: false },
      source: "POS",
      termsAccepted: b.acceptTerms,
      ageCheck: b.idNumber ? undefined : "ID_SIGHTED",
    },
    actorOf(pos),
  );
  return json({ customer: await customerDetail(c.id, pos.device.storeId) }, 201);
});
