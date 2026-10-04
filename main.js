// The Alchemist: scroll-scrubbed film
const FRAME_COUNT = 688;      // frames/f_0001.webp ... f_0688.webp (see scripts/build-frames.sh)
const PRELOAD_COUNT = 30;     // frames needed before "Enter" appears
const LAZY_WORKERS = 4;       // parallel downloads for the remaining frames
const VOL_ACTIVE = 0.6;       // volume while scrolling
const VOL_IDLE = 0.35;        // volume when scrolling stops
const IDLE_DELAY = 250;       // ms without scroll before dipping
const LETTERBOX = 2.39;       // cinematic aspect ratio
const SCENES = 6;
const CROP_ANCHOR_Y = 570;    // lowest visible row, in 1280x720 source pixels (watermark starts at ~576)

const framePath = i => `frames/f_${String(i + 1).padStart(4, '0')}.webp`;

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

// Draw frame i, or the closest earlier loaded frame if i is not ready yet
function draw(i, force) {
  let j = i;
  while (j > 0 && !images[j]) j--;
  const img = images[j];
  if (!img || (j === drawnFrame && !force)) return;
  drawnFrame = j;
  // cover the area between the letterbox bars; the visible source region never extends below
  // CROP_ANCHOR_Y (hides the corner watermark), zooming in further if the window is too tall
  const bar = Math.max(0, (canvas.height - canvas.width / LETTERBOX) / 2);
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
  lazyLoadRest();
}

// Remaining frames, in order, a few at a time
function lazyLoadRest() {
  let next = PRELOAD_COUNT;
  const worker = async () => {
    while (next < FRAME_COUNT) await loadFrame(next++);
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
  if (!reduceMotion.matches && !document.hidden && ++grainTick % 2 === 0) drawGrain();
  requestAnimationFrame(grainLoop);
})();

/* ---------- Audio ---------- */
const audio = new Audio('audio/theme.mp3');
audio.loop = true;
audio.volume = 0;

const level = { v: 0 };            // master volume, tweened
let audioOn = false;
let muted = false;
try { muted = localStorage.getItem('alchemist-muted') === '1'; } catch (e) {}

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
