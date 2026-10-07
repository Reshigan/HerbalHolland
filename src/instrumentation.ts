import type { Instrumentation } from "next";

// Server start-up checks (Node runtime, production): the server refuses to start without a real signing key.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { secretProblem } = await import("./server/secret");
  const why = secretProblem();
  if (why) throw new Error(`${why} — set it to 32 or more random characters (openssl rand -base64 48) and start again`);
  if (process.env.DEMO_MODE !== "true") return;
  // Demo sign-ins next to live payment keys means real money behind a door anyone can open: refuse, don't warn.
  if ((process.env.YOCO_SECRET_KEY ?? "").startsWith("sk_live_") || process.env.PEACH_ENV === "live")
    throw new Error("DEMO_MODE is on with live payment keys — turn DEMO_MODE off (anyone could sign in as any staff member) and start again");
  console.warn("[security] DEMO_MODE is on: anyone can sign in as any staff member and see sign-in codes. Turn it off before real trading.");
}

// Every server error reaches the log, and the ops inbox when ALERT_EMAIL is set (throttled): @/server/alerts.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/alerts");
  await reportError(err, { method: request.method, path: request.path, route: context.routePath, kind: context.routeType });
};
