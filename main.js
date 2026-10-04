// The Alchemist: scroll-scrubbed film
// Small screens and touch devices get the lighter 720px / 10 fps set (see scripts/build-frames.sh)
const MOBILE = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
const FRAME_DIR = MOBILE ? 'frames-mobile' : 'frames';
const FRAME_COUNT = MOBILE ? 459 : 688;
const PRELOAD_COUNT = 30;     // frames needed before "Enter" appears
const LAZY_WORKERS = 4;       // parallel downloads for the remaining frames
const COARSE_STEP = 8;        // after the first frames, load every Nth frame so scrubbing always has a close match
const VOL_ACTIVE = 0.6;       // volume while scrolling
const VOL_IDLE = 0.35;        // volume when scrolling stops
const IDLE_DELAY = 250;       // ms without scroll before dipping
let letterbox = 2.39;         // cinematic aspect ratio; read from the --ratio CSS variable (portrait uses a taller one)
const SCENES = 6;
const CROP_ANCHOR_Y = 570;    // lowest visible row, in 720p-equivalent pixels, scaled by frame height (watermark starts at ~576)

const framePath = i => `${FRAME_DIR}/f_${String(i + 1).padStart(4, '0')}.webp`;

const canvas = document.getElementById('film');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');
const barFill = document.getElementById('barFill');
const pct = document.getElementById('pct');
const enterBtn = document.getElementById('enter');
const muteBtn = document.getElementById('mute');
const titleEl = document.getElementById('title');
const captionEls = document.querySelectorAll('#captions p');
const bandEl = document.getElementById('band');
const grain = document.getElementById('grain');

/* ---------- Frames ---------- */
const images = new Array(FRAME_COUNT).fill(null);   // loaded, decoded images only
let currentFrame = 0;
let drawnFrame = -1;

function loadFrame(i) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = framePath(i);
    img.decode().then(() => { images[i] = img; resolve(); }).catch(resolve);
  });
}

// Draw frame i, or the nearest loaded frame (either direction) if i is not ready yet
function draw(i, force) {
  let j = -1;
  for (let d = 0; d < FRAME_COUNT && j < 0; d++) {
    if (images[i - d]) j = i - d;
    else if (images[i + d]) j = i + d;
  }
  const img = images[j];
  if (!img || (j === drawnFrame && !force)) return;
  drawnFrame = j;
  // cover the area between the letterbox bars; the visible source region never extends below
  // CROP_ANCHOR_Y (hides the corner watermark), zooming in further if the window is too tall
  const bar = Math.max(0, (canvas.height - canvas.width / letterbox) / 2);
  const ah = canvas.height - 2 * bar;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const maxY = CROP_ANCHOR_Y / 720 * nh;
  const s = Math.max(canvas.width / nw, ah / nh, ah / maxY);
  const sw = canvas.width / s, sh = ah / s;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, (nw - sw) / 2, Math.max(0, maxY - sh), sw, sh, 0, bar, canvas.width, ah);
}

function resize() {
  letterbox = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ratio')) || 2.39;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.imageSmoothingEnabled = true;       // resizing the canvas resets context state
  ctx.imageSmoothingQuality = 'high';
  draw(currentFrame, true);
}
addEventListener('resize', resize);
resize();

async function preload() {
  let done = 0;
  const tasks = [];
  for (let i = 0; i < PRELOAD_COUNT; i++) {
    tasks.push(loadFrame(i).then(() => {
      done++;
      const p = Math.round((done / PRELOAD_COUNT) * 100);
      barFill.style.width = p + '%';
      pct.textContent = p + '%';
    }));
  }
  await Promise.all(tasks);
  draw(0, true);
  loader.classList.add('is-ready');
  enterBtn.hidden = false;
  performance.mark('enter-ready');
  lazyLoadRest();
}

// Load order after the first frames: every COARSE_STEP-th frame across the whole film, then the
// gaps, halving the spacing each pass (offsets 4, 2/6, 1/3/5/7 for a step of 8)
function loadOrder() {
  const order = [];
  const seen = new Set();
  const add = i => { if (i < FRAME_COUNT && !images[i] && !seen.has(i)) { seen.add(i); order.push(i); } };
  for (let i = PRELOAD_COUNT; i < FRAME_COUNT; i += COARSE_STEP) add(i);
  add(FRAME_COUNT - 1);
  for (let step = COARSE_STEP / 2; step >= 1; step /= 2) {
    for (let i = PRELOAD_COUNT; i < FRAME_COUNT; i += step) add(i);
  }
  for (let i = PRELOAD_COUNT; i < FRAME_COUNT; i++) add(i);   // safety net
  return order;
}

function lazyLoadRest() {
  const order = loadOrder();
  let next = 0;
  const worker = async () => {
    while (next < order.length) {
      const i = order[next++];
      await loadFrame(i);
      if (i === currentFrame || !images[currentFrame]) draw(currentFrame);   // swap in a closer frame
    }
  };
  for (let w = 0; w < LAZY_WORKERS; w++) worker();
}

/* ---------- Film grain ---------- */
const GRAIN_W = 1280, GRAIN_H = 720;
grain.width = GRAIN_W;
grain.height = GRAIN_H;
const gctx = grain.getContext('2d');
const noise = gctx.createImageData(GRAIN_W, GRAIN_H);
const noise32 = new Uint32Array(noise.data.buffer);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function drawGrain() {
  for (let i = 0; i < noise32.length; i++) {
    noise32[i] = 0xff000000 | ((Math.random() * 256) | 0) * 0x010101;
  }
  gctx.putImageData(noise, 0, 0);
}
drawGrain();
let grainTick = 0;
(function grainLoop() {
  if (!MOBILE && !reduceMotion.matches && !document.hidden && ++grainTick % 2 === 0) drawGrain();
  requestAnimationFrame(grainLoop);
})();

/* ---------- Audio ---------- */
const audio = new Audio('audio/theme.mp3');
audio.loop = true;
audio.volume = 0;

const level = { v: 0 };            // master volume, tweened
let audioOn = false;
let muted = MOBILE;               // phones start muted unless the visitor chose otherwise
try {
  const saved = localStorage.getItem('alchemist-muted');
  if (saved !== null) muted = saved === '1';
} catch (e) {}

function renderMute() {
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  audio.muted = muted;
}
renderMute();

muteBtn.addEventListener('click', () => {
  muted = !muted;
  try { localStorage.setItem('alchemist-muted', muted ? '1' : '0'); } catch (e) {}
  renderMute();
});

function fadeTo(v, duration) {
  gsap.to(level, { v, duration, ease: 'sine.inOut', overwrite: true, onUpdate: () => { audio.volume = level.v; } });
}

let idleTimer;
function onScrollActivity() {
  if (!audioOn) return;
  clearTimeout(idleTimer);
  if (level.v < VOL_ACTIVE - 0.01) fadeTo(VOL_ACTIVE, 0.8);
  idleTimer = setTimeout(() => fadeTo(VOL_IDLE, 1.5), IDLE_DELAY);
}

/* ---------- Scroll ---------- */
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: 0.07 });
lenis.stop();
lenis.on('scroll', () => { ScrollTrigger.update(); onScrollActivity(); });
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

ScrollTrigger.create({
  trigger: '#film-scroll',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: self => {
    currentFrame = Math.min(FRAME_COUNT - 1, Math.round(self.progress * (FRAME_COUNT - 1)));
    draw(currentFrame);
    updateText(self.progress);
  }
});

// Title fades out as scrolling starts; one caption per scene, fading in and out inside its range
function updateText(p) {
  titleEl.style.opacity = Math.max(0, 1 - p / 0.012);
  const scene = Math.min(SCENES - 1, Math.floor(p * SCENES));
  const t = p * SCENES - scene;                       // 0..1 within the scene
  const clamp01 = x => Math.min(1, Math.max(0, x));
  const fadeIn = clamp01((t - 0.08) / 0.10);          // 8-18%
  const a = Math.min(fadeIn, clamp01((0.92 - t) / 0.10));   // visible to 82%, gone by 92%
  captionEls.forEach((el, i) => {
    el.style.opacity = i === scene ? a : 0;
    el.style.transform = `translateY(${(1 - fadeIn) * 8}px)`;   // drift up while fading in
  });
  bandEl.style.opacity = a;
}
updateText(0);

// End section: last frame stays as background, darkened, text fades in
gsap.to('#veil', {
  opacity: 0.6, ease: 'none',
  scrollTrigger: { trigger: '#end', start: 'top bottom', end: 'top top', scrub: true }
});
gsap.to('#end .column', {
  opacity: 1, ease: 'none',
  scrollTrigger: { trigger: '#end', start: 'top 50%', end: 'top 10%', scrub: true }
});

/* ---------- Enter ---------- */
enterBtn.addEventListener('click', () => {
  audio.play().catch(() => {});        // must start inside the click handler
  audioOn = true;
  fadeTo(VOL_ACTIVE, 2);
  idleTimer = setTimeout(() => fadeTo(VOL_IDLE, 1.5), 2500);

  loader.classList.add('is-hidden');
  document.body.classList.remove('is-loading');
  muteBtn.classList.add('is-visible');
  window.scrollTo(0, 0);
  lenis.start();
  ScrollTrigger.refresh();
});

preload();
