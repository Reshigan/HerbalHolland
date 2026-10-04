// Server start-up checks (Node runtime, production): the server refuses to start without a real signing key.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { secretProblem } = await import("./server/secret");
  const why = secretProblem();
  if (why) throw new Error(`${why} — set it to 32 or more random characters (openssl rand -base64 48) and start again`);
  if (process.env.DEMO_MODE === "true") console.warn("[security] DEMO_MODE is on: anyone can sign in as any staff member and see sign-in codes. Turn it off before real trading.");
}
