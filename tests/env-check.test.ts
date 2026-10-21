import { describe, expect, it } from "vitest";
import { envProblems } from "@/lib/env-check";

const real = {
  APP_URL: "https://shop.example.co.za",
  CRON_SECRET: "x".repeat(32),
  MS_TENANT_ID: "tenant",
  MS_CLIENT_ID: "client",
  MS_CLIENT_SECRET: "secret",
  ALERT_EMAIL: "ops@example.co.za",
  MESSAGING_PROVIDER: "smsportal",
};

describe("envProblems", () => {
  it("passes a complete production environment", () => {
    expect(envProblems(real)).toEqual({ fatal: [], warn: [] });
  });

  it("stops a real deployment without a public https APP_URL or a strong CRON_SECRET", () => {
    for (const APP_URL of [undefined, "", "http://shop.example.co.za", "https://localhost:3000", "https://127.0.0.1", "not a url"])
      expect(envProblems({ ...real, APP_URL }).fatal, String(APP_URL)).toHaveLength(1);
    expect(envProblems({ ...real, CRON_SECRET: "short" }).fatal).toHaveLength(1);
  });

  it("warns about missing email, alerts and messaging", () => {
    expect(envProblems({ APP_URL: real.APP_URL, CRON_SECRET: real.CRON_SECRET }).warn).toHaveLength(3);
    expect(envProblems({ ...real, MS_CLIENT_SECRET: "" }).warn).toEqual([expect.stringContaining("MS_CLIENT_SECRET")]);
  });

  it("lets a demo run on localhost, but never with live payment keys", () => {
    expect(envProblems({ DEMO_MODE: "true", APP_URL: "http://127.0.0.1:3000" })).toMatchObject({ fatal: [], warn: [expect.stringContaining("DEMO_MODE")] });
    expect(envProblems({ DEMO_MODE: "true", YOCO_SECRET_KEY: "sk_live_abc" }).fatal).toHaveLength(1);
    expect(envProblems({ DEMO_MODE: "true", PEACH_ENV: "live" }).fatal).toHaveLength(1);
  });
});
