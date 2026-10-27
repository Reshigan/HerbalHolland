import { describe, expect, it } from "vitest";
import { membershipDigestText } from "@/lib/membership-digest";

describe("membership digest", () => {
  it("counts, lists the new members and the sources", () => {
    const r = membershipDigestText({
      day: "Tue 27 Oct 2026",
      total: 3,
      verified: 1,
      newCount: 1,
      joined: [{ memberNo: "HH0100003", name: "Kimona N.", joinedVia: "fb-d02", at: "Mon 26 Oct 2026, 21:10" }],
      bySource: [{ source: "join", members: 2 }, { source: "fb-d02", members: 1 }],
    });
    expect(r.subject).toBe("Herbal Holland members: 3 (+1 in 24 hours)");
    expect(r.text).toContain("Age verified with an ID: 1 of 3");
    expect(r.text).toContain("HH0100003  Kimona N.  (fb-d02, Mon 26 Oct 2026, 21:10)");
    expect(r.text).toContain("  join: 2");
  });
  it("says so on a quiet day, and marks members past the list", () => {
    expect(membershipDigestText({ day: "x", total: 2, verified: 0, newCount: 0, joined: [], bySource: [] }).subject).toBe("Herbal Holland members: 2 (no new in 24 hours)");
    const many = membershipDigestText({ day: "x", total: 60, verified: 0, newCount: 55, joined: [{ memberNo: "HH1", name: "A B.", joinedVia: null, at: "t" }], bySource: [{ source: "", members: 60 }] });
    expect(many.text).toContain("(direct, t)");
    expect(many.text).toContain("…and 54 more");
    expect(many.text).toContain("  direct: 60");
  });
});
