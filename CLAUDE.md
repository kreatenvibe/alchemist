# The Alchemist — scroll-driven film

## Goal
Trailer-style scroll-scrubbed film of *The Alchemist*: 6 scenes, ~48 s.

## Technique
- WebP image sequence (`frames/f_%04d.webp`) drawn to a single fixed `<canvas>`.
- Scroll position maps to frame index via GSAP ScrollTrigger; Lenis provides smooth scrolling.
- GSAP, ScrollTrigger and Lenis load from CDN (no npm, no build step).
- Frames are generated from `source/01.mp4–06.mp4` by `scripts/build-frames.sh` (ffmpeg, 0.5 s xfades, 1280 px wide, 15 fps, quality 70).

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
