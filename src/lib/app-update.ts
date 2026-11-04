// When an open app should pick up a new deploy. Every build carries its id (next.config.ts) and /api/version says which
// build is live, so a stale page can tell and reload itself. Kept apart from the component so it can be tested.

/** Reload when the live build differs, unless this tab already reloaded for that build (a reload that didn't take must not loop). */
export const needsReload = (client: string, server: string | null | undefined, tried: string | null) => !!server && server !== client && server !== tried;

/** Screens nobody is typing on (TV menu boards, the customer display): safe to reload the moment they're stale. */
export const isUnattended = (pathname: string) => pathname.startsWith("/menu/") || pathname === "/pos/display";
