import { describe, expect, it } from "vitest";
import { clientIpFrom, ipBucket } from "@/lib/client-ip";

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

describe("rate-limit buckets", () => {
  it("keeps IPv4 as it is and folds IPv6 to its /64", () => {
    expect(ipBucket("196.25.1.9")).toBe("196.25.1.9");
    expect(ipBucket("2001:db8:85a3::8a2e:370:7334")).toBe("2001:0db8:85a3:0000::/64");
    expect(ipBucket("2001:db8:85a3:1:2:3:4:5")).toBe("2001:0db8:85a3:0001::/64");
    expect(ipBucket("::1")).toBe("0000:0000:0000:0000::/64");
    // Two addresses from the same /64 share a bucket; a different /64 does not.
    expect(ipBucket("2a02:1:2:3::1")).toBe(ipBucket("2a02:1:2:3:ffff:ffff:ffff:ffff"));
    expect(ipBucket("2a02:1:2:4::1")).not.toBe(ipBucket("2a02:1:2:3::1"));
  });
});
