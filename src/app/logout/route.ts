import { NextResponse } from "next/server";
import { endSession } from "@/server/auth";

export async function POST(req: Request) {
  await endSession("staff");
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
