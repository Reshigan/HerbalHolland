// A Studio card as the networks fetch it (Instagram and Threads take a public image URL, never bytes): the JPEG the
// scheduler put in R2 as it released the post (named by the post's own id, nothing to guess), seconds before it's public anyway.
import { getObject } from "@/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.jpg$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await getObject(`social/cards/${name}`);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "content-length": String(bytes.byteLength), "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
