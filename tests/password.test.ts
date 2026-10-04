import { describe, expect, it } from "vitest";
import { DEMO_PASSWORD, passwordProblem } from "@/lib/password";

describe("passwordProblem", () => {
  it("wants 10 to 200 characters", () => {
    expect(passwordProblem("short pw")).toBe("Use at least 10 characters.");
    expect(passwordProblem("x".repeat(201))).toBe("Use 200 characters or fewer.");
    expect(passwordProblem("blue kettle on the stoep")).toBeNull();
    expect(passwordProblem("q".repeat(200))).toBeNull();
  });

  it("refuses the most common passwords, whatever the case", () => {
    expect(passwordProblem("Password123")).toMatch(/most common/);
    expect(passwordProblem("QWERTYUIOP")).toMatch(/most common/);
    expect(passwordProblem("HerbalHolland")).toMatch(/most common/);
    expect(passwordProblem("Password123 kettle")).toBeNull();
  });

  it("keeps the email's local part and name words of four letters or more out", () => {
    const who = { email: "thabo.m@mokoena.co.za", name: "Thabo Mokoena" };
    expect(passwordProblem("my thabo.m password", who)).toBe("Leave the email address out of the password.");
    expect(passwordProblem("MOKOENA-retail-2026", who)).toBe("Leave names out of the password.");
    expect(passwordProblem("thabo likes rooibos", who)).toBe("Leave names out of the password.");
    expect(passwordProblem("rooibos on the stoep", who)).toBeNull();
    // Short local parts and name words are too common to rule out.
    expect(passwordProblem("jo's long password", { email: "jo@example.com", name: "Jo Li" })).toBeNull();
  });

  it("can never accept the demo password", () => {
    expect(passwordProblem(DEMO_PASSWORD)).not.toBeNull();
  });
});
