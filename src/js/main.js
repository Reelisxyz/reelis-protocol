import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../styles/tokens.css';
import '../styles/main.css';
import { initReveal, initParallax, initSpotlight, initProgress, reduced } from './motion.js';
import { initMarket } from './market.js';
import { initChainCheck } from './chain.js';

document.documentElement.classList.add('js');

// ---------- copy with feedback ----------
const COPIED_MS = 1600;
async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
function initCopy() {
  const live = document.createElement('div');
  live.className = 'sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  document.body.append(live);
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const ok = await writeClipboard(btn.dataset.copyValue || '');
    const host = btn.closest('.ca') || btn;
    const word = btn.querySelector('[data-feedback]');
    btn.classList.add('is-copied'); host.classList.add('is-copied');
    if (word) word.textContent = ok ? 'Copied' : 'Copy by hand';
    live.textContent = ok ? 'Address copied' : 'Copy blocked by the browser, copy by hand';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove('is-copied'); host.classList.remove('is-copied');
      if (word) word.textContent = 'Copy';
      live.textContent = '';
    }, COPIED_MS);
  });
}

// ---------- layout plumbing ----------
function initBarHeight() {
  const bar = document.querySelector('.bar');
  if (!bar) return;
  const set = () => document.documentElement.style.setProperty('--bar-h', Math.ceil(bar.getBoundingClientRect().bottom + 1) + 'px');
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(bar); else window.addEventListener('resize', set);
}

function initActiveNav() {
  const links = [...document.querySelectorAll('[data-nav]')];
  const map = { top: 'top', flow: 'flow', settle: 'settle', pulse: 'pulse', phases: 'phases', facts: 'facts' };
  const targets = Object.entries(map).map(([k, id]) => [k, document.getElementById(id)]).filter(([, el]) => el);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const key = targets.find(([, el]) => el === e.target)[0];
      links.forEach((l) => { const on = l.dataset.nav === key; l.classList.toggle('is-active', on); if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
    }
  }, { rootMargin: '-35% 0px -55% 0px' });
  targets.forEach(([, el]) => io.observe(el));
}

initBarHeight();
initCopy();
initProgress();
initSpotlight();
initParallax();
initReveal();
initActiveNav();
initMarket();
initChainCheck();
window.addEventListener('pageshow', () => { if (reduced()) document.querySelectorAll('[data-reveal]').forEach((el) => { el.style.opacity = '1'; }); });
