// Live market board. Driven only by the market register record (read from the DOM the renderer wrote).
// The contract-address record is never consulted here.
import { icon } from '../icons.js';
import { usd, price, pct } from './format.js';
import { tweenNumber, playIn, reduced } from './motion.js';

const POLL_MS = 60000;
const TIMEOUT_MS = 12000;
const BASE_MS = 2000;
const TOP = 10;
const MAX_ADDRS = 30;

const STATUS = { loading: 'Syncing', live: 'Live', delayed: 'Delayed', offline: 'Offline', inert: 'pending' };

// ---------- network ----------
async function getJSON(url, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
}

const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };

export async function fetchBoard(cfg, signal) {
  const boosts = await getJSON(cfg.boosts, signal);
  const list = Array.isArray(boosts) ? boosts : [];
  const addrs = [];
  for (const b of list) {
    if (b && b.chainId === 'solana' && typeof b.tokenAddress === 'string' && !addrs.includes(b.tokenAddress)) addrs.push(b.tokenAddress);
    if (addrs.length >= MAX_ADDRS) break;
  }
  if (!addrs.length) throw new Error('no solana entries');
  const pairs = await getJSON(cfg.pairs.replace('{addresses}', addrs.map(encodeURIComponent).join(',')), signal);
  const want = new Set(addrs), byTok = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const a = p && p.baseToken && p.baseToken.address;
    if (!a || !want.has(a) || p.chainId !== 'solana') continue;
    const liq = num(p.liquidity && p.liquidity.usd) || 0;
    const t = byTok.get(a) || { address: a, symbol: '', name: '', price: null, change: null, volume: 0, liquidity: 0, image: null, pair: null, best: -1, hasVol: false, hasLiq: false };
    const v = num(p.volume && p.volume.h24);
    if (v != null) { t.volume += v; t.hasVol = true; }
    if (liq) { t.liquidity += liq; t.hasLiq = true; }
    if (liq >= t.best) {
      t.best = liq; t.symbol = String(p.baseToken.symbol || ''); t.name = String(p.baseToken.name || '');
      t.price = num(p.priceUsd); t.change = num(p.priceChange && p.priceChange.h24); t.pair = p.pairAddress || null;
    }
    const img = p.info && p.info.imageUrl;
    if (img && !t.image) t.image = img;
    byTok.set(a, t);
  }
  const out = [...byTok.values()].filter((t) => t.hasVol).sort((a, b) => b.volume - a.volume).slice(0, TOP);
  if (!out.length) throw new Error('no pairs');
  return out;
}

// ---------- small DOM helpers ----------
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const safeImg = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
const hue = (s) => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n % 6; };

function logo(t) {
  const wrap = h('span', 'logo');
  const letter = (t.symbol || t.name || '?').replace(/[^A-Za-z0-9]/, '').charAt(0) || '?';
  const tile = () => { const e = h('span', 'lt lt--' + hue(t.address), letter); e.setAttribute('aria-hidden', 'true'); return e; };
  const src = t.image && safeImg(t.image);
  if (!src) { wrap.append(tile()); return wrap; }
  const img = new Image();
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { img.replaceWith(tile()); }, { once: true });
  img.src = src;
  wrap.append(img);
  return wrap;
}
const arrow = () => { const s = document.createElement('span'); s.innerHTML = icon('up', 12); return s.firstChild; };
const dirOf = (c) => (c == null ? 'flat' : c > 0 ? 'up' : c < 0 ? 'down' : 'flat');
function paintChg(el, c) {
  const d = dirOf(c);
  el.classList.remove('is-up', 'is-down', 'is-flat'); el.classList.add('is-' + d);
  el.dataset.dir = d;
}

// ---------- UI ----------
function createUI(root) {
  const rowsEl = root.querySelector('[data-rows]');
  const board = root.querySelector('[data-board]');
  const msg = root.querySelector('[data-msg]');
  const rail = document.querySelector('[data-rail]');
  const ticker = document.querySelector('[data-ticker]');
  const track = document.querySelector('[data-ticker-track]');
  const pills = [...document.querySelectorAll('[data-pill]')];
  const view = { sort: 'volume', filter: 'all', mode: 'list' };
  let data = null;
  const rowMap = new Map(), tileMap = new Map(), cardMap = new Map();
  let grid = null, firstPaint = true, tickKey = '';

  const setPill = (state) => pills.forEach((p) => { p.dataset.state = state; const t = p.querySelector('[data-pill-text]'); if (t) t.textContent = STATUS[state]; });
  const stat = (name) => document.querySelector(`[data-stat="${name}"]`);

  function showMsg(html) { msg.hidden = false; msg.replaceChildren(); if (html) msg.append(...html); }
  function hideMsg() { msg.hidden = true; }

  function sorted() {
    const arr = [...data];
    const key = view.sort;
    arr.sort((a, b) => (key === 'change' ? (b.change ?? -Infinity) - (a.change ?? -Infinity) : key === 'liquidity' ? b.liquidity - a.liquidity : b.volume - a.volume));
    return arr.filter((t) => view.filter === 'all' || (view.filter === 'up' ? (t.change ?? 0) > 0 : (t.change ?? 0) < 0));
  }

  function buildRow(t) {
    const li = h('li', 'row spot'); li.dataset.addr = t.address; li.setAttribute('data-spot', '');
    const rank = h('span', 'row__rank');
    const name = h('span', 'row__name'); name.append(h('b', null, t.symbol || '?'), h('small', null, t.name || ''));
    const pc = h('span', 'row__pc');
    const pr = h('span', 'num row__price');
    const chg = h('span', 'chg row__chg'); const arr = arrow(); chg.append(arr, h('span', 'num'));
    pc.append(pr, chg);
    const meta = h('span', 'row__meta'); meta.append(h('span', 'num row__vol'), h('span', 'num row__liq'));
    const btn = h('button', 'copy'); btn.type = 'button'; btn.dataset.copy = ''; btn.dataset.copyValue = t.address;
    btn.setAttribute('aria-label', 'Copy address for ' + (t.symbol || 'token'));
    btn.innerHTML = icon('copy', 18, 'ic-copy') + icon('check', 18, 'ic-done');
    li.append(rank, logo(t), name, pc, meta, btn);
    return li;
  }
  function fillRow(li, t, i) {
    li.querySelector('.row__rank').textContent = String(i + 1);
    tweenNumber(li.querySelector('.row__price'), t.price, price);
    const chg = li.querySelector('.row__chg'); paintChg(chg, t.change);
    const svg = chg.firstChild;
    svg.style.visibility = dirOf(t.change) === 'flat' ? 'hidden' : 'visible';
    svg.style.transform = dirOf(t.change) === 'down' ? 'rotate(180deg)' : '';
    tweenNumber(chg.querySelector('.num'), t.change, pct);
    tweenNumber(li.querySelector('.row__vol'), t.volume, usd);
    tweenNumber(li.querySelector('.row__liq'), t.hasLiq ? t.liquidity : null, usd);
  }

  function buildTile(t) {
    const d = h('div', 'gtile spot'); d.dataset.addr = t.address; d.setAttribute('data-spot', '');
    const dot = h('span', 'gtile__dot'); const foot = h('span', 'gtile__foot'); const over = h('div', 'gtile__over');
    const btn = h('button', 'copy'); btn.type = 'button'; btn.dataset.copy = ''; btn.dataset.copyValue = t.address; btn.setAttribute('aria-label', 'Copy address for ' + (t.symbol || 'token'));
    btn.innerHTML = icon('copy', 18, 'ic-copy') + icon('check', 18, 'ic-done');
    over.append(h('span', 'gt-sym'), h('small', 'gt-price'), h('small', 'gt-vol'), btn);
    d.append(logo(t), dot, foot, over);
    return d;
  }
  function fillTile(d, t) {
    d.querySelector('.gtile__dot').classList.toggle('is-down', dirOf(t.change) === 'down');
    d.querySelector('.gtile__foot').textContent = usd(t.volume);
    d.querySelector('.gt-sym').textContent = t.symbol || '?';
    d.querySelector('.gt-price').textContent = price(t.price);
    d.querySelector('.gt-vol').textContent = 'Vol ' + usd(t.volume);
  }

  function renderBoard() {
    const list = sorted();
    // skeleton rows leave on the first real paint
    if (firstPaint) { rowsEl.querySelectorAll('.is-skel').forEach((n) => n.remove()); }
    if (!grid) { grid = h('div', 'tilegrid'); grid.dataset.grid = ''; board.append(grid); }
    const seen = new Set();
    const rowEls = [], tileEls = [];
    list.forEach((t, i) => {
      seen.add(t.address);
      let li = rowMap.get(t.address), tl = tileMap.get(t.address), isNew = false;
      if (!li) { li = buildRow(t); rowMap.set(t.address, li); isNew = true; }
      if (!tl) { tl = buildTile(t); tileMap.set(t.address, tl); }
      fillRow(li, t, i); fillTile(tl, t);
      rowEls.push(li); tileEls.push(tl);
      if (isNew) { li.style.opacity = '0'; playIn(li, i * 45, 16); }
    });
    for (const [a, el] of rowMap) if (!seen.has(a)) { el.remove(); rowMap.delete(a); }
    for (const [a, el] of tileMap) if (!seen.has(a)) { el.remove(); tileMap.delete(a); }
    rowsEl.replaceChildren(...rowEls); grid.replaceChildren(...tileEls);
    if (!list.length) showMsg([document.createTextNode('No row satisfies this filter at the moment.')]); else hideMsg();
    firstPaint = false;
  }

  function renderRail() {
    if (!rail) return;
    const sortedVol = [...data].sort((a, b) => b.volume - a.volume);
    if (!cardMap.size) rail.replaceChildren();
    sortedVol.forEach((t, i) => {
      let a = cardMap.get(t.address), isNew = false;
      if (!a) {
        isNew = true;
        a = h('a', 'vcard spot'); a.setAttribute('data-spot', ''); a.target = '_blank'; a.rel = 'noopener noreferrer';
        const media = logo(t);
        media.className = 'vcard__media';
        const img = media.querySelector('img');
        if (img) { img.className = 'vcard__img'; media.replaceWith(img); a.append(img); } else { const lt = media.querySelector('.lt'); a.append(lt); }
        a.append(h('span', 'vcard__fade'), h('span', 'vcard__rank'), h('span', 'vcard__tag', 'Boosted'));
        const foot = h('span', 'vcard__foot'); foot.append(h('span', 'vcard__sym'), h('span', 'chg vcard__chg'));
        a.append(foot);
        cardMap.set(t.address, a);
      }
      a.href = t.pair ? 'https://dexscreener.com/solana/' + encodeURIComponent(t.pair) : 'https://dexscreener.com/solana/' + encodeURIComponent(t.address);
      a.setAttribute('aria-label', (t.symbol || 'Token') + ', ' + pct(t.change) + ', opens details');
      a.querySelector('.vcard__rank').textContent = '#' + (i + 1);
      a.querySelector('.vcard__sym').textContent = t.symbol || '?';
      const c = a.querySelector('.vcard__chg'); c.textContent = pct(t.change); paintChg(c, t.change);
      if (isNew) { a.style.opacity = '0'; playIn(a, i * 60, 22); }
    });
    rail.replaceChildren(...sortedVol.map((t) => cardMap.get(t.address)));
  }

  function renderTicker() {
    if (!track) return;
    const key = data.map((t) => t.address).sort().join('|');
    const make = (t, hidden) => {
      const s = h('span', 'tick'); s.dataset.addr = t.address; if (hidden) s.setAttribute('aria-hidden', 'true');
      s.append(h('b', null, t.symbol || '?'), h('span', 'tick__p'), h('span', 'chg'));
      return s;
    };
    const fill = (s, t) => {
      s.querySelector('.tick__p').textContent = price(t.price);
      const c = s.querySelector('.chg'); c.textContent = pct(t.change); paintChg(c, t.change);
    };
    if (key !== tickKey) {
      tickKey = key;
      const order = [...data].sort((a, b) => b.volume - a.volume);
      const frag = document.createDocumentFragment();
      order.forEach((t) => frag.append(make(t, false)));
      order.forEach((t) => frag.append(make(t, true)));
      track.replaceChildren(frag);
      const half = [...track.children].slice(0, order.length).reduce((w, e) => w + e.getBoundingClientRect().width, 0) || 900;
      track.style.setProperty('--dur', Math.max(24, half / 55).toFixed(1) + 's');
    }
    const by = new Map(data.map((t) => [t.address, t]));
    track.querySelectorAll('.tick').forEach((s) => fill(s, by.get(s.dataset.addr)));
  }

  function renderStats() {
    const sum = (k) => data.reduce((a, t) => a + (t[k] || 0), 0);
    const changes = data.map((t) => t.change).filter((c) => c != null);
    const avg = changes.length ? changes.reduce((a, c) => a + c, 0) / changes.length : null;
    tweenNumber(stat('volume'), sum('volume'), usd);
    tweenNumber(stat('liquidity'), sum('liquidity'), usd);
    tweenNumber(stat('move'), avg, pct);
    tweenNumber(stat('tracked'), data.length, (n) => String(Math.round(n)));
  }

  return {
    setPill,
    hasData: () => !!data,
    inert() {
      setPill('inert');
      rowsEl.replaceChildren(); showMsg([h('b', null, '—'), document.createTextNode(' Market source pending.')]);
      if (track) track.replaceChildren();
    },
    loading() { setPill('loading'); },
    ok(list) { data = list; setPill('live'); renderBoard(); renderRail(); renderTicker(); renderStats(); },
    fail() {
      if (data) { setPill('delayed'); return; }
      setPill('offline');
      rowsEl.replaceChildren(); if (grid) grid.replaceChildren();
      showMsg([h('b', null, '—'), document.createTextNode(' The source stayed silent. Trying again with growing pauses.')]);
      document.querySelectorAll('[data-stat]').forEach((e) => { e.textContent = '—'; e._val = null; });
      if (track) track.replaceChildren();
      tickKey = ''; firstPaint = true;
    },
    setView(patch) {
      Object.assign(view, patch);
      board.dataset.view = view.mode;
      if (data) renderBoard();
    },
    view,
  };
}

// ---------- controller ----------
export function initMarket() {
  const root = document.querySelector('[data-market]');
  if (!root) return null;
  const ui = createUI(root);
  if (root.dataset.state !== 'live') { ui.inert(); return null; }
  const cfg = { boosts: root.dataset.boosts, pairs: root.dataset.pairs };

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-sort]'), flt = e.target.closest('[data-filter]'), vw = e.target.closest('[data-view]');
    if (tab) { root.querySelectorAll('[data-sort]').forEach((b) => { const on = b === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }); ui.setView({ sort: tab.dataset.sort }); }
    if (flt) { root.querySelectorAll('[data-filter]').forEach((b) => { const on = b === flt; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); ui.setView({ filter: flt.dataset.filter }); }
    if (vw) { root.querySelectorAll('[data-view]').forEach((b) => { const on = b === vw; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); ui.setView({ mode: vw.dataset.view }); }
  });

  let timer = 0, fails = 0, ctl = null, busy = false;
  const jitter = () => 0.8 + Math.random() * 0.4;
  const nextDelay = () => (fails === 0 ? POLL_MS : Math.min(POLL_MS, BASE_MS * Math.pow(2, fails - 1)) * jitter());

  async function cycle() {
    clearTimeout(timer);
    if (document.hidden || busy) return;
    busy = true; ctl = new AbortController();
    if (!ui.hasData()) ui.loading();
    try {
      const list = await fetchBoard(cfg, ctl.signal);
      fails = 0; ui.ok(list);
    } catch (err) {
      if (ctl.signal.aborted && document.hidden) { busy = false; return; }
      fails += 1; ui.fail();
    }
    busy = false; ctl = null;
    if (!document.hidden) timer = setTimeout(cycle, nextDelay());
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); if (ctl) ctl.abort(); busy = false; }
    else { clearTimeout(timer); cycle(); }
  });
  cycle();
  return { cycle };
}
