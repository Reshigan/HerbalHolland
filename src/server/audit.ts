import { db, type Tx } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export type Actor = { type: "USER" | "CUSTOMER" | "DEVICE" | "SYSTEM"; id?: string | null; name?: string | null };
export const SYSTEM: Actor = { type: "SYSTEM", name: "System" };

export function audit(
  client: Tx | typeof db,
  actor: Actor,
  action: string,
  opts: { storeId?: string | null; entity?: string; entityId?: string; data?: Prisma.InputJsonValue } = {},
) {
  return client.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.id ?? null,
      actorName: actor.name ?? null,
      action,
      storeId: opts.storeId ?? null,
      entity: opts.entity,
      entityId: opts.entityId,
      data: opts.data,
    },
  });
}
