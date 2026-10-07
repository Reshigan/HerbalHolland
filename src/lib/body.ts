// Route handlers have no body size limit of their own (server actions do: next.config.ts), so endpoints that read a
// body before knowing who sent it read it through this: anything over `max` bytes is refused without being buffered.
export async function readCapped(req: Request, max: number): Promise<Buffer | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/** The body as JSON when it's within `max` bytes and parses; null otherwise. */
export async function readJson(req: Request, max: number): Promise<unknown> {
  const buf = await readCapped(req, max);
  try {
    return buf ? JSON.parse(buf.toString("utf8")) : null;
  } catch {
    return null;
  }
}
