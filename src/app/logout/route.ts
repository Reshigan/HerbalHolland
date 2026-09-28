import { NextResponse } from "next/server";
import { endSession } from "@/server/auth";

export async function POST() {
  await endSession("staff");
  // Relative Location: in the standalone server req.url names localhost, not the host the browser used.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
