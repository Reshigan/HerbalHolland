import type { Instrumentation } from "next";

// Server start-up checks (Node runtime, production; not while building): without a real signing key, or a real
// deployment without the settings its links and jobs need (@/lib/env-check), the server answers every request with 500
// and logs why.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { secretProblem } = await import("./server/secret");
  const why = secretProblem();
  if (why) throw new Error(`${why} — set it to 32 or more random characters (openssl rand -base64 48) and start again`);
  const { envProblems } = await import("./lib/env-check");
  const { fatal, warn } = envProblems(process.env);
  for (const w of warn) console.warn(`[config] ${w}`);
  if (fatal.length) throw new Error(`Not starting: ${fatal.join(". ")}`);
}

// Every server error reaches the log, and the ops inbox when ALERT_EMAIL is set (throttled): @/server/alerts.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/alerts");
  await reportError(err, { method: request.method, path: request.path, route: context.routePath, kind: context.routeType });
};
