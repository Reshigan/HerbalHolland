# Product photography

The house style for every product picture on the shop, the Rewards app, share cards and the menu board. One look
across 1,000 stores: the product, lit well, on warm black. No stock photos (products without photos keep the
generated art, `@/components/product/art`).

## The look

- **Set**: warm black. Shoot on ink-950 (`#0C0A09`) or a warm black paper sweep; never pure black, never white.
- **Light**: one soft key light from the upper left (a large softbox or scrim), plus a low rim light from behind on
  the right to lift the product off the background. No on-camera flash, no coloured gels.
- **Colour**: true to life. Grey-card white balance, no filters or "moody" grading; the label colours must match the
  pack in hand. The orange is ours, keep it off the set.
- **Props**: none. Only the product (and a hand in the scale shot). No leaves, smoke, flowers or lifestyle styling.
- **Framing**: product fills about 70% of the frame, centred, with room for the 4:5 crop. Shoot with 10% breathing
  room on each side and crop afterwards.
- **Finish**: clean the pack and lens before every product; retouch dust and scratches only, never the product.

## Files

| | Spec |
|---|---|
| Master | 1:1, 2000 × 2000 px, sRGB JPEG, quality 90, under 600 KB |
| Portrait crop | 4:5 (1600 × 2000 px) from the same frame, same settings |
| Menu board (optional, welcome) | the front shot as a transparent-background PNG master, 2000 px on the long side |
| Naming | `<sku>-01.jpg`, `<sku>-02.jpg` … in shot-list order (`<sku>-01-4x5.jpg` for the crop, `<sku>-01.png` for the cutout) |

Keep the RAW files; we only ever load JPG, PNG or WebP (5 MB each at most, the loader rejects more).

## Shot list (every product, every size and flavour variant with its own pack)

1. `-01` **Front**: pack face-on, label straight, the main picture everywhere.
2. `-02` **Three-quarter**: turned about 30° to show depth (and the side panel).
3. `-03` **Label detail**: close on the label with the batch code, net content and class marking legible. This is the
   picture a customer checks against `/batch/[code]`, so the code must be readable at 800 px.
4. `-04` **In hand**: held in a hand for scale, same set, hand clean and unadorned (no rings, no painted nails).

Six photos per product is the platform's limit; `-05` and `-06` are free for an open pack, contents or a texture shot
where it helps (gummies, flower, topicals).

## Getting photos into the platform

Photos are stored in R2 through `putObject` (`src/server/storage.ts`), recorded as `ProductImage` rows (one per
product per upload, ordered by `sortOrder`; the first is the main picture) and served to everyone at `/media/[id]`.
There are two ways in, both from HQ:

1. **Bulk, with the catalogue CSV** (HQ → Catalogue → Import; `src/app/hq/catalogue/import`). The `image_urls`
   column takes up to six public `https://` addresses separated by `|`, first = main picture. Put the finished JPGs on
   any public host (the brand's own R2/CDN bucket or a Drive/Dropbox *direct* link; a link that redirects is refused),
   run the import with a dry run first, and the photos are fetched once the rows have committed
   (`importProductImages` in `src/server/shop/images.ts`). The same bytes are never added twice, so re-importing the
   sheet is safe; failures are listed on the import result and in the audit trail (`catalogue.import_images`).
2. **Per product**: there is no upload form on the HQ product page yet. To add or replace one product's photos, re-import
   a one-row CSV for that SKU with the new `image_urls` (update by SKU; other columns can stay as they are).

Where they appear once loaded: the product card on `/shop` and category pages (main picture), the gallery on
`/p/[slug]` (all photos in order, swipeable), the product's share card and Open Graph preview (main picture, 1:1), and
the in-store menu board `/menu/[slug]` (which falls back to the generated art today; the transparent PNG master is
what the board will use when it switches to photos).
