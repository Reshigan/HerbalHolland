import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTICLES, articleImage } from "@/components/shop/learn/articles";

describe("Learn pictures", () => {
  it("every article has its own render on disk", () => {
    for (const a of ARTICLES) expect(existsSync(`public${articleImage(a)}`), a.slug).toBe(true);
    expect(new Set(ARTICLES.map((a) => a.image)).size).toBe(ARTICLES.length);
  });
});
