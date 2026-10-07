import type { NextConfig } from "next";
import { staticCsp } from "./src/lib/csp";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), payment=(self), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Pages get a per-request nonce policy from src/proxy.ts (src/lib/csp.ts). This nonce-less one is for what the proxy
// leaves alone: the build-time /brand page. Production only (dev needs eval and the HMR socket).
const staticPages = [{ key: "Content-Security-Policy", value: staticCsp() }];

const config: NextConfig = {
  output: "standalone",
  // Never in the server bundle, whatever a dynamic path makes the tracer think: uploads, docs, tests and the other site.
  outputFileTracingExcludes: { "/*": [".data/**", "docs/**", "e2e/**", "tests/**", "sites/**", "scripts/**", "test-results/**"] },
  poweredByHeader: false,
  serverExternalPackages: ["pg", "nodemailer"],
  // Banking slips (photos or PDFs up to 10 MB) and members' photos (up to three of 5 MB with a review or a return) are
  // posted through server actions.
  // (experimental.inlineCss was tried and rejected: Next also copies the 130 KB stylesheet into the RSC payload, so the
  // HTML more than doubled; the external, cached stylesheet is cheaper.)
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      ...(process.env.NODE_ENV === "production" ? [{ source: "/brand", headers: staticPages }] : []),
    ];
  },
};

export default config;
