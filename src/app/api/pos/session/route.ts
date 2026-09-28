// Lock screen: the till's store + staff tiles (device-authenticated), PIN sign-in and lock.
import { z } from "zod";
import { endSession, getPosStaff } from "@/server/auth";
import { json, readBody, withDevice } from "@/server/pos/http";
import { pinSignIn, sessionInfo } from "@/server/pos/session";

export const GET = withDevice(async (_req, device) => {
  const pos = await getPosStaff();
  const me = pos && pos.user.storeId === device.storeId ? pos.user : null;
  return json(await sessionInfo(device, me));
});

const Pin = z.object({ userId: z.string().min(1), pin: z.string().regex(/^\d{4,6}$/, "PINs are 4 digits") });

export const POST = withDevice(async (req, device) => {
  const { userId, pin } = await readBody(req, Pin);
  const user = await pinSignIn(device, userId, pin);
  return json({ me: { id: user.id, name: user.name, role: user.role, canDispense: user.canDispense } });
});

export const DELETE = withDevice(async () => {
  await endSession("pos");
  return json({ ok: true });
});
