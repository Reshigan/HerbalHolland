// Records an in-store age check for a member (ID sighted / passport sighted / SA ID number).
import { z } from "zod";
import { recordAgeCheck } from "@/server/customers";
import { json, readBody, withStaff, actorOf } from "@/server/pos/http";
import { customerDetail } from "@/server/pos/customers";

type Ctx = { params: Promise<{ id: string }> };

const Body = z
  .object({ method: z.enum(["ID_SIGHTED", "ID_NUMBER"]), idNumber: z.string().trim().optional() })
  .refine((b) => b.method !== "ID_NUMBER" || !!b.idNumber, { message: "Enter the SA ID number" });

export const POST = withStaff<Ctx>(async (req, pos, { params }) => {
  const { id } = await params;
  const b = await readBody(req, Body);
  await recordAgeCheck(id, b.method, actorOf(pos), b.method === "ID_NUMBER" ? b.idNumber!.replace(/\s/g, "") : undefined);
  return json({ customer: await customerDetail(id, pos.device.storeId) });
});
