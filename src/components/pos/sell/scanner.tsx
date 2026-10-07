"use client";
// Camera scanning with the browser's BarcodeDetector (Chrome / Edge / Samsung Internet on Android, ChromeOS and
// macOS; not Firefox, not iOS Safari yet): EAN-13 / EAN-8 / UPC / Code 128 / Code 39 product barcodes and QR codes
// (member cards, event tickets, collection codes, batch certificates). A viewfinder, a torch toggle where the camera
// has one, and a plain "not supported" state that points at the alternatives. Keyboard-wedge scanners (USB or
// Bluetooth "keyboard" scanners) work everywhere without this: the till listens for them on every screen.
import { useEffect, useRef, useState } from "react";
import { Flashlight, FlashlightOff, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { Alert, PosButton, Sheet } from "../ui";

type Detected = { rawValue: string; format?: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<Detected[]> };
type DetectorCtor = (new (opts: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

export const WANTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/** Synchronous check: the API exists and a camera can be asked for. The sheet confirms the formats when it opens. */
export const cameraScanSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export type ScanSupport = "checking" | "ok" | "no-api" | "no-camera" | "insecure" | "no-formats";

async function support(): Promise<ScanSupport> {
  if (typeof window === "undefined") return "checking";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "no-camera";
  if (!("BarcodeDetector" in window)) return "no-api";
  const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
  try {
    const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : WANTED_FORMATS;
    return formats.some((f) => WANTED_FORMATS.includes(f)) ? "ok" : "no-formats";
  } catch {
    return "no-api";
  }
}

const NOT_SUPPORTED: Record<Exclude<ScanSupport, "ok" | "checking">, string> = {
  "no-api": "Camera scanning isn't supported on this browser. It works in Chrome, Edge and Samsung Internet on Android (and Chrome on ChromeOS and macOS).",
  "no-formats": "This browser has the scanning API but can't read barcodes on this device.",
  "no-camera": "This device has no camera the browser can use.",
  insecure: "Camera scanning needs a secure (https) connection.",
};

export function CameraScanner({ open, title, onResult, onClose }: { open: boolean; title: string; onResult: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [state, setState] = useState<ScanSupport>("checking");
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<null | boolean>(null); // null = the camera has no torch
  const [last, setLast] = useState<string | null>(null);
  const done = useRef(onResult);
  done.current = onResult;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    setError(null);
    setTorch(null);
    setLast(null);
    (async () => {
      const s = await support();
      if (stopped) return;
      setState(s);
      if (s !== "ok") return;
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const formats = Ctor.getSupportedFormats ? (await Ctor.getSupportedFormats()).filter((f) => WANTED_FORMATS.includes(f)) : WANTED_FORMATS;
        const detector = new Ctor({ formats });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const t = stream.getVideoTracks()[0];
        track.current = t;
        const caps = (t.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (caps.torch) setTorch(false);
        let seen = "";
        let seenAt = 0;
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2 || stopped) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const hit = codes.find((c) => c.rawValue)?.rawValue;
          if (!hit) return;
          // The same code held in front of the camera fires once, not every 200 ms.
          if (hit === seen && Date.now() - seenAt < 2500) return;
          seen = hit;
          seenAt = Date.now();
          setLast(hit);
          if (navigator.vibrate) navigator.vibrate(30);
          stopped = true;
          done.current(hit);
        }, 200);
      } catch (e) {
        const name = (e as Error).name;
        setError(name === "NotAllowedError" ? "Camera access was blocked. Allow it for this site in the browser settings, then try again." : name === "NotFoundError" ? "No camera was found on this device." : "Couldn't start the camera on this device.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      track.current = null;
    };
  }, [open]);

  const toggleTorch = async () => {
    const t = track.current;
    if (!t || torch == null) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={state === "ok" ? "Point the camera at the barcode or QR code" : undefined} size="md">
      {state === "checking" ? (
        <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-black text-ink-400">Starting the camera…</div>
      ) : state !== "ok" ? (
        <div data-testid="scan-unsupported">
          <Alert tone="warn">
            <div className="font-semibold">Not supported on this browser</div>
            <div className="mt-1">{NOT_SUPPORTED[state]}</div>
          </Alert>
          <div className="mt-4 rounded-2xl bg-ink-850 p-4 text-sm leading-relaxed text-ink-300 ring-1 ring-ink-800">
            <div className="flex items-center gap-2 font-semibold text-white">
              <ScanLine className="h-4 w-4 text-brand-400" /> What works everywhere
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>A USB or Bluetooth barcode scanner: scan anywhere on the till. There&apos;s no set-up: it types the code and the till acts on it.</li>
              <li>Type the barcode, SKU, member number or batch code into the search box and press Enter.</li>
            </ul>
          </div>
        </div>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-black" data-testid="viewfinder">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          {/* Viewfinder: a darkened surround, corner marks and a sweeping line (still when motion is reduced). */}
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl shadow-[0_0_0_999px_rgb(0_0_0/0.45)]">
            {(["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"] as const).map((c) => (
              <span key={c} className={cn("absolute h-8 w-8 border-brand-500", c)} />
            ))}
            <span className="absolute inset-x-3 top-1/2 h-0.5 bg-brand-500/80 motion-safe:animate-[scan_2.2s_ease-in-out_infinite]" />
          </div>
          {torch != null && (
            <PosButton variant={torch ? "primary" : "secondary"} className="absolute bottom-3 right-3" onClick={() => void toggleTorch()} aria-pressed={torch} aria-label={torch ? "Turn the torch off" : "Turn the torch on"}>
              {torch ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />} Torch
            </PosButton>
          )}
          {last && <div className="absolute bottom-3 left-3 rounded-full bg-ink-950/80 px-3 py-1 font-mono text-xs text-white">{last}</div>}
          <style>{`@keyframes scan{0%,100%{transform:translateY(-38%)}50%{transform:translateY(38%)}}`}</style>
        </div>
      )}
    </Sheet>
  );
}
