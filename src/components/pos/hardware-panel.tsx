"use client";
// Shift → This till: the receipt printer and cash drawer, the customer display and training mode.
// Settings live on this device only (lib/storage.ts); hardware is driven by lib/print.ts.
import { useEffect, useState } from "react";
import { Bluetooth, Cable, ExternalLink, GraduationCap, MonitorSmartphone, Printer, RefreshCw, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, errorText } from "./lib/api";
import { displayKey, displayUrl } from "./lib/display";
import { COLUMN_OPTIONS, forget, isConnected, pairBluetooth, pairUsb, printerPaired, printerSupport, reconnect, sendBytes, type PrinterSettings } from "./lib/print";
import { testPageBytes } from "./lib/receipt";
import { usePos } from "./context";
import { Alert, CheckRow, Chip, Confirm, PosButton, Segmented } from "./ui";

export function PrinterCard() {
  const pos = usePos();
  const { printer, setPrinter } = pos;
  const [support, setSupport] = useState({ bluetooth: false, usb: false, secure: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const paired = printerPaired(printer);
  const manager = pos.me.role === "MANAGER";

  useEffect(() => {
    setSupport(printerSupport());
    setConnected(isConnected(printer));
  }, [printer]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      setConnected(isConnected(printer));
    }
  };

  const testPrint = () =>
    run("test", async () => {
      const bytes = testPageBytes({ cols: printer.cols, codePage: printer.codePage, store: pos.boot.store, devicePrefix: pos.boot.device.prefix, drawer: printer.drawerOnCash ? printer.drawerPin : null });
      if (paired) {
        await sendBytes(printer, bytes);
        pos.toast("Test page sent to the printer");
      } else {
        // No printer: the browser's print dialog shows the same test page as the receipt layout would.
        pos.print({ kind: "receipt", receipt: TEST_RECEIPT(pos.boot.store.vatRegistered) });
      }
    });

  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-labelledby="printer-card" data-testid="printer-card">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-800 text-ink-200">
          <Printer className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="printer-card" className="font-display text-lg font-semibold text-white">
            Receipt printer &amp; drawer
          </h2>
          <p className="text-sm text-ink-400">{paired ? `${printer.name} · ${printer.transport === "usb" ? "USB" : "Bluetooth"}` : "No printer paired, so receipts open in the browser's print dialog"}</p>
        </div>
        {paired && <Chip tone={connected ? "green" : "amber"}>{connected ? "Connected" : "Not connected"}</Chip>}
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      {!support.secure && <Alert tone="warn" className="mt-4">Printer pairing needs a secure (https) connection.</Alert>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!paired ? (
          <>
            <PosButton variant="primary" disabled={!support.bluetooth} busy={busy === "ble"} onClick={() => run("ble", async () => setPrinter(await pairBluetooth(printer)))} data-testid="pair-bluetooth">
              <Bluetooth className="h-4 w-4" /> Pair Bluetooth printer
            </PosButton>
            <PosButton variant="secondary" disabled={!support.usb} busy={busy === "usb"} onClick={() => run("usb", async () => setPrinter(await pairUsb(printer)))} data-testid="pair-usb">
              <Cable className="h-4 w-4" /> Pair USB printer
            </PosButton>
          </>
        ) : (
          <>
            {!connected && (
              <PosButton variant="secondary" busy={busy === "reconnect"} onClick={() => run("reconnect", async () => void ((await reconnect(printer)) ? pos.toast("Printer connected") : setError(`Couldn't reach ${printer.name}. Turn it on, then pair it again if needed.`)))}>
                <RefreshCw className="h-4 w-4" /> Reconnect
              </PosButton>
            )}
            <PosButton variant="ghost" onClick={() => setConfirmForget(true)}>
              <Trash2 className="h-4 w-4" /> Forget printer
            </PosButton>
          </>
        )}
        <PosButton variant="outline" busy={busy === "test"} onClick={() => void testPrint()} data-testid="test-print">
          <Printer className="h-4 w-4" /> Test print
        </PosButton>
      </div>
      {!support.bluetooth && !support.usb && support.secure && (
        <p className="mt-2 text-xs text-ink-450">Bluetooth and USB pairing need Chrome or Edge (Android, Windows, macOS, ChromeOS). On an iPad, print through AirPrint from the print dialog.</p>
      )}

      <div className="mt-4">
        <div className="mb-1.5 text-[0.8rem] font-semibold text-ink-300">Paper width</div>
        <Segmented label="Paper width" value={String(printer.cols)} onChange={(v) => setPrinter({ ...printer, cols: Number(v) as PrinterSettings["cols"] })} options={COLUMN_OPTIONS.map((o) => ({ value: String(o.cols), label: o.label }))} fill />
      </div>
      <div className="mt-2">
        <CheckRow checked={printer.autoPrint} onChange={(v) => setPrinter({ ...printer, autoPrint: v })} label="Print automatically after each sale" description="Only when a printer is paired. Tablets without one keep the Print button." />
        <CheckRow checked={printer.drawerOnCash} onChange={(v) => setPrinter({ ...printer, drawerOnCash: v })} label="Open the drawer on cash" description="Pulses the drawer connected to the printer on cash sales and cash refunds." />
        <div className="flex items-center justify-between gap-3 px-1 py-2">
          <span className="text-sm text-ink-300">Drawer connector pin</span>
          <Segmented label="Drawer pin" value={String(printer.drawerPin)} onChange={(v) => setPrinter({ ...printer, drawerPin: Number(v) as 0 | 1 })} options={[{ value: "0", label: "Pin 2" }, { value: "1", label: "Pin 5" }]} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PosButton variant="secondary" onClick={() => pos.openDrawer("manual")} disabled={!paired} data-testid="open-drawer">
          <Wallet className="h-4 w-4" /> Open drawer
        </PosButton>
        <span className="text-xs text-ink-450">{manager ? "Opening the drawer outside a sale asks for your PIN and is logged." : "Asks for a manager's PIN and is logged."}</span>
      </div>

      <Confirm
        open={confirmForget}
        title="Forget this printer?"
        body="Receipts will open in the browser's print dialog until a printer is paired again."
        confirmLabel="Forget"
        danger
        onClose={() => setConfirmForget(false)}
        onConfirm={async () => {
          setPrinter(await forget(printer));
          setConfirmForget(false);
        }}
      />
    </section>
  );
}

/** A receipt-shaped test page for the browser fallback (the ESC/POS test page is testPageBytes). */
const TEST_RECEIPT = (vat: boolean) => ({
  id: "test",
  number: "TEST PAGE",
  kind: "SALE" as const,
  channel: "POS" as const,
  title: "Printer test",
  createdAt: new Date().toISOString(),
  offline: false,
  refundOf: null,
  staff: "Till",
  customer: null,
  lines: [{ id: "t", variantId: "", name: "Test line", variantName: "1 unit", sku: "TEST", qty: 1, unitPriceCents: 1000, discountCents: 0, offerCents: 0, totalCents: 1000, vatCents: vat ? 130 : 0, refundedQty: 0 }],
  subtotalCents: 1000,
  discountCents: 0,
  offerCents: 0,
  offers: [],
  memberSavingsCents: 0,
  totalCents: 1000,
  vatCents: vat ? 130 : 0,
  pointsEarned: 0,
  pointsRedeemed: 0,
  payments: [{ method: "CASH", amountCents: 1000, tenderedCents: 1000, changeCents: 0, provider: null, reference: null, cardBrand: null, cardLast4: null }],
  promoCode: null,
  invoiceEmail: null,
  buyer: null,
  note: "This is a printer test, not a sale.",
  refunds: [],
  invoiceUrl: null,
});

export function DisplayCard() {
  const pos = usePos();
  const { displaySettings, setDisplaySettings, boot } = pos;
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const settings = displaySettings ?? { key: "", remote: false };
  const link = settings.key ? displayUrl(origin, boot.device.id, settings.key) : "";

  const setRemote = (remote: boolean) => {
    const key = settings.key || displayKey();
    setDisplaySettings({ key, remote });
    if (!remote) void api("/api/pos/display", { body: { key, snapshot: null }, quiet401: true }).catch(() => undefined);
  };

  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-labelledby="display-card" data-testid="display-card">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-800 text-ink-200">
          <MonitorSmartphone className="h-5 w-5" />
        </span>
        <div>
          <h2 id="display-card" className="font-display text-lg font-semibold text-white">
            Customer display
          </h2>
          <p className="text-sm text-ink-400">A second screen that shows the sale, points and thank-you to the customer.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <PosButton variant="secondary" onClick={() => window.open("/pos/display", "hh-display", "noopener")} data-testid="open-display-here">
          <ExternalLink className="h-4 w-4" /> Open on this device
        </PosButton>
      </div>
      <p className="mt-2 text-xs text-ink-450">Opens a window you can drag to a second monitor, or a tab on a tablet in the same browser profile. It follows this till without any set-up.</p>
      <CheckRow className="mt-2" checked={settings.remote} onChange={setRemote} label="Send to a separate screen" description="For a display on another device: it polls this till's sale through the server (every 2 seconds) using the link below." />
      {settings.remote && link && (
        <div className="mt-2 grid gap-3 rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-800 sm:grid-cols-[7rem_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/pos/qr?text=${encodeURIComponent(link)}`} alt="QR code for the customer display link" className="aspect-square w-28 rounded-xl bg-white p-1" />
          <div className="min-w-0">
            <div className="text-xs text-ink-400">Open this link on the display device (scan the QR, or type it):</div>
            <div className="mt-1 break-all font-mono text-xs text-white" data-testid="display-link">
              {link}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <PosButton variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(link).then(() => pos.toast("Link copied"))}>
                Copy link
              </PosButton>
              <PosButton variant="ghost" size="sm" onClick={() => setDisplaySettings({ key: displayKey(), remote: true })}>
                New link
              </PosButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function TrainingCard() {
  const pos = usePos();
  const on = !!pos.training;
  return (
    <section className={cn("rounded-3xl p-5 ring-1", on ? "bg-brand-500/10 ring-brand-500/50" : "bg-ink-900 ring-ink-800")} aria-labelledby="training-card" data-testid="training-card">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", on ? "bg-brand-500 text-ink-950" : "bg-ink-800 text-ink-200")}>
          <GraduationCap className="h-5 w-5" />
        </span>
        <div>
          <h2 id="training-card" className="font-display text-lg font-semibold text-white">
            Training mode
          </h2>
          <p className="text-sm text-ink-400">{on ? `On since ${new Date(pos.training!.since).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} · ${pos.training!.sales} practice sale${pos.training!.sales === 1 ? "" : "s"}` : "Practise the whole sale on a sandbox: nothing posts, prints for real, moves stock or awards points."}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {on ? (
          <>
            <PosButton variant="secondary" onClick={pos.showTour}>
              Show the tour
            </PosButton>
            <PosButton variant="primary" onClick={pos.exitTraining} data-testid="exit-training">
              Exit training (manager PIN)
            </PosButton>
          </>
        ) : (
          <PosButton variant="primary" onClick={pos.startTraining} data-testid="start-training">
            <GraduationCap className="h-4 w-4" /> Start training {pos.me.role === "MANAGER" ? "" : "(manager PIN)"}
          </PosButton>
        )}
      </div>
    </section>
  );
}
