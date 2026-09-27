"use client";
// Camera scanning with the browser's BarcodeDetector (Chrome on Android) — product
// barcodes and member QR codes. Keyboard-wedge scanners work everywhere without this.
import { useEffect, useRef, useState } from "react";
import { Alert, Sheet } from "../ui";

type Detected = { rawValue: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<Detected[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export const cameraScanSupported = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export function CameraScanner({ open, title, onResult, onClose }: { open: boolean; title: string; onResult: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onResult);
  done.current = onResult;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue && !stopped) {
            stopped = true;
            done.current(codes[0].rawValue);
          }
        }, 250);
      } catch (e) {
        setError((e as Error).name === "NotAllowedError" ? "Camera access was blocked — allow it in the browser settings." : "Couldn't start the camera on this device.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="Point the camera at the barcode or QR code" size="md">
      {error ? (
        <Alert>{error}</Alert>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-oranje-500/80 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]" />
        </div>
      )}
    </Sheet>
  );
}
