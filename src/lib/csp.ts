// The Content-Security-Policy, built in one place. Signed-in and shop pages render per request, so src/proxy.ts gives
// each response a fresh nonce: a script runs only when it carries that nonce (Next adds it to its own scripts) or is
// the one inline snippet below (allowed by its hash), and 'strict-dynamic' trusts what those load — an injected
// <script> never runs. The few static pages (next.config.ts) keep the nonce-less policy. Styles stay 'unsafe-inline':
// React's style attributes need it (a nonce in style-src would switch it off).

/** Keeps the browser's install prompt, which can fire before hydration, for @/components/ui/install-prompt. */
export const INSTALL_SNIPPET = "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hhInstall=e})";

const common = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

/** Per request: the nonce and the snippet's hash; 'unsafe-inline' and 'self' are fallbacks only very old browsers use. */
export const nonceCsp = (nonce: string, snippetHash: string) =>
  [`script-src 'nonce-${nonce}' '${snippetHash}' 'strict-dynamic' 'unsafe-inline' 'self'`, ...common].join("; ");

/** Static pages, rendered at build time (no request, so no nonce). */
export const staticCsp = () => ["script-src 'self' 'unsafe-inline'", ...common].join("; ");
