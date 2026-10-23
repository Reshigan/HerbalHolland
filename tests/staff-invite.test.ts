import { describe, expect, it } from "vitest";
import { staffJoinPath, staffTag } from "@/lib/staff-invite";
import { joinTag } from "@/server/customers";

describe("staff join links", () => {
  it("tags with the end of the user id, lowercased", () => {
    expect(staffTag("cmA1B2C3D4E5F6")).toBe("staff-c3d4e5f6");
    expect(staffJoinPath("cmA1B2C3D4E5F6")).toBe("/club/join?src=staff-c3d4e5f6");
  });
  it("survives the join-link tag rules unchanged", () => {
    expect(joinTag(staffTag("cl9xk2abcdefgh"))).toBe(staffTag("cl9xk2abcdefgh"));
  });
});
