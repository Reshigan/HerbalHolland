// DEMO_MODE only: sign in as a seeded user via GET (used by screenshots and smoke tests).
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { homeFor, startSession } from "@/server/auth";
import { safePath } from "@/lib/safe-path";

export async function GET(req: Request) {
  if (process.env.DEMO_MODE !== "true") return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const user = await db.user.findUnique({ where: { email: url.searchParams.get("email") ?? "" } });
  if (!user) return new NextResponse("Unknown demo user", { status: 404 });
  await startSession("staff", { userId: user.id }, 24);
  const next = url.searchParams.get("next") ?? "";
  // Relative Location (req.url names localhost in the standalone server); same-site paths only.
  return new NextResponse(null, { status: 307, headers: { Location: safePath(next) ?? (await homeFor(user)) } });
}
