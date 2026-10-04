// Scroll-scrub test (scenes 1-3)
const FRAME_COUNT = 348;
const framePath = i => `frames/f_${String(i).padStart(4, '0')}.webp`;

const canvas = document.getElementById('film');
const ctx = canvas.getContext('2d');
const hudFrame = document.getElementById('hudFrame');
document.getElementById('hudTotal').textContent = FRAME_COUNT;

const images = [];
let current = -1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  draw(current < 0 ? 0 : current, true);
}

// "cover" fit
function draw(i, force) {
  const img = images[i];
  if (!img || !img.complete || !img.naturalWidth) return;
  if (i === current && !force) return;
  current = i;
  const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  hudFrame.textContent = i + 1;
}

for (let i = 1; i <= FRAME_COUNT; i++) {
  const img = new Image();
  img.src = framePath(i);
  images.push(img);
}
images[0].onload = () => resize();
addEventListener('resize', resize);

gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

const state = { frame: 0 };
gsap.to(state, {
  frame: FRAME_COUNT - 1,
  ease: 'none',
  snap: 'frame',
  scrollTrigger: { trigger: '#scroller', start: 'top top', end: 'bottom bottom', scrub: 0.3 },
  onUpdate: () => draw(Math.round(state.frame))
});
