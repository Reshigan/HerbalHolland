import { NextResponse } from "next/server";
import { endSession } from "@/server/auth";
import { sameOrigin } from "@/lib/same-origin";

export async function POST(req: Request) {
  // Only our own pages sign people out (a form on another site can't).
  if (!sameOrigin(req.headers, req.url)) return new NextResponse("Cross-site request refused", { status: 403 });
  await endSession("staff");
  // Relative Location: in the standalone server req.url names localhost, not the host the browser used.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
