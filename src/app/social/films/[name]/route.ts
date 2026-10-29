// A generated film as the networks fetch it (Instagram takes a public video URL for a Reel, never bytes): the MP4 the
// daily film job put in R2 (social/films/<name>.mp4), public from the moment it's posted anyway.
import { getObject } from "@/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.mp4$/.test(name)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await getObject(`social/films/${name}`);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength), "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
