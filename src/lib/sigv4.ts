// AWS Signature V4 query signing (presigned URLs) for S3-compatible storage: Cloudflare R2, MinIO, AWS S3.
// No SDK — the app only needs short-lived signed GET and PUT links for single objects.
import { createHash, createHmac } from "node:crypto";

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
// RFC 3986, as S3 canonical requests expect.
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function presign(o: {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  url: string; // https://<account>.r2.cloudflarestorage.com/<bucket>/<key> (path style) or virtual-hosted style
  region: string; // "auto" for R2
  accessKeyId: string;
  secretAccessKey: string;
  expires: number; // seconds (R2 and S3 allow up to 7 days)
  now?: Date;
}) {
  const u = new URL(o.url);
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const scope = `${amzDate.slice(0, 8)}/${o.region}/s3/aws4_request`;
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${o.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(o.expires)],
    ["X-Amz-SignedHeaders", "host"],
  ]
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .sort()
    .join("&");
  const path = u.pathname.split("/").map((p) => enc(decodeURIComponent(p))).join("/");
  const canonical = [o.method, path, query, `host:${u.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const key = [amzDate.slice(0, 8), o.region, "s3", "aws4_request"].reduce<Buffer | string>((k, part) => hmac(k, part), `AWS4${o.secretAccessKey}`);
  return `${u.origin}${path}?${query}&X-Amz-Signature=${createHmac("sha256", key).update(toSign).digest("hex")}`;
}
