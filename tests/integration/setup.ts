// Loaded in every integration suite (vitest.integration.config.ts). File storage is the FILES R2 bucket, which exists
// only inside a Cloudflare request: here it is a Map, with the same signatures and the same error for a missing key.
import { vi } from "vitest";

vi.mock("@/server/storage", () => {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const checkKey = (key: string) => {
    if (!key || key.startsWith("/") || key.split("/").some((p) => p === "" || p === "." || p === "..")) throw new Error("Bad storage key");
    return key;
  };
  return {
    putObject: async (key: string, body: Uint8Array, contentType: string) => {
      objects.set(checkKey(key), { body: new Uint8Array(body), contentType });
    },
    getObject: async (key: string): Promise<Uint8Array> => {
      const o = objects.get(checkKey(key));
      if (!o) throw new Error(`Storage read failed (no such file: ${key})`);
      return new Uint8Array(o.body);
    },
    deleteObject: async (key: string) => {
      objects.delete(checkKey(key));
    },
  };
});

// Studio cards are screenshots from Browser Rendering, which only exists inside a Cloudflare request: a stand-in JPEG.
vi.mock("@/server/studio-cards", async (orig) => {
  const real = await orig<typeof import("@/server/studio-cards")>();
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  return { ...real, cardJpeg: async () => jpeg, renderCard: async () => new Response(jpeg, { headers: { "content-type": "image/png" } }) };
});
