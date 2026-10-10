// Brand asset pipeline. Source: brand/LOGO REELIS PNG...png (RGBA, colour type 6, pure-black transparent regions).
// Resizes run on premultiplied colour so the black under alpha 0 never bleeds into edges.
import fs from 'node:fs';
import sharp from 'sharp';

const SRC = 'brand/LOGO REELIS PNG...png';
const BG = [0x07, 0x01, 0x0b]; // tokens.css --ink, sampled from reference slide 1 at (1084,0)
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const BBOX = { x0: 584, y0: 565, x1: 1418, y1: 1433 }; // measured by scripts/palette-bg.mjs
const side = Math.max(BBOX.x1 - BBOX.x0, BBOX.y1 - BBOX.y0) + 1;
const cx = (BBOX.x0 + BBOX.x1) / 2, cy = (BBOX.y0 + BBOX.y1) / 2;
const ox = Math.round(cx - side / 2), oy = Math.round(cy - side / 2);

function resizePremult(out, pad = 0) {
  const inner = out * (1 - 2 * pad), off = out * pad;
  const buf = Buffer.alloc(out * out * 4);
  const scale = side / inner;
  for (let y = 0; y < out; y++) for (let x = 0; x < out; x++) {
    const sx0 = (x - off) * scale, sx1 = (x + 1 - off) * scale, sy0 = (y - off) * scale, sy1 = (y + 1 - off) * scale;
    let r = 0, g = 0, b = 0, a = 0;
    const xa = Math.max(0, Math.floor(sx0)), xb = Math.min(side - 1, Math.ceil(sx1) - 1);
    const ya = Math.max(0, Math.floor(sy0)), yb = Math.min(side - 1, Math.ceil(sy1) - 1);
    const area = (sx1 - sx0) * (sy1 - sy0);
    for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) {
      const wx = Math.min(xx + 1, sx1) - Math.max(xx, sx0), wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0);
      if (wx <= 0 || wy <= 0) continue;
      const w = wx * wy; const gx = ox + xx, gy = oy + yy;
      let pa = 0, pr = 0, pg = 0, pb = 0;
      if (gx >= 0 && gy >= 0 && gx < W && gy < H) { const i = (gy * W + gx) * 4; pa = data[i + 3] / 255; pr = data[i] * pa; pg = data[i + 1] * pa; pb = data[i + 2] * pa; }
      r += pr * w; g += pg * w; b += pb * w; a += pa * w;
    }
    const o = (y * out + x) * 4; const A = a / area;
    buf[o] = A > 0 ? Math.min(255, Math.round(r / area / A)) : 0;
    buf[o + 1] = A > 0 ? Math.min(255, Math.round(g / area / A)) : 0;
    buf[o + 2] = A > 0 ? Math.min(255, Math.round(b / area / A)) : 0;
    buf[o + 3] = Math.round(Math.min(1, A) * 255);
  }
  return buf;
}
const raw = (b, s) => sharp(b, { raw: { width: s, height: s, channels: 4 } });
fs.mkdirSync('public/brand', { recursive: true });

for (const s of [512, 256]) await raw(resizePremult(s, 0.04), s).png({ compressionLevel: 9 }).toFile(`public/brand/logo-${s}.png`);
await raw(resizePremult(512, 0.04), 512).webp({ quality: 92, alphaQuality: 100 }).toFile('public/brand/logo-512.webp');
await raw(resizePremult(256, 0.04), 256).webp({ quality: 92, alphaQuality: 100 }).toFile('public/brand/logo-256.webp');
await raw(resizePremult(32, 0.03), 32).png().toFile('public/favicon-32.png');
await raw(resizePremult(192, 0.12), 192).png().toFile('public/brand/icon-192.png');
await raw(resizePremult(512, 0.12), 512).png().toFile('public/brand/icon-512.png');
const ap = await raw(resizePremult(180, 0.14), 180).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 3, background: { r: BG[0], g: BG[1], b: BG[2] } } }).composite([{ input: ap }]).png().toFile('public/apple-touch-icon.png');
// social card 1200x630: glows sampled from reference slide 1 (#280561 at 352,60 and #db7a1c at 1384,896)
const glow = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="a" cx="18%" cy="8%" r="55%"><stop offset="0" stop-color="#280561"/><stop offset="1" stop-color="#280561" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="92%" cy="104%" r="55%"><stop offset="0" stop-color="#db7a1c" stop-opacity="0.75"/><stop offset="1" stop-color="#db7a1c" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="#07010b"/><rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/></svg>';
const lg = await raw(resizePremult(430, 0.02), 430).png().toBuffer();
await sharp(Buffer.from(glow)).composite([{ input: lg, left: 385, top: 100 }]).png({ compressionLevel: 9 }).toFile('public/brand/og.png');

// ---------- favicon trace ----------
const G = 435;
const hi = resizePremult(G, 0.03);
const alpha = new Float32Array(G * G), white = new Float32Array(G * G);
for (let i = 0; i < G * G; i++) {
  const a = hi[i * 4 + 3] / 255; alpha[i] = a;
  white[i] = a * (Math.min(hi[i * 4], hi[i * 4 + 1], hi[i * 4 + 2]) > 205 ? 1 : 0);
}
function contours(f, n, level = 0.5) {
  const segs = new Map(); const key = (x, y) => x.toFixed(3) + ',' + y.toFixed(3);
  const add = (a, b) => {
    const ka = key(a[0], a[1]), kb = key(b[0], b[1]);
    if (!segs.has(ka)) segs.set(ka, []); if (!segs.has(kb)) segs.set(kb, []);
    segs.get(ka).push({ kt: kb }); segs.get(kb).push({ kt: ka });
  };
  const lerp = (x0, y0, v0, x1, y1, v1) => { const t = (level - v0) / (v1 - v0); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; };
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const v = [f[y * n + x], f[y * n + x + 1], f[(y + 1) * n + x + 1], f[(y + 1) * n + x]];
    const c = (v[0] >= level ? 1 : 0) | (v[1] >= level ? 2 : 0) | (v[2] >= level ? 4 : 0) | (v[3] >= level ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => lerp(x, y, v[0], x + 1, y, v[1]), R = () => lerp(x + 1, y, v[1], x + 1, y + 1, v[2]);
    const B = () => lerp(x, y + 1, v[3], x + 1, y + 1, v[2]), L = () => lerp(x, y, v[0], x, y + 1, v[3]);
    const m = { 1: [L, T], 2: [T, R], 3: [L, R], 4: [R, B], 6: [T, B], 7: [L, B], 8: [L, B], 9: [T, B], 11: [R, B], 12: [L, R], 13: [T, R], 14: [L, T] };
    if (c === 5) { add(L(), T()); add(R(), B()); } else if (c === 10) { add(T(), R()); add(L(), B()); } else add(m[c][0](), m[c][1]());
  }
  const loops = []; const used = new Set();
  for (const [k0] of segs) {
    if (used.has(k0)) continue;
    const pts = []; let k = k0, prev = null;
    while (k && !used.has(k)) {
      used.add(k); const [px, py] = k.split(',').map(Number); pts.push([px, py]);
      const nb = segs.get(k).filter(s => s.kt !== prev); prev = k; k = nb.length ? nb[0].kt : null;
    }
    if (pts.length > 8) loops.push(pts);
  }
  return loops;
}
function rdp(p, eps) {
  if (p.length < 3) return p;
  let dm = 0, idx = 0; const a = p[0], b = p[p.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * p[i][0] - dx * p[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > dm) { dm = d; idx = i; } }
  if (dm > eps) { const l = rdp(p.slice(0, idx + 1), eps), r = rdp(p.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
const VB = 32, PADV = 0, sc = (VB - 2 * PADV) / G;
const tx = (pt) => [pt[0] * sc + PADV, pt[1] * sc + PADV].map(v => +v.toFixed(2));
function simplifyClosed(loop, eps) {
  let fi = 0, fd = -1;
  loop.forEach((p, i) => { const d = Math.hypot(p[0] - loop[0][0], p[1] - loop[0][1]); if (d > fd) { fd = d; fi = i; } });
  const a = loop.slice(0, fi + 1), b = loop.slice(fi).concat([loop[0]]);
  return rdp(a, eps).slice(0, -1).concat(rdp(b, eps).slice(0, -1));
}
const toPath = (loop) => { const s = simplifyClosed(loop, 0.55).map(tx); return 'M' + s.map(p => p.join(' ')).join('L') + 'Z'; };

const label = new Int32Array(G * G); let nl = 0; const comps = [];
for (let s = 0; s < G * G; s++) {
  if (alpha[s] < 0.5 || label[s]) continue; nl++; const st = [s]; label[s] = nl; const px = [];
  while (st.length) {
    const i = st.pop(); px.push(i); const x = i % G, y = (i / G) | 0;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + d[0], ny = y + d[1]; if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue; const j = ny * G + nx; if (alpha[j] >= 0.5 && !label[j]) { label[j] = nl; st.push(j); } }
  }
  if (px.length > 200) comps.push(px);
}
const hx = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
let defs = '', body = '';
comps.forEach((px, n) => {
  const nonWhite = px.filter(i => white[i] < 0.5);
  const sorted = nonWhite.slice().sort((a, b) => (a % G) - (b % G));
  const k = Math.max(6, Math.floor(sorted.length * 0.06));
  const avg = (arr) => { let r = 0, g = 0, b = 0, X = 0, Y = 0; arr.forEach(i => { r += hi[i * 4]; g += hi[i * 4 + 1]; b += hi[i * 4 + 2]; X += i % G; Y += (i / G) | 0; }); const m = arr.length; return { c: [r / m, g / m, b / m], p: [X / m, Y / m] }; };
  const lo = avg(sorted.slice(0, k)), up = avg(sorted.slice(-k));
  const p1 = tx(lo.p), p2 = tx(up.p);
  const mask = new Float32Array(G * G); px.forEach(i => { mask[i] = 1; });
  const d = contours(mask, G).map(toPath).join('');
  defs += '<linearGradient id="g' + n + '" gradientUnits="userSpaceOnUse" x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '"><stop offset="0" stop-color="' + hx(...lo.c) + '"/><stop offset="1" stop-color="' + hx(...up.c) + '"/></linearGradient>';
  body += '<path fill="url(#g' + n + ')" d="' + d + '"/>';
});
const wl = contours(white, G).map(toPath).join('');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>' + defs + '</defs>' + body + '<path fill="' + hx(254, 253, 253) + '" d="' + wl + '"/></svg>';
if (svg.includes('--')) throw new Error('favicon contains a double hyphen');
fs.writeFileSync('public/favicon.svg', svg);
console.log('components', comps.length, 'favicon bytes', svg.length);
