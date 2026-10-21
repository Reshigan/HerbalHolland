import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `npm run build` is this build, so Next's own build is named here instead of looping back into it.
// scripts/prune-trace.mjs then trims the file traces of what the Worker never runs (it must stay under 64 MiB).
export default { ...defineCloudflareConfig({}), buildCommand: "npx next build && node scripts/prune-trace.mjs" };
