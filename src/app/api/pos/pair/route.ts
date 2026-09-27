// Pairing a till to a store. A manager, owner or HQ user signs in with email + password
// (or is already signed in to the back office); DEMO_MODE also allows one-click pairing.
import { z } from "zod";
import { getDevice, getStaff } from "@/server/auth";
import { json, open, readBody, PosError } from "@/server/pos/http";
import { pairableStores, pairTill, verifyPairingUser, PAIR_ROLES } from "@/server/pos/session";
import type { Actor } from "@/server/audit";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stores"), email: z.string().email("Enter your work email"), password: z.string().min(1, "Enter your password") }),
  z.object({
    action: z.literal("pair"),
    storeId: z.string().min(1, "Choose a store"),
    name: z.string().trim().min(1, "Name this till").max(40, "Keep the till name under 40 characters"),
    via: z.enum(["password", "session", "demo"]),
    email: z.string().optional(),
    password: z.string().optional(),
  }),
]);

export const POST = open(async (req) => {
  const b = await readBody(req, Body);
  if (b.action === "stores") {
    const user = await verifyPairingUser(b.email, b.password);
    return json({ user: { name: user.name }, stores: await pairableStores(user) });
  }

  let actor: Actor;
  if (b.via === "demo") {
    if (process.env.DEMO_MODE !== "true") throw new PosError("Demo pairing is switched off", 403);
    actor = { type: "SYSTEM", name: "Demo pairing" };
  } else {
    const user = b.via === "password" ? await verifyPairingUser(b.email ?? "", b.password ?? "") : await getStaff();
    if (!user || !PAIR_ROLES.includes(user.role)) throw new PosError("Sign in as a store manager, owner or HQ to pair this till", 401);
    const allowed = await pairableStores(user);
    if (!allowed.some((s) => s.id === b.storeId)) throw new PosError("You can't pair tills for that store", 403);
    actor = { type: "USER", id: user.id, name: user.name };
  }
  const { device, store } = await pairTill({ storeId: b.storeId, name: b.name, actor, previous: await getDevice() });
  return json({ device: { name: device.name, prefix: device.prefix }, store: { code: store.code, name: store.name } });
});
