import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG } from "@/server/email-logo";
import { graphSend } from "@/server/graph-mail";

describe("Microsoft 365 email (Graph)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("signs in once, then posts the whole MIME message (headers kept) to the sending mailbox", async () => {
    Object.assign(process.env, { MS_TENANT_ID: "tenant-1", MS_CLIENT_ID: "client-1", MS_CLIENT_SECRET: "not-a-real-secret" });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.includes("/oauth2/") ? Response.json({ access_token: "tok", expires_in: 3600 }) : new Response(null, { status: 202 });
    });
    const mail = { from: "Herbal Holland <admin@herbalholland.com>", to: "thabo@example.co.za", subject: "Your invoice", html: "<p>Hi</p>", text: "Hi", headers: { "List-Unsubscribe": "<https://shop.herbalholland.com/api/unsubscribe?t=x>" }, attachments: [{ filename: "herbal-holland.png", content: Buffer.from(EMAIL_LOGO_PNG, "base64"), cid: EMAIL_LOGO_CID }] };
    await graphSend(mail);
    await graphSend(mail);

    expect(calls.filter((c) => c.url.includes("/oauth2/"))).toHaveLength(1);
    expect(calls[0].url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    expect(String(calls[0].init.body)).toContain("grant_type=client_credentials");
    const send = calls[1];
    expect(send.url).toBe("https://graph.microsoft.com/v1.0/users/admin%40herbalholland.com/sendMail");
    expect((send.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const raw = Buffer.from(String(send.init.body), "base64").toString();
    expect(raw).toContain("List-Unsubscribe: <https://shop.herbalholland.com/api/unsubscribe?t=x>");
    expect(raw).toContain("To: thabo@example.co.za");
    expect(raw).toContain("Subject: Your invoice");
    expect(raw).toContain(`Content-ID: <${EMAIL_LOGO_CID}>`); // the logo travels inside the message
  });

  it("throws with Microsoft's reason when the send is refused", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.includes("/oauth2/") ? Response.json({ access_token: "tok", expires_in: 3600 }) : new Response("ErrorAccessDenied", { status: 403 })));
    await expect(graphSend({ from: "admin@herbalholland.com", to: "a@b.co.za", subject: "s", html: "h", text: "t" })).rejects.toThrow(/403.*ErrorAccessDenied/);
  });
});
