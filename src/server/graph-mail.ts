// Microsoft 365 email through Microsoft Graph (an Entra app with the Mail.Send application permission). Microsoft 365
// doesn't take SMTP sign-in from an app, so the message is built as MIME by nodemailer (keeping List-Unsubscribe and
// every other header) and posted to /users/{mailbox}/sendMail. The mailbox is the address in EMAIL_FROM.
import { createTransport } from "nodemailer";

export const graphConfigured = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);

let token: { value: string; until: number } | undefined;
async function accessToken() {
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return token.value;
}

const mime = createTransport({ streamTransport: true, buffer: true, newline: "windows" });

export async function graphSend(m: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  const mailbox = m.from.match(/<([^>]+)>/)?.[1] ?? m.from;
  const { message } = await mime.sendMail(m);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "text/plain" },
    body: (message as Buffer).toString("base64"),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) token = undefined;
  if (!res.ok) throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
