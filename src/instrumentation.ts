import type { Instrumentation } from "next";

// The start-up checks (signing key, environment) no longer run here: a Worker has no boot hook, so src/proxy.ts runs
// them on the first request through src/server/startup.ts.

// Every server error reaches the log, and the ops inbox when ALERT_EMAIL is set (throttled): @/server/alerts.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The alert email mustn't be cut off with the response on Workers: handed to the request's waitUntil (@/server/background).
  const [{ reportError }, { background }] = await Promise.all([import("./server/alerts"), import("./server/background")]);
  background("error report", reportError(err, { method: request.method, path: request.path, route: context.routePath, kind: context.routeType }));
};
