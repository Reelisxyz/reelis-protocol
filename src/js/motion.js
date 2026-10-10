// Motion layer: one shared rAF loop, a damped spring solver, scroll reveal, parallax, spotlight, count-up.
// Every entry point checks reduced motion at call time and jumps straight to the end state.

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;

// ---------- shared loop ----------
const active = new Set();
let raf = 0, last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
  for (const fn of [...active]) if (fn(dt) === false) active.delete(fn);
  raf = active.size ? requestAnimationFrame(frame) : 0;
}
function run(fn) {
  active.add(fn);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return () => active.delete(fn);
}

// ---------- damped spring (semi-implicit Euler, fixed 1/240s substeps) ----------
export function spring({ from = 0, to = 1, stiffness = 170, damping = 20, mass = 1, delay = 0, precision = 0.001, onUpdate, onDone }) {
  if (reduced()) { onUpdate(to); onDone && onDone(); return () => {}; }
  let x = from, v = 0, wait = delay / 1000, stop = null;
  const SUB = 1 / 240;
  stop = run((dt) => {
    if (wait > 0) { wait -= dt; return true; }
    let rem = dt;
    while (rem > 0) {
      const h = Math.min(SUB, rem); rem -= h;
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * h; x += v * h;
    }
    const done = Math.abs(x - to) < precision && Math.abs(v) < precision * 10;
    onUpdate(done ? to : x);
    if (done) { onDone && onDone(); return false; }
    return true;
  });
  return () => stop && stop();
}

// ---------- scroll reveal ----------
const STAGGER = 70;
export function initReveal(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]:not([data-revealed])')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(settle); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      playIn(e.target, Number(e.target.dataset.i || 0) * STAGGER);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}
function settle(el) { el.dataset.revealed = '1'; el.style.opacity = ''; el.style.transform = ''; el.style.removeProperty('opacity'); }
export function playIn(el, delay = 0, rise = 28) {
  if (el.dataset.revealed) return;
  el.dataset.revealed = '1';
  if (reduced()) { settle(el); el.style.opacity = '1'; return; }
  el.style.opacity = '0';
  spring({
    from: 0, to: 1, stiffness: 160, damping: 17, delay,
    onUpdate: (p) => { el.style.opacity = String(Math.max(0, Math.min(1, p * 1.25))); el.style.transform = `translate3d(0, ${(1 - p) * rise}px, 0) scale(${0.985 + 0.015 * p})`; },
    onDone: () => { el.style.transform = ''; el.style.opacity = '1'; },
  });
}

// ---------- hero parallax: pointer and scroll, both through springs ----------
export function initParallax() {
  const layers = [...document.querySelectorAll('[data-parallax]')];
  if (!layers.length) return;
  const state = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, sy: 0 };
  let live = false;
  const hero = document.querySelector('.hero');
  const apply = () => {
    for (const el of layers) {
      const d = Number(el.dataset.parallax);
      el.style.translate = `${(state.x * d * 26).toFixed(2)}px ${(state.y * d * 18 - state.sy * d * 0.14).toFixed(2)}px`;
    }
  };
  const tick = (dt) => {
    const k = 120, c = 16;
    for (const ax of ['x', 'y']) {
      const tgt = ax === 'x' ? state.tx : state.ty, vk = ax === 'x' ? 'vx' : 'vy';
      let rem = dt;
      while (rem > 0) { const h = Math.min(1 / 240, rem); rem -= h; state[vk] += (-k * (state[ax] - tgt) - c * state[vk]) * h; state[ax] += state[vk] * h; }
    }
    apply();
    const settled = Math.abs(state.x - state.tx) < 0.0005 && Math.abs(state.y - state.ty) < 0.0005 && Math.abs(state.vx) < 0.001 && Math.abs(state.vy) < 0.001;
    if (settled) { live = false; return false; }
    return true;
  };
  const kick = () => { if (reduced() || live) return; live = true; run(tick); };
  const onMove = (e) => { state.tx = (e.clientX / window.innerWidth - 0.5) * 2; state.ty = (e.clientY / window.innerHeight - 0.5) * 2; kick(); };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', () => { if (reduced()) return; state.sy = Math.min(window.scrollY, hero ? hero.offsetHeight + 200 : 800); apply(); }, { passive: true });
  // tilt for the mock screen
  const stage = document.querySelector('.post__stage'), phone = document.querySelector('.phone');
  if (stage && phone) {
    const t = { rx: 0, ry: 0, trx: 0, try_: 0, vrx: 0, vry: 0 }; let on = false;
    const step = (dt) => {
      for (const [p, tg, v] of [['rx', 'trx', 'vrx'], ['ry', 'try_', 'vry']]) {
        let rem = dt; while (rem > 0) { const h = Math.min(1 / 240, rem); rem -= h; t[v] += (-140 * (t[p] - t[tg]) - 15 * t[v]) * h; t[p] += t[v] * h; }
      }
      phone.style.transform = `perspective(900px) rotateX(${t.rx.toFixed(2)}deg) rotateY(${t.ry.toFixed(2)}deg)`;
      if (Math.abs(t.rx - t.trx) < 0.01 && Math.abs(t.ry - t.try_) < 0.01 && Math.abs(t.vrx) < 0.01 && Math.abs(t.vry) < 0.01) { on = false; return false; }
      return true;
    };
    const go = () => { if (reduced() || on) return; on = true; run(step); };
    stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); t.try_ = ((e.clientX - r.left) / r.width - 0.5) * 12; t.trx = -((e.clientY - r.top) / r.height - 0.5) * 12; go(); });
    stage.addEventListener('pointerleave', () => { t.trx = 0; t.try_ = 0; go(); });
  }
}

// ---------- spotlight: delegated pointer tracking ----------
export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    if (reduced()) return;
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(1)}px`);
    el.style.setProperty('--my', `${(e.clientY - r.top).toFixed(1)}px`);
  }, { passive: true });
}

// ---------- scroll progress ----------
export function initProgress() {
  const bar = document.querySelector('[data-progress]');
  if (!bar) return;
  let pending = false;
  const paint = () => {
    pending = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0})`;
  };
  const queue = () => { if (!pending) { pending = true; requestAnimationFrame(paint); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  paint();
}

// ---------- number tween with flash on change ----------
export function tweenNumber(el, to, format, { initial = false } = {}) {
  const prev = el._val;
  el._val = to;
  if (el._stop) el._stop();
  if (to == null || Number.isNaN(to)) { el.textContent = '—'; return; }
  const from = prev == null ? 0 : prev;
  if (reduced() || from === to) { el.textContent = format(to); return; }
  if (prev != null) flash(el, to > prev ? 'up' : 'down');
  el._stop = spring({ from, to, stiffness: 120, damping: 22, precision: Math.max(Math.abs(to) * 1e-6, 1e-12), onUpdate: (x) => { el.textContent = format(x); }, onDone: () => { el.textContent = format(to); } });
}
export function flash(el, dir) {
  if (reduced()) return;
  const cls = dir === 'up' ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(el._ft); el._ft = setTimeout(() => el.classList.remove(cls), 760);
}
export function bump(el) {
  if (reduced()) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}
