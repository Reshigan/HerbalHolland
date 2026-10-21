// Raw-SQL helpers for SQLite (D1). Prisma stores timestamps as ISO-8601 UTC text ("2026-10-21T07:01:26.322Z"); South
// Africa is UTC+2 all year, so SAST wall-clock parts come from datetime(col, '+2 hours').
import { Prisma } from "@/generated/prisma/client";

/** SAST local timestamp ("YYYY-MM-DD HH:MM:SS") for a (trusted, constant) column reference, e.g. sast('s."createdAt"'). */
export const sast = (col: string) => Prisma.raw(`datetime(${col}, '+2 hours')`);
/** SAST calendar day ("YYYY-MM-DD") of a timestamp column. */
export const sastDay = (col: string) => Prisma.raw(`date(${col}, '+2 hours')`);
/** SAST hour (0-23) of a timestamp column. */
export const sastHour = (col: string) => Prisma.raw(`cast(strftime('%H', ${col}, '+2 hours') as integer)`);
