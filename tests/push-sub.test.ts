import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "@/lib/push-sub";

describe("isPushEndpoint", () => {
  it("accepts the browsers' push services", () => {
    for (const s of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=BQY",
    ])
      expect(isPushEndpoint(s), s).toBe(true);
  });

  it("refuses anything else", () => {
    for (const s of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilnotify.windows.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "not a url",
    ])
      expect(isPushEndpoint(s), s).toBe(false);
  });
});
