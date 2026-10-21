// PDFs for email attachments, printed by Cloudflare Browser Rendering (the `BROWSER` binding, wrangler.jsonc). A tax
// invoice is printed from its hosted page, so the PDF is the same document the link opens; statements and stock-order
// invoices are printed from their branded email. Never in the way of the email: no browser (outside a Cloudflare
// request, or the binding missing), or a failed print, gives null and the email goes without the attachment (its link
// still works). The browser session is shared by the calls of one Worker while it stays connected; pages always close.
import puppeteer, { type Browser, type BrowserWorker, type Page } from "@cloudflare/puppeteer";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG } from "./email-logo";
import { graphConfigured } from "./graph-mail";

// An email is laid out as nested tables for mail clients; on paper its card must flow across pages like a document.
const EMAIL_PRINT_CSS = `@page{size:A4;margin:12mm 10mm}body,body>table{background:#fff!important}body>table>tbody>tr>td{padding:0!important}
.hh-card,.hh-card>tbody,.hh-card>tbody>tr,.hh-card>tbody>tr>td{display:block!important;width:auto!important;max-width:none!important;border-radius:0!important}
tr,td{break-inside:avoid}.hh-card>tbody>tr,.hh-card>tbody>tr>td{break-inside:auto!important}`;

const PAGE_TIMEOUT = 20_000;

/** The Browser Rendering binding of the current request, or undefined outside a Cloudflare request. */
function binding(): BrowserWorker | undefined {
  try {
    return (getCloudflareContext().env as { BROWSER?: BrowserWorker }).BROWSER;
  } catch {
    return undefined;
  }
}

// One browser per binding (bindings only exist inside a request; the same Worker gets the same object back), dropped
// when the session ends so the next call launches a fresh one.
const browsers = new WeakMap<object, Promise<Browser>>();
const open = (b: BrowserWorker) => {
  let p = browsers.get(b);
  if (!p) {
    p = puppeteer.launch(b).then(
      (br) => {
        br.on("disconnected", () => browsers.delete(b));
        return br;
      },
      (e) => {
        browsers.delete(b);
        throw e;
      },
    );
    browsers.set(b, p);
  }
  return p;
};

/** Whether a browser can be reached from here (a Cloudflare request with the `BROWSER` binding). */
export const browserAvailable = () => !!binding();

/**
 * Runs `fn` on a fresh page of the shared browser and closes the page afterwards. Throws outside a Cloudflare request
 * or when the binding is missing. A session that ended since the last call is replaced once.
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const b = binding();
  if (!b) throw new Error("No browser: Browser Rendering is only available inside a Cloudflare request (binding BROWSER)");
  const reused = browsers.has(b);
  let page: Page;
  try {
    page = await (await open(b)).newPage();
  } catch (e) {
    browsers.delete(b);
    if (!reused) throw e;
    page = await (await open(b)).newPage(); // the cached session had ended: one more go on a new one
  }
  try {
    page.setDefaultTimeout(PAGE_TIMEOUT);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function pdfOf(src: { url: string } | { html: string }): Promise<Buffer | null> {
  if (!browserAvailable()) return null;
  try {
    return await withPage(async (page) => {
      if ("url" in src) {
        const res = await page.goto(src.url, { waitUntil: "networkidle0" });
        if (!res?.ok()) throw new Error(`${src.url.split("?")[0]} answered ${res?.status()}`); // never attach an error page
      } else {
        await page.setContent(src.html.replaceAll(`cid:${EMAIL_LOGO_CID}`, `data:image/png;base64,${EMAIL_LOGO_PNG}`), { waitUntil: "networkidle0" });
        await page.addStyleTag({ content: EMAIL_PRINT_CSS });
      }
      await page.emulateMediaType("print");
      return Buffer.from(await page.pdf({ format: "a4", printBackground: true, preferCSSPageSize: true })); // margins from each page's @page
    });
  } catch (e) {
    console.error("[pdf] couldn't print; sending without the attachment", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The attachment list for an email: the PDF, or nothing when it couldn't be printed or no email will be sent (demos log only). */
export const pdfAttachment = async (filename: string, src: { url: string } | { html: string }) => {
  if (!graphConfigured()) return [];
  const content = await pdfOf(src);
  return content ? [{ filename: `${filename.replace(/[^\w.-]+/g, "-")}.pdf`, content }] : [];
};
