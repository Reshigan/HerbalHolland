"use client";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { addProductPhotos, orderProductPhotos, removeProductPhoto } from "./actions";

const MAX = 6;

/** The shop gallery for one product: add, remove and order photos. The first photo is the main picture. */
export function PhotoManager({ productId, photos, readOnly }: { productId: string; photos: { id: string; alt: string }[]; readOnly?: boolean }) {
  const ids = photos.map((p) => p.id);
  const moved = (from: number, to: number) => {
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return orderProductPhotos.bind(null, productId, next);
  };
  return (
    <div className="space-y-4">
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-2">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
                {/* eslint-disable-next-line @next/next/no-img-element -- served from /media, sized by the grid */}
                <img src={`/media/${p.id}`} alt={p.alt || `Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                {i === 0 && <Badge tone="orange" className="absolute left-2 top-2">Main</Badge>}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap items-start gap-1">
                  {i > 0 && (
                    <ActionButton action={moved(i, 0)} title="Make this the main photo">
                      <Star className="h-3.5 w-3.5" /> <span className="sr-only">Make main</span>
                    </ActionButton>
                  )}
                  {i > 0 && (
                    <ActionButton action={moved(i, i - 1)} title="Move earlier">
                      <ArrowLeft className="h-3.5 w-3.5" /> <span className="sr-only">Move earlier</span>
                    </ActionButton>
                  )}
                  {i < photos.length - 1 && (
                    <ActionButton action={moved(i, i + 1)} title="Move later">
                      <ArrowRight className="h-3.5 w-3.5" /> <span className="sr-only">Move later</span>
                    </ActionButton>
                  )}
                  <ConfirmAction action={removeProductPhoto.bind(null, productId, p.id)} label="Remove" title="Remove this photo?" confirmLabel="Remove photo">
                    It comes off the shop straight away and the file is deleted.
                  </ConfirmAction>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">No photos yet. The shop shows the generated product art until you add one.</p>
      )}
      {!readOnly && photos.length < MAX && (
        <ActionForm action={addProductPhotos.bind(null, productId)} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <Field label={`Add photos (${MAX - photos.length} more allowed)`} htmlFor="product-photos" hint="JPG, PNG or WebP, 5 MB at most each. Square photos on a plain background look best.">
            <Input id="product-photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="h-auto py-2" />
            <FieldError name="photos" />
          </Field>
          <SubmitButton size="sm" pendingLabel="Uploading…">Upload</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
