// Addresses the server may fetch catalogue images from: public only.
import { describe, expect, it } from "vitest";
import { isPublicIp } from "@/lib/net";

describe("isPublicIp", () => {
  it("allows public IPv4 and IPv6", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "41.0.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:93.184.216.34"]) expect(isPublicIp(ip)).toBe(true);
  });
  it("refuses loopback, private, link-local, CGNAT, multicast, documentation and mapped private addresses", () => {
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "192.0.2.10", "198.18.0.1",
      "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2002:a00:1::", "not-an-ip", "1.2.3",
    ])
      expect(isPublicIp(ip)).toBe(false);
  });
});
