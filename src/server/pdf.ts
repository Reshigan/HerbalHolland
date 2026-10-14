// PDFs for email attachments, printed by headless Chromium (the production image installs it; see Dockerfile). A tax
// invoice is printed from its hosted page, so the PDF is the same document the link opens; statements and stock-order
// invoices are printed from their branded email. Never in the way of the email: no browser, or a failed print, gives
// null and the email goes without the attachment (its link still works).
import type { Browser } from "playwright-core";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG } from "./email-logo";
import { graphConfigured } from "./graph-mail";

// An email is laid out as nested tables for mail clients; on paper its card must flow across pages like a document.
const EMAIL_PRINT_CSS = `@page{size:A4;margin:12mm 10mm}body,body>table{background:#fff!important}body>table>tbody>tr>td{padding:0!important}
.hh-card,.hh-card>tbody,.hh-card>tbody>tr,.hh-card>tbody>tr>td{display:block!important;width:auto!important;max-width:none!important;border-radius:0!important}
tr,td{break-inside:avoid}.hh-card>tbody>tr,.hh-card>tbody>tr>td{break-inside:auto!important}`;

let browser: Promise<Browser> | undefined;
// Loaded only when a PDF is printed: the pages that send these emails must serve on a server without the browser
// (a standalone build traces playwright-core's files only where the Dockerfile copies them in).
const open = () =>
  (browser ??= import("playwright-core").then(({ chromium }) => chromium.launch()).then((b) => {
    b.on("disconnected", () => (browser = undefined));
    return b;
  }, (e) => {
    browser = undefined;
    throw e;
  }));

/** The app as this server reaches itself, so printing a page never goes out through the internet. */
const selfUrl = (url: string) => {
  const u = new URL(url);
  return `http://127.0.0.1:${process.env.PORT ?? 3000}${u.pathname}${u.search}`;
};

export async function pdfOf(src: { url: string } | { html: string }): Promise<Buffer | null> {
  let page;
  try {
    page = await (await open()).newPage();
    page.setDefaultTimeout(20_000);
    if ("url" in src) {
      const res = await page.goto(selfUrl(src.url), { waitUntil: "networkidle" });
      if (!res?.ok()) throw new Error(`${src.url.split("?")[0]} answered ${res?.status()}`); // never attach an error page
    } else {
      await page.setContent(src.html.replaceAll(`cid:${EMAIL_LOGO_CID}`, `data:image/png;base64,${EMAIL_LOGO_PNG}`), { waitUntil: "networkidle" });
      await page.addStyleTag({ content: EMAIL_PRINT_CSS });
    }
    await page.emulateMedia({ media: "print" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }); // margins from each page's @page
  } catch (e) {
    console.error("[pdf] couldn't print; sending without the attachment", e instanceof Error ? e.message : e);
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}

/** The attachment list for an email: the PDF, or nothing when it couldn't be printed or no email will be sent (demos log only). */
export const pdfAttachment = async (filename: string, src: { url: string } | { html: string }) => {
  if (!graphConfigured() && !process.env.SMTP_URL) return [];
  const content = await pdfOf(src);
  return content ? [{ filename: `${filename.replace(/[^\w.-]+/g, "-")}.pdf`, content }] : [];
};
