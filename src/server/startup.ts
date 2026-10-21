// The start-up checks (production only). A Worker has no boot hook, so src/proxy.ts runs them on the first request
// an isolate serves and remembers the answer: without a real signing key (@/server/secret), or a real deployment
// without the settings its links and jobs need (@/lib/env-check), every request answers 500 and the log says why.
import { secretProblem } from "@/server/secret";
import { envProblems } from "@/lib/env-check";

let outcome: string | null | undefined; // undefined = not checked yet in this isolate

/** Why the app must not serve, or null when it may. Logs the warnings once. */
export function ensureStartupChecks(): string | null {
  if (outcome !== undefined) return outcome;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return (outcome = null);
  const problems: string[] = [];
  const why = secretProblem();
  if (why) problems.push(`${why}: set it to 32 or more random characters (openssl rand -base64 48)`);
  const { fatal, warn } = envProblems(process.env);
  for (const w of warn) console.warn(`[config] ${w}`);
  problems.push(...fatal);
  outcome = problems.length ? problems.join(". ") : null;
  if (outcome) console.error(`[config] Not serving: ${outcome}`);
  return outcome;
}
