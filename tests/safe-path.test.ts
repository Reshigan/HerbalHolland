// Where a sign-in may send someone afterwards: same-site paths only.
import { describe, expect, it } from "vitest";
import { safePath } from "@/lib/safe-path";

describe("safePath", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safePath("/store/PTA01/reports?range=7d")).toBe("/store/PTA01/reports?range=7d");
    expect(safePath("/hq")).toBe("/hq");
  });
  it("refuses other hosts, schemes, backslashes and control characters", () => {
    for (const bad of ["https://example.com", "//example.com", "/\\example.com", "\\\\example.com", "javascript:alert(1)", "", null, undefined, "/ok\n/x", "hq"]) expect(safePath(bad)).toBeNull();
  });
});
