// Online orders for this store's pick board: new, picking, ready, and handed over today.
import { json, withStaff } from "@/server/pos/http";
import { orderBoard } from "@/server/pos/orders";

export const GET = withStaff(async (_req, pos) => json({ orders: await orderBoard(pos.device.storeId), at: new Date().toISOString() }));
