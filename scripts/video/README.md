# Brand videos

Eight short, silent-safe motion-graphics videos for social (the launch in Hillcrest and Hilton), rendered from
HTML/CSS scenes with no new runtime dependency. Output: `public/brand/video/<name>-{9x16,16x9}.mp4`
(H.264, yuv420p, faststart, 30 fps, 1080×1920 and 1920×1080, 15–30 s, each under 4 MB).

| name | what it says |
|---|---|
| `welcome` | Welcome to the Windmill: the mark draws itself in, the wordmark, "Holland, meet the Hills." |
| `founding` | 2,026 numbered Founding cards: the number counts up, card #0292 slides in and climbs to #0043 (a friend = 250 places). |
| `lab-tested` | Every batch has a certificate: batch code → QR → five safety panels tick. |
| `rewards` | How Rewards works: join → points → tiers (Seed, Sprout, Bloom, Harvest). No money amounts. |
| `hillcrest`, `hilton` | Town name reveal, map pin, "Opening soon". |
| `join` | Join in 20 seconds: a phone mock of the join flow (number, one-time code, card), with a 20 s ring. |
| `range` | The range: category renders drifting past as a grid. No prices, no close-ups. |

Every video ends on the same card: the mark, "Join free", `shop.herbalholland.com/club/join`, "Adults 18+".
Captions are burned in, inside the social safe area, so the videos work with sound off. The rules the scenes
follow (brand-led, no prices, no consumption, no medical claims, product renders only as the-range artwork,
one call to action) are in `docs/VIDEO-SHOTLIST.md`.

## Render

```bash
FFMPEG=/path/to/ffmpeg npx tsx scripts/video/render.tsx            # all eight, both orientations
FFMPEG=/path/to/ffmpeg npx tsx scripts/video/render.tsx join range  # some
```

Options (env): `ORIENT=9x16|16x9`, `FPS` (30), `CRF` (23; raised by 4 and re-encoded while a file is over
`MAX_MB`, default 4), `JOBS` (2 renders in parallel), `OUT` (default `public/brand/video`),
`STILLS=<dir>` (also writes one PNG per second, for a contact sheet), `FFPROBE` (defaults to the `ffprobe`
beside `FFMPEG`; without one, durations come from `ffmpeg -i`). The script fails if any file is over the size
limit, outside 15–30 s, or not H.264 yuv420p.

Chromium comes from Playwright (`/opt/pw-browsers/chromium` in CI, else Playwright's own install). Frames are
rendered deterministically: every CSS animation on the page is paused and its `currentTime` set per frame
(`window.tick(t)` drives the few things CSS can't, such as counters and the typing), each frame is screenshotted
and piped to ffmpeg. A 20 s video is ~600 frames and takes about a minute per orientation.

## Getting ffmpeg

ffmpeg is not a dependency of this project and must never be added to `package.json`. Use any build with
`libx264` and point `FFMPEG` at it:

- A static build via npm, in its own directory outside the repo (the binary lands in
  `node_modules/@ffmpeg-installer/linux-x64/ffmpeg`; `@ffprobe-installer/linux-x64` gives a matching `ffprobe`):
  ```bash
  mkdir -p /tmp/ffmpeg && npm install --prefix /tmp/ffmpeg --no-save --ignore-scripts @ffmpeg-installer/linux-x64 @ffprobe-installer/linux-x64
  export FFMPEG=/tmp/ffmpeg/node_modules/@ffmpeg-installer/linux-x64/ffmpeg FFPROBE=/tmp/ffmpeg/node_modules/@ffprobe-installer/linux-x64/ffprobe
  ```
  `ffmpeg-static` works the same way (`node_modules/ffmpeg-static/ffmpeg`).
- A johnvansickle static build: `curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ`
  and use the `ffmpeg` and `ffprobe` inside.
- A system ffmpeg (`apt install ffmpeg`, `brew install ffmpeg`): if it is on `PATH` the script finds it.

Playwright's own `ffmpeg` (`/opt/pw-browsers/ffmpeg-*/ffmpeg-linux`) only has VP8/WebM and will not do.

## Files

- `render.tsx`: the driver (Playwright → frames → ffmpeg, size check, ffprobe summary).
- `scenes.ts`: the eight scenes, one function each, as HTML + CSS keyframes on a timeline in seconds.
- `scene.ts`: shared pieces: page skeleton (Outfit embedded, tokens, caption style), the mark with draw-in,
  captions, the end card and the `Build` keyframe helper (`win(from, to)` for enter/hold/exit, `tween`, `loop`).

To add a video: write a scene in `scenes.ts` (use `captions()` and `endCard()`), add it to `SCENES`, render,
check a contact sheet from `STILLS`, and add its row to `docs/VIDEO-SHOTLIST.md`.
