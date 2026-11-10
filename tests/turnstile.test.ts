import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { passesTurnstile, turnstileSiteKey } from "@/server/turnstile";

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);
const good = { success: true, action: "member_code", hostname: "shop.herbalholland.com" };

describe("Turnstile", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET", "test-secret");
    vi.stubEnv("TURNSTILE_SITE_KEY", "test-site");
    vi.stubEnv("APP_URL", "https://shop.herbalholland.com");
    vi.stubEnv("TURNSTILE_HOSTNAMES", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off without the secret: no widget, every send passes", async () => {
    vi.stubEnv("TURNSTILE_SECRET", undefined);
    const f = reply(good);
    expect(turnstileSiteKey()).toBeNull();
    expect(await passesTurnstile(undefined, null, "member_code", f)).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("gives the site key only when both keys are set", () => {
    expect(turnstileSiteKey()).toBe("test-site");
    vi.stubEnv("TURNSTILE_SITE_KEY", undefined);
    expect(turnstileSiteKey()).toBeNull();
  });

  it("passes a good token and sends the secret, token and IP to siteverify", async () => {
    const f = reply(good);
    expect(await passesTurnstile("tok", "1.2.3.4", "member_code", f)).toBe(true);
    const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "test-secret", response: "tok", remoteip: "1.2.3.4" });
  });

  it("refuses a missing, empty or oversized token without calling siteverify", async () => {
    const f = reply(good);
    for (const t of [undefined, "", 42, "x".repeat(2049)]) expect(await passesTurnstile(t, null, "member_code", f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a failed check, another action or another hostname", async () => {
    expect(await passesTurnstile("tok", null, "member_code", reply({ ...good, success: false }))).toBe(false);
    expect(await passesTurnstile("tok", null, "trade_code", reply(good))).toBe(false);
    expect(await passesTurnstile("tok", null, "member_code", reply({ ...good, hostname: "evil.example" }))).toBe(false);
    expect(await passesTurnstile("tok", null, "member_code", reply({ ...good, hostname: undefined }))).toBe(false);
  });

  it("fails closed on a network error or an error status", async () => {
    expect(await passesTurnstile("tok", null, "member_code", vi.fn(async () => Promise.reject(new Error("down"))))).toBe(false);
    expect(await passesTurnstile("tok", null, "member_code", reply(good, false))).toBe(false);
  });

  it("uses TURNSTILE_HOSTNAMES when set, and refuses when no hostname is allowed", async () => {
    vi.stubEnv("TURNSTILE_HOSTNAMES", "a.example, b.example");
    expect(await passesTurnstile("tok", null, "member_code", reply({ ...good, hostname: "b.example" }))).toBe(true);
    expect(await passesTurnstile("tok", null, "member_code", reply(good))).toBe(false);
    vi.stubEnv("TURNSTILE_HOSTNAMES", undefined);
    vi.stubEnv("APP_URL", "");
    expect(await passesTurnstile("tok", null, "member_code", reply(good))).toBe(false);
  });
});
