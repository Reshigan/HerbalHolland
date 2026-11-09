// Product photos uploaded from HQ: JPG, PNG or WebP only, a repeat of the same bytes skipped, at most six per product,
// the first photo is the main one, and removing a photo deletes its upload row and the stored file.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getObject } from "@/server/storage";
import { orderProductImages, removeProductImage, uploadProductImages } from "@/server/shop/images";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let productId: string;
const png = (n: number) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n])], `p${n}.png`);
const jpg = (n: number) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n])], `j${n}.jpg`);
const opts = { alt: "Calm Oil" };
const gallery = async () => {
  const rows = await db.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
  const uploads = await db.upload.findMany({ where: { id: { in: rows.map((r) => r.uploadId) } } });
  return rows.map((r) => ({ ...r, upload: uploads.find((u) => u.id === r.uploadId)! }));
};

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  productId = (await db.product.findUniqueOrThrow({ where: { slug: "test-oil" } })).id;
  await db.productImage.deleteMany({ where: { productId } });
  void w;
});

describe("product photos", () => {
  it("adds images, skips repeats and rejects files that are not images", async () => {
    const r = await uploadProductImages(productId, [png(1), jpg(2), png(1), new File(["hello"], "notes.txt")], opts);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.failed).toEqual([{ name: "notes.txt", reason: "not a JPG, PNG or WebP image" }]);
    const g = await gallery();
    expect(g.map((i) => i.upload.fileName)).toEqual(["p1.png", "j2.jpg"]);
    expect(g[1].upload.contentType).toBe("image/jpeg");
    expect((await getObject(g[0].upload.key)).length).toBe(9);
  });

  it("stops at six photos", async () => {
    const r = await uploadProductImages(productId, [3, 4, 5, 6, 7].map(png), opts);
    expect(r.added).toBe(4);
    expect(await db.productImage.count({ where: { productId } })).toBe(6);
  });

  it("reorders so the chosen photo is the main one", async () => {
    const before = await gallery();
    const last = before[before.length - 1].uploadId;
    await orderProductImages(productId, [last]);
    const after = await gallery();
    expect(after[0].uploadId).toBe(last);
    expect(after.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(after.slice(1).map((i) => i.uploadId)).toEqual(before.slice(0, 5).map((i) => i.uploadId));
  });

  it("removes a photo with its upload and stored file", async () => {
    const [first] = await gallery();
    expect(await removeProductImage(productId, first.uploadId)).toBe(true);
    expect(await db.upload.findUnique({ where: { id: first.uploadId } })).toBeNull();
    await expect(getObject(first.upload.key)).rejects.toThrow("no such file");
    expect(await db.productImage.count({ where: { productId } })).toBe(5);
    expect(await removeProductImage(productId, first.uploadId)).toBe(false);
  });
});
