import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/client-ip";

const bag = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

describe("clientIpFrom", () => {
  it("prefers Cloudflare's header, then x-real-ip, then the last forwarded hop", () => {
    expect(clientIpFrom(bag({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 10.0.0.2" }))).toBe("203.0.113.9");
    expect(clientIpFrom(bag({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.4");
    expect(clientIpFrom(bag({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }))).toBe("198.51.100.7"); // the first hop is the client's claim
  });
  it("ignores anything that isn't an IP", () => {
    expect(clientIpFrom(bag({ "cf-connecting-ip": "<script>" }))).toBeNull();
    expect(clientIpFrom(bag({}))).toBeNull();
    expect(clientIpFrom(bag({ "x-real-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
  });
});
