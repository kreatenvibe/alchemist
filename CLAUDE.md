# The Alchemist — scroll-driven film

## Goal
Trailer-style scroll-scrubbed film of *The Alchemist*: 6 scenes, ~48 s.

## Technique
- WebP image sequence (`frames/f_%04d.webp`) drawn to a single fixed `<canvas>`.
- Scroll position maps to frame index via GSAP ScrollTrigger; Lenis provides smooth scrolling.
- GSAP, ScrollTrigger and Lenis load from CDN (no npm, no build step).
- Frames are generated from `source/01.mp4–06.mp4` by `scripts/build-frames.sh` (ffmpeg, 0.5 s xfades, 1920 px wide, 15 fps, WebP quality 80, ~41 MB). The script first writes `source/merged-1080p.mp4` (x264 crf 12), then exports frames from it.

## Audio
- Ambient loop (`audio/theme.mp3`) started by an "Enter" button (satisfies autoplay rules).
- Volume fades with scroll activity; a mute button is always available.

## Scope
- Desktop first; mobile later.
- Animated captions later.

## Structure
`index.html`, `style.css`, `main.js` · `frames/` · `audio/` · `source/` (git-ignored) · `scripts/`

## Rules
- Plain HTML/CSS/JS, no frameworks.
- Make small, targeted edits.

## Decisions
- M2: source clips are already native 1920x1080, so Real-ESRGAN upscaling was skipped (it would only re-upscale a downscale). Frames are re-exported at 1920 directly. `CROP_ANCHOR_Y` is in 720p units and scales with frame height, so no change needed. Quality 80 keeps frames/ under 45 MB (85 would be ~50 MB).
- M3: load order = first 30 frames (gates Enter, 2.8 MB) -> every 8th frame (84 frames, ~8 MB cumulative, max gap 8) -> gaps filled by halving (4, 2/6, 1/3/5/7). `draw()` shows the nearest loaded frame in either direction and redraws when a closer one arrives. Decoded size is ~8.3 MB/frame at 1920x1080, so holding all 688 decoded would be ~5.7 GB worst case; relies on the browser evicting decoded bitmaps.
- M4: Vercel static deploy. `vercel.json` sets `Cache-Control: public, max-age=31536000, immutable` on `/frames/*` and `/audio/*`; `.vercelignore` excludes `source/`, `scripts/`, `CLAUDE.md`. Because the cache is immutable, re-exported frames or audio need new paths (e.g. `frames-v2/`) or a hard-refresh won't be enough for returning visitors.
