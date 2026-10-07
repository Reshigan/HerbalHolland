// The app's signing key (SESSION_SECRET): invoice, export, opt-out, share, reminder and phone-check links, and the keyed
// hashes of IPs and ID numbers. A production server won't start without a real one (src/instrumentation.ts); development
// and tests fall back to a fixed key.
const EXAMPLES = new Set(["change-me-to-32-plus-random-bytes-in-production", "dev-only-change-me-32-bytes-minimum-secret"]);

/** Why the configured key can't be used in production, or null when it's fine. */
export const secretProblem = (s = process.env.SESSION_SECRET) =>
  !s ? "SESSION_SECRET is not set" : s.length < 32 ? "SESSION_SECRET is shorter than 32 characters" : EXAMPLES.has(s) ? "SESSION_SECRET is still the example value" : null;

export const appSecret = () => process.env.SESSION_SECRET || "dev";
