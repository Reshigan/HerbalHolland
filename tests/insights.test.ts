import { describe, expect, it } from "vitest";
import { pickStore } from "../src/server/insights";

describe("insights store filter", () => {
  const stores = [{ code: "PTA01" }, { code: "PTA02" }];
  it("no filter means every store in scope", () => expect(pickStore(stores, undefined)).toBeUndefined());
  it("finds a store in scope", () => expect(pickStore(stores, "PTA02")).toEqual({ code: "PTA02" }));
  it("refuses a store outside scope", () => expect(pickStore(stores, "JHB01")).toBeNull());
});
