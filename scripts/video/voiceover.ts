// Lays the narrator onto the rendered launch films: ducks the music under the voice and masters to social loudness
// (-14 LUFS, -1 dBTP), in place. Run after render.tsx (a re-render drops the voice):
//   FFMPEG=/path/to/ffmpeg npx tsx scripts/video/voiceover.ts
// The voice is Deepgram Aura 2 "draco" (Cloudflare Workers AI, @cf/deepgram/aura-2-en); the lines are in assets/vo,
// one file per line, named for the words (the full text is in docs/VIDEO-SHOTLIST.md).
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE ?? FFMPEG.replace(/ffmpeg$/, "ffprobe");
const VO = new URL("./assets/vo/", import.meta.url).pathname;
const OUT = new URL("../../public/brand/video/", import.meta.url).pathname;
// [file, start in seconds]: each line lands inside its scene (scripts/video/launch.ts timelines).
const CUES: Record<string, [string, number][]> = {
  launch: [["stories-travel", 4.3], ["seventies-seed", 6.0], ["second-home", 10.8], ["coming-home", 14.3], ["meet-the-hills", 18.6], ["redefining", 22.4], ["cbd-coffee", 26.6], ["learn-to-grow-long", 30.2], ["founding", 34.3], ["hillcrest-hilton", 36.3], ["join", 40.0]],
  "launch-30": [["stories-travel", 3.2], ["seed-short", 4.9], ["coming-home", 10.1], ["meet-the-hills", 13.3], ["redefining", 16.3], ["cbd-coffee", 18.9], ["learn-to-grow", 21.7], ["founding", 23.6], ["join", 25.8]],
};

for (const [film, cues] of Object.entries(CUES))
  for (const orient of ["9x16", "16x9"]) {
    const file = join(OUT, `${film}-${orient}.mp4`);
    if (!existsSync(file)) continue;
    const inputs = cues.flatMap(([f]) => ["-i", join(VO, `${f}.mp3`)]);
    // Every line padded to the film's length, so amix (which divides by its inputs) never re-weights as one ends.
    const seconds = Number(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);
    const delays = cues.map(([, at], i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},apad,atrim=0:${seconds}[v${i}]`).join(";");
    const voice = `${cues.map((_, i) => `[v${i}]`).join("")}amix=inputs=${cues.length},volume=${cues.length * 1.6},asplit=2[vo][key]`;
    const filter = `${delays};${voice};[0:a][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bed];[bed][vo]amix=inputs=2,volume=2,loudnorm=I=-14:TP=-1:LRA=9[a]`;
    const tmp = file.replace(/\.mp4$/, ".vo.mp4");
    const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", tmp], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}`);
    renameSync(tmp, file);
    console.log(`${film}-${orient}: voice laid in`);
  }
