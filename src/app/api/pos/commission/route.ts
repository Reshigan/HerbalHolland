// The till's "my commission" tile: the signed-in person's commission this month, or null when the store doesn't pay it.
import { json, withStaff } from "@/server/pos/http";
import { tillCommission } from "@/server/commission";

export const GET = withStaff(async (_req, pos) => json(await tillCommission(pos.device.storeId, pos.user.id)));
