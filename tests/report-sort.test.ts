import { describe, expect, it } from "vitest";
import { reportSort, sortRows } from "@/lib/report-sort";

const cols = [{ key: "store" }, { key: "growth" }];
const rows = [
  { store: "Pretoria 2", growth: 0.1 },
  { store: "Durban", growth: null },
  { store: "Pretoria 10", growth: -0.2 },
  { store: "Cape Town", growth: 0.3 },
];

describe("report table sorting", () => {
  it("only sorts by the table's own columns", () => {
    expect(reportSort(cols, "growth", "asc")).toEqual({ key: "growth", dir: "asc" });
    expect(reportSort(cols, "growth", undefined)).toEqual({ key: "growth", dir: "desc" });
    expect(reportSort(cols, "nope", "asc")).toBeNull();
    expect(reportSort(cols, undefined, "asc")).toBeNull();
  });
  it("sorts numbers, puts empty values last either way", () => {
    expect(sortRows(rows, "growth", "asc").map((r) => r.store)).toEqual(["Pretoria 10", "Pretoria 2", "Cape Town", "Durban"]);
    expect(sortRows(rows, "growth", "desc").map((r) => r.store)).toEqual(["Cape Town", "Pretoria 2", "Pretoria 10", "Durban"]);
  });
  it("sorts text naturally", () => {
    expect(sortRows(rows, "store", "asc").map((r) => r.store)).toEqual(["Cape Town", "Durban", "Pretoria 2", "Pretoria 10"]);
  });
  it("leaves grouped tables alone", () => {
    const grouped = [{ store: "B", _style: "section" }, { store: "A" }];
    expect(sortRows(grouped, "store", "asc")).toBe(grouped);
  });
});
