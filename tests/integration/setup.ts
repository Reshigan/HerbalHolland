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
