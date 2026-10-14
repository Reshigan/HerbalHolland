// Renders the brand videos: each scene (scenes.ts) is an HTML/CSS motion-graphics page, stepped deterministically
// frame by frame at 30 fps in headless Chromium (every CSS animation's currentTime is set per frame), screenshotted
// and piped to ffmpeg as H.264 mp4 (yuv420p, faststart). Both 9:16 (1080×1920) and 16:9 (1920×1080) are made.
//
//   FFMPEG=/path/to/ffmpeg npx tsx scripts/video/render.tsx [name ...]     (no names = all eight)
//
// Env: FFMPEG (static ffmpeg binary, see README.md), FFPROBE (defaults to the ffprobe beside FFMPEG, optional),
// ORIENT=9x16|16x9 (default both), FPS (30), CRF (23; raised automatically while a file is over MAX_MB),
// MAX_MB (4), JOBS (2 renders in parallel), OUT (public/brand/video), STILLS=<dir> (also writes one PNG per second, for QA).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { SCENES } from "./scenes";
import type { Ctx, Scene } from "./scene";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const OUT = resolve(process.env.OUT ?? join(root, "public/brand/video"));
const FPS = Number(process.env.FPS ?? 30);
const CRF0 = Number(process.env.CRF ?? 23);
const MAX_BYTES = Number(process.env.MAX_MB ?? 4) * 1_000_000;
const JOBS = Math.max(1, Number(process.env.JOBS ?? 2));
const ORIENTS = (process.env.ORIENT ? [process.env.ORIENT] : ["9x16", "16x9"]) as ("9x16" | "16x9")[];
const STILLS = process.env.STILLS ? resolve(process.env.STILLS) : null;

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG,
    join(root, "node_modules/ffmpeg-static/ffmpeg"),
    join(root, "node_modules/@ffmpeg-installer/linux-x64/ffmpeg"),
    ...(process.env.PATH ?? "").split(":").map((p) => join(p, "ffmpeg")),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p) && spawnSync(p, ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout?.includes("libx264"));
  if (!found) throw new Error("No ffmpeg with libx264 found. Set FFMPEG=/path/to/ffmpeg (see scripts/video/README.md).");
  return found;
}
const FFMPEG = findFfmpeg();
const FFPROBE = [process.env.FFPROBE, join(dirname(FFMPEG), "ffprobe")].find((p) => p && existsSync(p)) ?? null;

const names = process.argv.slice(2);
const scenes = names.length ? names.map((n) => SCENES.find((s) => s.name === n) ?? (() => { throw new Error(`unknown video "${n}"; known: ${SCENES.map((s) => s.name).join(", ")}`); })()) : SCENES;
mkdirSync(OUT, { recursive: true });
if (STILLS) mkdirSync(STILLS, { recursive: true });

const ctxFor = (orient: "9x16" | "16x9"): Ctx => (orient === "9x16" ? { w: 1080, h: 1920, portrait: true } : { w: 1920, h: 1080, portrait: false });

async function encode(page: Page, scene: Scene, orient: "9x16" | "16x9", crf: number) {
  const ctx = ctxFor(orient);
  const file = join(OUT, `${scene.name}-${orient}.mp4`);
  await page.setViewportSize({ width: ctx.w, height: ctx.h });
  await page.setContent(await scene.html(ctx), { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    for (const a of document.getAnimations()) a.pause();
  });
  const ff = spawn(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", "-an", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(scene.seconds * FPS);
  for (let f = 0; f < frames; f++) {
    const ms = (f / FPS) * 1000;
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) a.currentTime = ms;
      (window as unknown as { tick?: (t: number) => void }).tick?.(ms / 1000);
    }, ms);
    const buf = await page.screenshot({ type: "jpeg", quality: 92, animations: "allow", caret: "hide" });
    if (!ff.stdin.write(buf)) await once(ff.stdin, "drain");
    if (STILLS && f % FPS === 0) await page.screenshot({ path: join(STILLS, `${scene.name}-${orient}-${String(f / FPS).padStart(2, "0")}s.png`), animations: "allow" });
  }
  ff.stdin.end();
  const [code] = (await once(ff, "close")) as [number];
  if (code !== 0) throw new Error(`ffmpeg exited ${code} for ${file}`);
  return file;
}

function probe(file: string) {
  if (FFPROBE) {
    const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,pix_fmt", "-of", "json", file], { encoding: "utf8" });
    const j = JSON.parse(r.stdout || "{}");
    const s = j.streams?.[0] ?? {};
    return { seconds: Number(j.format?.duration ?? 0), codec: s.codec_name, size: `${s.width}x${s.height}`, pix: s.pix_fmt };
  }
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr ?? "");
  const v = /Video: (\w+).*?(\d{3,4}x\d{3,4})/.exec(r.stderr ?? "");
  return { seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, codec: v?.[1], size: v?.[2], pix: (r.stderr ?? "").includes("yuv420p") ? "yuv420p" : "?" };
}

async function job(browser: Browser, scene: Scene, orient: "9x16" | "16x9") {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    let crf = CRF0;
    for (;;) {
      const t0 = Date.now();
      const file = await encode(page, scene, orient, crf);
      const bytes = statSync(file).size;
      if (bytes <= MAX_BYTES || crf >= 40) {
        const p = probe(file);
        const line = `${scene.name.padEnd(11)} ${orient.padEnd(5)} ${(bytes / 1e6).toFixed(2).padStart(5)} MB  ${p.seconds.toFixed(2)} s  ${p.codec} ${p.size} ${p.pix}  crf ${crf}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`;
        console.log(line);
        return { file, bytes, ...p };
      }
      console.log(`${scene.name} ${orient}: ${(bytes / 1e6).toFixed(2)} MB at crf ${crf}, re-encoding at crf ${crf + 4}`);
      crf += 4;
    }
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const queue = scenes.flatMap((s) => ORIENTS.map((o) => [s, o] as const));
const results: Awaited<ReturnType<typeof job>>[] = [];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) results.push(await job(browser, next[0], next[1]));
}));
await browser.close();
const total = results.reduce((n, r) => n + r.bytes, 0);
console.log(`${results.length} files, ${(total / 1e6).toFixed(1)} MB total → ${OUT}`);
const bad = results.filter((r) => r.bytes > MAX_BYTES || r.seconds < 15 || r.seconds > 30 || r.codec !== "h264" || r.pix !== "yuv420p");
if (bad.length) {
  console.error("Out of spec:", bad.map((r) => r.file).join(", "));
  process.exit(1);
}
