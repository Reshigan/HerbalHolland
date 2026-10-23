// Uploaded proof (banking slips): photos or PDFs, identified by their bytes, never by the name or the browser's claim.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov" } as const;
export type UploadType = keyof typeof EXT;
export const extFor = (t: UploadType) => EXT[t];

export function sniffType(b: Uint8Array): UploadType | null {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (at(0, "%PDF-")) return "application/pdf";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(4, "ftyp") && ["heic", "heix", "mif1", "msf1", "heif"].some((x) => at(8, x))) return "image/heic";
  if (at(4, "ftyp") && at(8, "qt  ")) return "video/quicktime";
  if (at(4, "ftyp")) return "video/mp4"; // isom, mp42, avc1, M4V and the rest of the MP4 family
  return null;
}

// Members' photos (review photos, return photos, a picture with a support message): JPEG or PNG, at most 5 MB each.
// Shared by the forms in the browser and the checks on the server (@/server/uploads).
export const PHOTO_TYPES: UploadType[] = ["image/jpeg", "image/png"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// A video for the social networks (TikTok, YouTube Shorts, X): MP4 or MOV, at most 90 MB (under the Worker's request limit).
export const VIDEO_TYPES: UploadType[] = ["video/mp4", "video/quicktime"];
export const VIDEO_MAX_BYTES = 90 * 1024 * 1024;
