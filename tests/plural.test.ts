import { describe, expect, it } from "vitest";
import { plural } from "@/lib/plural";

describe("plural", () => {
  it("picks the noun by count", () => {
    expect(plural(1, "unit")).toBe("1 unit");
    expect(plural(-1, "unit")).toBe("-1 unit");
    expect(plural(0, "unit")).toBe("0 units");
    expect(plural(1204, "delivery", "deliveries")).toBe("1,204 deliveries");
  });
});
