// Raw-SQL helpers. Timestamps are stored as UTC in "timestamp without time zone" columns,
// so SAST wall-clock parts need (col AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg'.
import { Prisma } from "@/generated/prisma/client";

/** SAST local timestamp expression for a (trusted, constant) column reference, e.g. sast('s."createdAt"'). */
export const sast = (col: string) => Prisma.raw(`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg')`);
