import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), payment=(self), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "nodemailer"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default config;
