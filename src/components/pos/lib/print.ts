// Receipt printer adapter for the till: pairs a Bluetooth LE or USB ESC/POS printer, remembers it on this device,
// sends the bytes lib/escpos.ts builds, and kicks the cash drawer wired to the printer. When nothing is paired the
// till falls back to the browser's print dialog (print.tsx), so every tablet keeps working without hardware.
//
// Browser support: Web Bluetooth and Web USB work in Chrome / Edge / Samsung Internet on Android, ChromeOS, Windows,
// macOS and Linux. Not Safari / iPhone / iPad (browser print → AirPrint there). Web Bluetooth speaks BLE (GATT)
// only: classic Bluetooth "SPP" printers must be paired at the OS level and driven some other way, or replaced
// with a BLE model. Both APIs need a secure context (https, or localhost) and a tap to pair.
import { chunk, COLUMN_OPTIONS, drawerKickBytes, CODE_PAGE_CP1252, type Columns, type DrawerPin } from "./escpos";

export type PrinterTransport = "bluetooth" | "usb";

export type PrinterSettings = {
  transport: PrinterTransport | null;
  name: string | null; // what the pairing dialog called it
  id: string | null; // Bluetooth device id (stable per origin) or USB vendor:product:serial
  cols: Columns;
  codePage: number;
  autoPrint: boolean; // print the receipt after every sale (only when a printer is paired)
  drawerOnCash: boolean; // pulse the drawer on cash tenders and cash refunds
  drawerPin: DrawerPin;
};

export const DEFAULT_PRINTER: PrinterSettings = { transport: null, name: null, id: null, cols: 48, codePage: CODE_PAGE_CP1252, autoPrint: true, drawerOnCash: true, drawerPin: 0 };
export { COLUMN_OPTIONS };

export const printerPaired = (p: PrinterSettings | null | undefined): p is PrinterSettings & { transport: PrinterTransport } => !!p?.transport;

// ── Minimal Web Bluetooth / Web USB typings (lib.dom has neither) ────────────
type BleCharacteristic = {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue: (v: Uint8Array) => Promise<void>;
  writeValueWithResponse?: (v: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (v: Uint8Array) => Promise<void>;
};
type BleService = { uuid: string; getCharacteristics: () => Promise<BleCharacteristic[]> };
type BleServer = { connected: boolean; connect: () => Promise<BleServer>; disconnect: () => void; getPrimaryService: (uuid: string) => Promise<BleService>; getPrimaryServices: () => Promise<BleService[]> };
type BleDevice = { id: string; name?: string; gatt?: BleServer; addEventListener: (type: string, fn: () => void) => void; watchAdvertisements?: (o?: { signal?: AbortSignal }) => Promise<void> };
type Bluetooth = { requestDevice: (o: { filters?: { services?: string[] }[]; acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<BleDevice>; getDevices?: () => Promise<BleDevice[]> };

type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous" };
type UsbAlternate = { interfaceClass: number; endpoints: UsbEndpoint[] };
type UsbInterface = { interfaceNumber: number; alternate: UsbAlternate; claimed: boolean };
type UsbConfiguration = { configurationValue: number; interfaces: UsbInterface[] };
type UsbDevice = {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: UsbConfiguration | null;
  configurations: UsbConfiguration[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  releaseInterface: (n: number) => Promise<void>;
  transferOut: (endpoint: number, data: Uint8Array) => Promise<{ status: string; bytesWritten: number }>;
};
type Usb = { requestDevice: (o: { filters: { classCode?: number; vendorId?: number }[] }) => Promise<UsbDevice>; getDevices: () => Promise<UsbDevice[]> };

const nav = () => (typeof navigator === "undefined" ? {} : (navigator as unknown as { bluetooth?: Bluetooth; usb?: Usb }));

export function printerSupport() {
  const n = nav();
  const secure = typeof window !== "undefined" && window.isSecureContext;
  return { bluetooth: secure && !!n.bluetooth, usb: secure && !!n.usb, secure };
}

// GATT services the common 58 / 80 mm BLE receipt printers expose a "serial" write characteristic on. The pairing
// dialog shows every nearby BLE device (printers rarely advertise a service), then we look for a writable
// characteristic in one of these services.
export const BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // generic "printer" service: Xprinter, GOOJPRT, Netum, Sunmi, most no-name 58 mm
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip transparent UART (many 80 mm portables)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // MTP-II / PeriPage family
  "0000ff00-0000-1000-8000-00805f9b34fb", // FF00/FF02 family (Cat printers, some Xprinter)
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART service
  "0000fff0-0000-1000-8000-00805f9b34fb", // FFF0/FFF2 family
];
const BLE_CHUNK = 100; // bytes per write: safe under the 512-byte GATT limit, and fine for 20-byte MTUs (the stack splits)

type BleLink = { device: BleDevice; ch: BleCharacteristic };
type UsbLink = { device: UsbDevice; iface: number; endpoint: number };
let ble: BleLink | null = null;
let usb: UsbLink | null = null;

export class PrinterError extends Error {}

const usbId = (d: UsbDevice) => `${d.vendorId.toString(16)}:${d.productId.toString(16)}:${d.serialNumber ?? ""}`;
const usbName = (d: UsbDevice) => [d.manufacturerName, d.productName].filter(Boolean).join(" ") || `USB printer ${d.vendorId.toString(16)}:${d.productId.toString(16)}`;

async function writableCharacteristic(server: BleServer): Promise<BleCharacteristic> {
  for (const uuid of BLE_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      const chars = await svc.getCharacteristics();
      const ch = chars.find((c) => c.properties.writeWithoutResponse) ?? chars.find((c) => c.properties.write);
      if (ch) return ch;
    } catch {
      /* this printer doesn't have that service; try the next */
    }
  }
  throw new PrinterError("Connected, but this device doesn't look like a receipt printer (no serial service found)");
}

async function connectBle(device: BleDevice): Promise<BleLink> {
  if (!device.gatt) throw new PrinterError("This device can't be connected to (no GATT)");
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const ch = await writableCharacteristic(server);
  device.addEventListener("gattserverdisconnected", () => {
    if (ble?.device === device) ble = null;
  });
  return { device, ch };
}

/** Opens the browser's Bluetooth chooser (needs a tap) and connects to the printer the person picks. */
export async function pairBluetooth(current: PrinterSettings): Promise<PrinterSettings> {
  const bt = nav().bluetooth;
  if (!bt) throw new PrinterError("Bluetooth printing needs Chrome or Edge on Android, Windows, macOS, ChromeOS or Linux");
  let device: BleDevice;
  try {
    device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
  } catch (e) {
    if ((e as Error).name === "NotFoundError") throw new PrinterError("No printer chosen");
    throw new PrinterError((e as Error).message);
  }
  ble = await connectBle(device);
  return { ...current, transport: "bluetooth", id: device.id, name: device.name || "Bluetooth printer" };
}

/** Opens the browser's USB chooser (needs a tap) and claims the printer's bulk OUT endpoint. */
export async function pairUsb(current: PrinterSettings): Promise<PrinterSettings> {
  const u = nav().usb;
  if (!u) throw new PrinterError("USB printing needs Chrome or Edge (Android with an OTG cable, Windows, macOS, ChromeOS or Linux)");
  let device: UsbDevice;
  try {
    device = await u.requestDevice({ filters: [{ classCode: 7 }, { classCode: 0xff }] });
  } catch (e) {
    if ((e as Error).name === "NotFoundError") throw new PrinterError("No printer chosen");
    throw new PrinterError((e as Error).message);
  }
  usb = await connectUsb(device);
  return { ...current, transport: "usb", id: usbId(device), name: usbName(device) };
}

async function connectUsb(device: UsbDevice): Promise<UsbLink> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1);
  const conf = device.configuration!;
  // Prefer the printer-class interface; otherwise any interface with a bulk OUT endpoint.
  const candidates = [...conf.interfaces].sort((a, b) => (b.alternate.interfaceClass === 7 ? 1 : 0) - (a.alternate.interfaceClass === 7 ? 1 : 0));
  for (const iface of candidates) {
    const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
    if (!ep) continue;
    try {
      if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
      return { device, iface: iface.interfaceNumber, endpoint: ep.endpointNumber };
    } catch (e) {
      // Windows: the vendor driver holds the interface until it's swapped for WinUSB (see the runbook).
      throw new PrinterError(`Couldn't claim the printer's USB interface (${(e as Error).message}). Close other apps using it; on Windows install the WinUSB driver for it (Zadig).`);
    }
  }
  throw new PrinterError("This USB device has no printer endpoint");
}

/** Reconnects to the remembered printer without a chooser where the browser allows it (USB always; Bluetooth via getDevices). */
export async function reconnect(s: PrinterSettings): Promise<boolean> {
  try {
    if (s.transport === "usb") {
      if (usb?.device.opened) return true;
      const list = (await nav().usb?.getDevices()) ?? [];
      const d = list.find((x) => usbId(x) === s.id) ?? list[0];
      if (!d) return false;
      usb = await connectUsb(d);
      return true;
    }
    if (s.transport === "bluetooth") {
      if (ble?.device.gatt?.connected) return true;
      const bt = nav().bluetooth;
      const list = bt?.getDevices ? await bt.getDevices() : [];
      const d = list.find((x) => x.id === s.id);
      if (!d) return false;
      try {
        ble = await connectBle(d);
      } catch {
        // A device from getDevices() may need to be seen advertising before it can be connected to.
        if (!d.watchAdvertisements) return false;
        const ctrl = new AbortController();
        const seen = new Promise<void>((resolve) => d.addEventListener("advertisementreceived", () => (ctrl.abort(), resolve())));
        await d.watchAdvertisements({ signal: ctrl.signal });
        await Promise.race([seen, new Promise((_, rej) => setTimeout(() => rej(new PrinterError("Printer not found. Is it on?")), 6000))]);
        ble = await connectBle(d);
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export const isConnected = (s: PrinterSettings | null) => (s?.transport === "usb" ? !!usb?.device.opened : s?.transport === "bluetooth" ? !!ble?.device.gatt?.connected : false);

/** Sends raw ESC/POS bytes to the paired printer (reconnecting first if needed). */
export async function sendBytes(s: PrinterSettings, bytes: Uint8Array): Promise<void> {
  if (!s.transport) throw new PrinterError("No printer is paired on this till");
  if (!isConnected(s) && !(await reconnect(s))) throw new PrinterError(`${s.name ?? "The printer"} isn't connected: turn it on, then tap Reconnect in Shift → This till`);
  if (s.transport === "usb") {
    const link = usb!;
    for (const part of chunk(bytes, 4096)) {
      const r = await link.device.transferOut(link.endpoint, part);
      if (r.status !== "ok") throw new PrinterError(`The printer refused data (${r.status})`);
    }
    return;
  }
  const link = ble!;
  const ch = link.ch;
  const write = ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse.bind(ch) : ch.writeValueWithResponse ? ch.writeValueWithResponse.bind(ch) : ch.writeValue.bind(ch);
  for (const part of chunk(bytes, BLE_CHUNK)) {
    await write(part);
    // Cheap printers overrun without a breath between writes when writing without response.
    if (ch.properties.writeWithoutResponse) await new Promise((r) => setTimeout(r, 12));
  }
}

/** Pulses the cash drawer through the paired printer's DK port. */
export const kickDrawer = (s: PrinterSettings) => sendBytes(s, drawerKickBytes(s.drawerPin));

/** Drops the remembered printer and closes the connection. */
export async function forget(s: PrinterSettings | null): Promise<PrinterSettings> {
  try {
    if (s?.transport === "bluetooth") ble?.device.gatt?.disconnect();
    if (s?.transport === "usb" && usb) {
      await usb.device.releaseInterface(usb.iface).catch(() => undefined);
      await usb.device.close().catch(() => undefined);
    }
  } finally {
    ble = null;
    usb = null;
  }
  return { ...DEFAULT_PRINTER, cols: s?.cols ?? DEFAULT_PRINTER.cols, autoPrint: s?.autoPrint ?? true, drawerOnCash: s?.drawerOnCash ?? true, drawerPin: s?.drawerPin ?? 0 };
}
