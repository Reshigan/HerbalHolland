import { describe, expect, it } from "vitest";
import { readCapped } from "@/lib/body";

const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request("http://local/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("readCapped", () => {
  it("reads a body within the limit", async () => {
    expect((await readCapped(post('{"a":1}'), 100))?.toString()).toBe('{"a":1}');
  });

  it("refuses a body over the limit, whatever its declared length", async () => {
    expect(await readCapped(post("x".repeat(101)), 100)).toBeNull();
    expect(await readCapped(post("x", { "content-length": "5000" }), 100)).toBeNull();
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(64)); // never ends on its own
      },
    });
    expect(await readCapped(post(stream), 1000)).toBeNull();
  });

  it("reads an empty body", async () => {
    expect((await readCapped(new Request("http://local/x", { method: "POST" }), 10))?.length).toBe(0);
  });
});
