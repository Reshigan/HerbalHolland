import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `npm run build` is this build, so Next's own build is named here instead of looping back into it.
export default { ...defineCloudflareConfig({}), buildCommand: "npx next build" };
