// Gate runner. `npm run gates` exits 0 only when every gate passes.
// Mutation anchors never assume a record's current state: they read it, then flip it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { build } from 'vite';
import { launch } from './lib/browser.mjs';
import { collectCopy, compare } from './lib/copycheck.mjs';
import { validateRegister, stripDates, view, mutate, isAddressShaped, BASE58_ADDRESS, EVM_ADDRESS } from '../src/register/register.js';
import { renderApp } from '../src/render.js';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const results = [];
const gate = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }); console.log('  pass  ' + name + (detail ? '  (' + detail + ')' : '')); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// ---------- helpers ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(buf) {
  let n = BigInt('0x' + buf.toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  return s;
}
const randomAddress = () => { let a; do { a = base58(crypto.randomBytes(32)); } while (!BASE58_ADDRESS.test(a)); return a; };
const walk = (dir, out = []) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p, out); else out.push(p); } return out; };
const TEXT = /\.(html|js|css|json|webmanifest|svg|txt|md|mjs|cjs)$|(^|[\\/])_headers$|LICENSE$/;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

const rawReg = JSON.parse(read('src/register/register.json'));
const reg = stripDates(rawReg);
const distFiles = () => walk(DIST);
const distText = () => distFiles().filter((f) => TEXT.test(f)).map((f) => [rel(f), read(f)]);
const srcFiles = () => walk(path.join(ROOT, 'src')).concat([path.join(ROOT, 'index.html')]);

// the address scanner: every address-shaped string must equal a stated register value
export function scanAddresses(text, allowed) {
  const hits = [];
  for (const m of text.matchAll(/[1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40}/g)) {
    const s = m[0];
    if (!isAddressShaped(s)) continue;
    if (!allowed.has(s)) hits.push(s);
  }
  return hits;
}
const statedAddresses = (r) => new Set(Object.values(r.records).filter((x) => x.state === 'stated' && typeof x.value === 'string' && isAddressShaped(x.value)).map((x) => x.value));

// ---------- static server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

// ---------- network fixtures ----------
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fixtureAddrs = Array.from({ length: 12 }, (_, i) => base58(crypto.createHash('sha256').update('fx' + i).digest()));
function fixtures(round = 0) {
  const boosts = fixtureAddrs.map((a, i) => ({ url: 'x', chainId: i === 11 ? 'ethereum' : 'solana', tokenAddress: a, totalAmount: 10 }));
  boosts.push({ chainId: 'solana', tokenAddress: fixtureAddrs[0] });
  const pairs = [];
  fixtureAddrs.slice(0, 11).forEach((a, i) => {
    const mk = (suffix, vol, liq) => ({
      chainId: 'solana', pairAddress: 'pair' + i + suffix, baseToken: { address: a, name: 'Token ' + i, symbol: 'TK' + i },
      priceUsd: String((i + 1) * 0.0000123 * (1 + round * 0.05)), priceChange: { h24: (i % 2 ? -1 : 1) * (i + 1) * 3.3 + round },
      volume: { h24: vol }, liquidity: { usd: liq },
      info: i === 0 ? { imageUrl: 'https://img.test/ok.png' } : i === 2 ? { imageUrl: 'https://bad.test/broken.png' } : undefined,
    });
    pairs.push(mk('a', (12 - i) * 100000 * (1 + round * 0.1), 50000 + i * 1000), mk('b', 1000, 100));
  });
  return { boosts, pairs };
}
async function mockNet(page, state) {
  state.log = []; await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (b, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (u.includes('api.dexscreener.com')) {
      state.log.push({ t: Date.now(), u });
      if (state.fail) return req.respond({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'no' });
      const f = fixtures(state.round || 0);
      const go = () => json(u.includes('token-boosts') ? f.boosts : f.pairs);
      return state.delay && u.includes('token-boosts') ? setTimeout(go, state.delay) : go();
    }
    if (u.includes('solana-rpc.publicnode.com')) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      state.rpc = (state.rpc || 0) + 1;
      return json({ jsonrpc: '2.0', id: 1, result: { value: { data: { parsed: { type: 'mint' } } } } });
    }
    if (u.startsWith('https://img.test/')) return req.respond({ status: 200, contentType: 'image/png', body: PNG1 });
    if (u.includes('bad.test')) return req.abort();
    if (u.startsWith('http://127.0.0.1')) return req.continue();
    return req.abort();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORTS = [360, 390, 430, 1366, 1440];
const heightFor = (w) => (w < 700 ? 800 : 900);
async function openPage(browser, url, w, opts = {}) {
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write']);
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: heightFor(w), deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  const state = opts.state || {}; await mockNet(page, state);
  if (opts.reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (opts.fast) await page.evaluateOnNewDocument(() => { const st = window.setTimeout; window.__d = []; window.setTimeout = (f, d, ...a) => { window.__d.push(d); return st(f, d === 60000 ? d / 60 : !Number.isInteger(d) && d >= 1500 ? d / 20 : d, ...a); }; });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, state, errors };
}
const rowsReady = (page) => page.waitForFunction(() => document.querySelectorAll('[data-rows] .row:not(.is-skel)').length === 10, { timeout: 15000 });

// =====================================================================
console.log('\nSTATIC GATES');
const refNgrams = JSON.parse(read('scripts/data/reference-ngrams.json'));

await gate('register: schema valid, inert records carry no value or url', () => { const e = validateRegister(rawReg); ok(!e.length, e.join('; ')); return Object.keys(rawReg.records).length + ' records'; });
await gate('register: every external fact is one record with a known state', () => { const need = ['chain', 'site', 'market', 'ca', 'x', 'github']; for (const k of need) ok(rawReg.records[k], 'missing ' + k); return need.join(','); });
await gate('register: contract address is absent or a valid mint address, never a placeholder', () => { const r = rawReg.records.ca; if (r.state === 'stated') ok(BASE58_ADDRESS.test(r.value), 'invalid'); else ok(!('value' in r) && !('url' in r), 'inert CA carries data'); return r.state; });
await gate('dist: exists with index.html, assets, favicon, _headers', () => { for (const f of ['index.html', 'favicon.svg', '_headers', 'manifest.webmanifest']) ok(fs.existsSync(path.join(DIST, f)), 'missing dist/' + f); ok(fs.existsSync(path.join(DIST, 'assets')), 'no assets'); });
await gate('dist: holds no repo docs, sources, or register data', () => {
  const names = distFiles().map(rel);
  for (const bad of [/README/i, /LICENSE/i, /whitepaper/i, /register\.json/i, /\.mjs$/, /brand\/LOGO REELIS/, /reference\//i]) ok(!names.some((n) => bad.test(n)), 'dist contains ' + names.find((n) => bad.test(n)));
  for (const [n, t] of distText()) ok(!/recordedAt/.test(t), n + ' leaks register metadata');
});
await gate('hygiene: no CLAUDE.md, no .claude/, no git state touched', () => {
  const all = walk(ROOT).filter((f) => !f.includes('node_modules'));
  ok(!all.some((f) => /CLAUDE\.md$/i.test(f)), 'CLAUDE.md present');
  ok(!fs.existsSync(path.join(ROOT, '.claude')), '.claude/ present');
  ok(!fs.existsSync(path.join(ROOT, '.git')), 'git state present');
});
await gate('hygiene: no AI attribution anywhere in the project', () => {
  const words = ['cl' + 'aude', 'anthr' + 'opic', 'chat' + 'gpt', 'co-auth' + 'ored', 'gener' + 'ated (by|with)', 'artificial intel' + 'ligence', '\\bA' + 'I\\b', '\\bL' + 'LM\\b', 'copi' + 'lot'];
  const rx = new RegExp(words.join('|'), 'i');
  const bad = [];
  for (const f of walk(ROOT)) {
    const r = rel(f);
    if (r.startsWith('node_modules') || r.startsWith('scripts/out') || r === 'package-lock.json' || r === 'scripts/gates.mjs' || !TEXT.test(f)) continue;
    const m = read(f).match(rx); if (m) bad.push(r + ': ' + m[0]);
  }
  ok(!bad.length, bad.join('\n'));
});
await gate('no dates: zero visible dates, clocks, years or "as of" wording in dist and src', () => {
  const strip = (t) => t.replace(/ d="[^"]*"/g, '').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/(?:srcset|href|src|viewBox|points|style)="[^"]*"/g, '');
  const rxs = [/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(19|20)\d{2}\b/, /\b(as of|checked|last updated|updated|verified on|ago)\b/i];
  const bad = [];
  for (const [n, t] of distText()) {
    if (!/\.(html|css|webmanifest|txt)$/.test(n) && !/_headers/.test(n)) {
      const m = t.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b|\bas of\b|\blast updated\b/i); if (m) bad.push(n + ': ' + m[0]); continue;
    }
    const s = n.endsWith('.html') ? strip(t) : t.replace(/url\([^)]*\)/g, '');
    for (const rx of rxs) { const m = s.match(rx); if (m) bad.push(n + ': ' + m[0]); }
  }
  for (const f of srcFiles().filter((f) => /\.(js|css|html)$/.test(f))) { const t = read(f); const m = t.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b|\bas of\b|\blast updated\b|\bchecked\b/i); if (m) bad.push(rel(f) + ': ' + m[0]); }
  ok(!bad.length, bad.join('\n'));
});
await gate('palette: no colour literals outside src/styles/tokens.css', () => {
  const bad = [];
  for (const f of srcFiles()) {
    if (f.endsWith('tokens.css') || !/\.(css|js|html)$/.test(f)) continue;
    const t = read(f);
    for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) { if (/^#[0-9a-fA-F]{3,8}$/.test(m[0]) && !/^#[a-z]+$/i.test(m[0]) && /\d/.test(m[0]) || /^#[0-9a-fA-F]{6}$/.test(m[0])) bad.push(rel(f) + ': ' + m[0]); }
    for (const m of t.matchAll(/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g)) bad.push(rel(f) + ': ' + m[0]);
    for (const m of t.matchAll(/:\s*(red|blue|green|black|white|yellow|orange|purple|pink|gray|grey)\b\s*[;}]/g)) bad.push(rel(f) + ': ' + m[0]);
  }
  ok(!bad.length, bad.join('\n'));
});
await gate('palette: every token hex is a real pixel at its recorded coordinate', async () => {
  const css = read('src/styles/tokens.css');
  const header = css.slice(0, css.indexOf(':root'));
  const logo = await sharp('brand/LOGO REELIS PNG...png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const slide = await sharp('reference/REELIS 1.jpg.jpeg').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (img, x, y) => { const i = (y * img.info.width + x) * 4; return '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join(''); };
  let n = 0, src = null; const bad = [];
  for (const line of header.split('\n')) {
    if (/Logo \(/.test(line)) src = logo; if (/Reference slide 1/.test(line)) src = slide;
    const m = line.match(/(#[0-9a-f]{6})\s+pixel \((\d+), (\d+)\)/);
    if (m && src) { n++; if (px(src, +m[2], +m[3]) !== m[1]) bad.push(line.trim() + ' actual ' + px(src, +m[2], +m[3])); }
  }
  const declared = [...css.matchAll(/--[a-z]+:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);
  for (const d of declared) if (!header.includes(d)) bad.push('token ' + d + ' has no provenance line');
  ok(n >= 14 && !bad.length, bad.join('\n') || 'only ' + n + ' provenance lines');
  return n + ' provenance pixels verified';
});
await gate('css: no ch units anywhere', () => { const bad = []; for (const f of srcFiles().filter((f) => f.endsWith('.css'))) { const m = read(f).match(/\d(\.\d+)?ch\b/); if (m) bad.push(rel(f) + ': ' + m[0]); } for (const [n, t] of distText().filter(([n]) => n.endsWith('.css'))) { const m = t.match(/[\d.]ch\b/); if (m) bad.push(n + ': ' + m[0]); } ok(!bad.length, bad.join(', ')); });
await gate('favicon: SVG 32x32, no comments or double hyphens, matches logo silhouette', async () => {
  const s = read('public/favicon.svg');
  ok(/width="32"/.test(s) && /height="32"/.test(s) && /viewBox="0 0 32 32"/.test(s), 'not 32x32');
  ok(!s.includes('--') && !s.includes('<!--') && !s.includes('<?xml'), 'comment or double hyphen');
  ok(read(path.join(DIST, 'index.html')).includes('rel="icon" type="image/svg+xml"'), 'not linked');
  const a = await sharp(Buffer.from(s), { density: 576 }).resize(256, 256).ensureAlpha().raw().toBuffer();
  const b = await sharp('public/brand/logo-256.png').ensureAlpha().raw().toBuffer();
  let inter = 0, uni = 0; for (let i = 3; i < a.length; i += 4) { const x = a[i] > 128, y = b[i] > 128; if (x && y) inter++; if (x || y) uni++; }
  const iou = inter / uni; ok(iou > 0.85, 'silhouette IoU ' + iou.toFixed(3)); return 'IoU ' + iou.toFixed(3);
});
await gate('assets: premultiplied resize leaves no dark fringe on semi-transparent edges', async () => {
  const meta = JSON.parse(read('scripts/data/assets.json')).find((r) => r.file.endsWith('PNG...png'));
  ok(meta.ihdr.colourType === 6 && meta.pureBlackNonOpaque > 0, 'source assumptions changed');
  const frac = async (f) => { const { data } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let n = 0, dark = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 24 && data[i + 3] < 232) { n++; if (Math.max(data[i], data[i + 1], data[i + 2]) < 64) dark++; } return { n, f: dark / n }; };
  const src = await frac('brand/LOGO REELIS PNG...png'); let worst = 0, edges = 0;
  for (const f of ['logo-256.png', 'logo-512.png']) { const r = await frac('public/brand/' + f); edges += r.n; worst = Math.max(worst, r.f); }
  ok(edges > 100 && worst < 0.005 && worst < src.f / 2, 'dark edge fraction ' + worst.toFixed(4) + ' vs source ' + src.f.toFixed(4));
  return 'dark edge fraction ' + worst.toFixed(4) + ' (source ' + src.f.toFixed(4) + ')';
});
await gate('motion: reduced-motion CSS and JS both present, spring solver and shared loop in place', () => {
  const css = read('src/styles/main.css'); const js = read('src/js/motion.js');
  ok(/@media \(prefers-reduced-motion: reduce\)/.test(css) && /animation: none !important/.test(css), 'css fallback missing');
  ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(js) && /stiffness/.test(js) && /damping/.test(js), 'js solver or media query missing');
});
await gate('social icons: official X mark and GitHub octicon, both rendered, no href while unstated', () => {
  const html = read(path.join(DIST, 'index.html'));
  ok(html.includes('M18.244 2.25h3.308l-7.227 8.26') && html.includes('M8 0C3.58 0 0 3.58 0 8c0 3.54'), 'official paths missing');
  for (const id of ['x', 'github']) {
    const m = html.match(new RegExp('<(a|span)[^>]*data-social="' + id + '"[^>]*>')); ok(m, id + ' icon absent');
    const stated = rawReg.records[id].state === 'stated';
    ok(stated ? m[1] === 'a' && /href="https:/.test(m[0]) : m[1] === 'span' && !/href=/.test(m[0]), id + ' wrong branch rendered');
  }
});
await gate('address scanner: dist holds only stated registry addresses (CA exempt)', () => {
  const allowed = statedAddresses(reg); const bad = [];
  for (const [n, t] of distText()) for (const h of scanAddresses(t, allowed)) bad.push(n + ': ' + h);
  ok(!bad.length, bad.join('\n')); return allowed.size + ' stated address(es) in registry';
});
await gate('address scanner: flags a rogue address, never blanket-rejects 0x hex', () => {
  const rogue = randomAddress(), evm = '0x' + crypto.randomBytes(20).toString('hex');
  ok(scanAddresses('x ' + rogue + ' y', new Set()).includes(rogue), 'rogue base58 not flagged');
  ok(scanAddresses('x ' + evm + ' y', new Set()).includes(evm), 'rogue 0x address not flagged');
  ok(!scanAddresses('x ' + evm + ' y', new Set([evm])).length, 'stated 0x address rejected');
  ok(!scanAddresses('colour 0x1F, mask 0xDEADBEEF, id 0xff00ff', new Set()).length, 'short 0x hex wrongly rejected');
  ok(!scanAddresses('plain prose with no address at all', new Set()).length, 'prose flagged');
});
await gate('copy: zero words and zero 2-grams shared with the reference corpus', () => {
  const r = compare(collectCopy('.'), refNgrams);
  ok(!r.badWords.size && !r.badBigrams.size, 'words: ' + [...r.badWords.keys()].join(',') + ' | 2-grams: ' + [...r.badBigrams.keys()].join(','));
  return refNgrams.words.length + ' reference words, ' + refNgrams.bigrams.length + ' 2-grams compared';
});
await gate('docs: README, whitepaper and LICENSE at root, none in dist', () => {
  const rd = read('README.md'), wp = read('docs/whitepaper.md'), lic = read('LICENSE');
  ok(/Reelis/.test(rd) && /Solana/.test(rd) && /img\.shields\.io/.test(rd) && /## Overview/.test(rd) && /## Features/.test(rd) && /## Links/.test(rd) && /CA/.test(rd), 'README incomplete');
  ok(/Vision/i.test(wp) && /Mission/i.test(wp) && /Tokenomics/i.test(wp) && /Roadmap/i.test(wp) && /Team/i.test(wp), 'whitepaper incomplete');
  ok(/MIT License/.test(lic) && /Copyright \(c\) 2026 Reelis/.test(lic), 'LICENSE not MIT / Reelis, 2026');
  const phases = (wp.match(/^### Phase \d/gm) || []).length; ok(phases >= 3 && phases <= 4, 'phases: ' + phases);
});

// ---------- mutation harness: both branches, read-then-flip ----------
console.log('\nBRANCH GATES (register mutation, no assumed state)');
const makeStated = {
  ca: () => ({ value: randomAddress() }),
  x: () => ({ url: 'https://x.com/reelis_test' }),
  github: () => ({ url: 'https://github.com/reelis-test' }),
  market: () => ({ value: 'DexScreener', boostsUrl: 'https://api.dexscreener.com/token-boosts/top/v1', pairsUrl: 'https://api.dexscreener.com/tokens/v1/solana/{addresses}' }),
};
const sectionOf = (html, cls) => { const m = html.match(new RegExp('<section class="' + cls + '"[\\s\\S]*?</section>')); return m ? m[0] : ''; };
const branches = (id) => { const cur = view(reg); const flipped = view(mutate(reg, id, makeStated[id])); return cur[id].live ? { live: cur, inert: flipped } : { live: flipped, inert: cur }; };

await gate('branch ca: both branches render from the same code path', () => {
  const { live, inert } = branches('ca'); const L = renderApp(live), I = renderApp(inert);
  ok(live.ca.live && !inert.ca.live, 'flip did not produce two branches');
  ok(L.includes('data-copy-value="' + live.ca.value + '"') && L.includes('class="ca__value"'.replace('class="ca__value"', 'class="ca__value" data-ca-value')) && L.includes('aria-label="Copy token mint address"'), 'live slot incomplete');
  ok(L.split(live.ca.value).length - 1 >= 2, 'full address not shown');
  ok(I.includes('class="ca is-inert"') && !/data-copy-value="[1-9A-HJ-NP-Za-km-z]{32,}/.test(I) && /pending/.test(sectionOf(I, 'zz') + I.match(/<div class="ca is-inert"[\s\S]*?<\/div>/)[0]), 'inert slot wrong');
  ok(!I.match(/<div class="ca is-inert"[\s\S]*?<\/div>/)[0].match(/href=|data-copy/), 'inert slot carries link or copy hook');
});
await gate('branch ca: address scanner passes live branch, rejects it against an empty registry', () => {
  const { live } = branches('ca'); const L = renderApp(live);
  ok(!scanAddresses(L, new Set([live.ca.value])).length, 'stated CA flagged');
  ok(scanAddresses(L, new Set()).includes(live.ca.value), 'scanner blind to CA when unregistered');
});
for (const id of ['x', 'github']) {
  await gate(`branch ${id}: icon present in both branches, href only when stated, handle derived`, () => {
    const { live, inert } = branches(id); const L = renderApp(live), I = renderApp(inert);
    const tag = (h) => h.match(new RegExp('<(a|span)[^>]*data-social="' + id + '"[^>]*>'))[0];
    const lt = tag(L), it = tag(I);
    ok(lt.startsWith('<a') && lt.includes('href="' + live[id].url + '"') && lt.includes(live[id].handle) && /rel="noopener noreferrer"/.test(lt), 'live icon wrong: ' + lt);
    ok(it.startsWith('<span') && !/href|http/.test(it) && /pending/.test(it), 'inert icon wrong: ' + it);
    ok(L.includes('data-social="' + id + '"') && I.includes('data-social="' + id + '"'), 'icon missing in a branch');
  });
}
await gate('branch market: CA state has zero effect on the market section', () => {
  const a = view(reg), b = view(mutate(reg, 'ca', makeStated.ca));
  const A = renderApp(a), B = renderApp(b);
  ok(sectionOf(A, 'market') && sectionOf(A, 'market') === sectionOf(B, 'market'), 'market markup differs when CA flips');
  ok(A.match(/<div class="ticker"[\s\S]*?<\/div><\/div>/)[0] === B.match(/<div class="ticker"[\s\S]*?<\/div><\/div>/)[0], 'ticker differs when CA flips');
  const src = read('src/js/market.js'); ok(!/\bca\b|data-ca|\.ca\b|contract/i.test(src.replace(/\/\/.*$/gm, '')), 'market.js references the CA');
});
await gate('branch market: follows its own record only (both branches)', () => {
  const { live, inert } = branches('market'); const L = sectionOf(renderApp(live), 'market'), I = sectionOf(renderApp(inert), 'market');
  ok(/data-state="live"/.test(L) && /data-boosts="https:/.test(L) && /data-pairs="https:/.test(L), 'live market wrong');
  ok(/data-state="inert"/.test(I) && !/data-boosts|data-pairs|https?:/.test(I.match(/<section[^>]*>/)[0]), 'inert market leaks urls');
});
await gate('branch inert records: unstated record shows label and "pending" only, no value, no url', () => {
  const html = renderApp(view(reg));
  for (const [id, r] of Object.entries(rawReg.records)) if (r.state !== 'stated') {
    const row = html.match(new RegExp('<li class="fact is-inert"><span class="fact__k">' + r.label.replace(/[()]/g, '') + '[^<]*</span><span class="fact__v"><span class="fact__pend">pending</span></span></li>'));
    if (id !== 'ca' && id !== 'buy') ok(row, id + ' inert row malformed');
  }
  ok(!/pending[^<]*\d{4}/.test(html), 'pending carries a date');
});

// ---------- runtime gates ----------
console.log('\nRUNTIME GATES (headless Edge, mocked network)');
const browser = await launch();
const { srv, url } = await serve(DIST);

for (const w of VIEWPORTS) {
  await gate(`viewport ${w}: no overflow, tap targets 44x44, CA and socials pinned top, no dates in DOM`, async () => {
    const { page, errors } = await openPage(browser, url, w, { state: {} });
    await rowsReady(page); await sleep(900);
    const r = await page.evaluate((W) => {
      const out = { overflow: Math.max(document.documentElement.scrollWidth, innerWidth) - W, small: [], dates: [] };
      for (const el of document.querySelectorAll('a[href],button,[role=button],input,select,textarea')) {
        const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
        if (b.width < 43.5 || b.height < 43.5) out.small.push((el.className || el.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      const soc = [...document.querySelectorAll('[data-social]')].map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.social, top: b.top, right: b.right, left: b.left, w: b.width, h: b.height, vis: getComputedStyle(e).display !== 'none' }; });
      out.social = soc; const ca = document.querySelector('#ca').getBoundingClientRect(); out.ca = { top: ca.top, bottom: ca.bottom, left: ca.left, right: ca.right };
      const texts = [document.body.innerText, ...[...document.querySelectorAll('[aria-label],[title],[alt]')].map((e) => (e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + (e.alt || ''))].join('\n');
      const rx = [/\b(19|20)\d{2}\b/, /\b\d{1,2}:\d{2}\b/, /\b(as of|checked|updated|ago)\b/i, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i];
      for (const x of rx) { const m = texts.match(x); if (m) out.dates.push(m[0]); }
      out.caFont = parseFloat(getComputedStyle(document.querySelector('.ca__value, .ca__pending')).fontSize);
      return out;
    }, w);
    ok(!errors.length, 'page errors: ' + errors.join('; '));
    ok(r.overflow <= 0, 'horizontal overflow ' + r.overflow + 'px');
    ok(!r.small.length, 'tap targets under 44px: ' + [...new Set(r.small)].join(', '));
    ok(r.social.length === 2 && r.social.every((s) => s.vis && s.w >= 43.5 && s.h >= 43.5 && s.top < 120 && s.right <= w + 0.5 && s.right > w * 0.5), 'socials not both visible top-right: ' + JSON.stringify(r.social));
    ok(r.ca.top >= 0 && r.ca.bottom < 220 && r.ca.left >= 0 && r.ca.right <= w + 0.5, 'CA slot outside the top of the viewport ' + JSON.stringify(r.ca));
    ok(r.caFont >= 20, 'CA font ' + r.caFont + 'px is not large');
    ok(!r.dates.length, 'date-like text in DOM: ' + r.dates.join(', '));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(500);
    const after = await page.evaluate(() => { const b = document.querySelector('#ca').getBoundingClientRect(); return { top: b.top, p: document.querySelector('[data-progress]').style.transform }; });
    ok(after.top >= 0 && after.top < 220, 'CA slot not pinned while scrolled'); ok(/scaleX\(0\.9|scaleX\(1/.test(after.p), 'progress bar not full at bottom: ' + after.p);
    await page.close(); return `${r.small.length} small targets, CA ${r.caFont}px`;
  });
}

await gate('market: skeleton, stagger fade-in, top 10 by 24h volume, logos, letter-tile fallback', async () => {
  const state = { delay: 3000 }; const { page } = await openPage(browser, url, 1366, { state });
  await page.waitForSelector('[data-rows] .is-skel'); const sk = await page.$$eval('[data-rows] .is-skel', (e) => e.length); ok(sk === 10, 'skeleton rows ' + sk);
  await rowsReady(page); await sleep(1500);
  const r = await page.evaluate(() => ({
    syms: [...document.querySelectorAll('[data-rows] .row b')].map((e) => e.textContent), tiles: document.querySelectorAll('[data-rows] .row .lt').length,
    imgs: document.querySelectorAll('[data-rows] .row .logo img').length, ops: [...document.querySelectorAll('[data-rows] .row')].map((e) => getComputedStyle(e).opacity),
    cells: [...document.querySelectorAll('[data-rows] .row')].map((e) => ['.row__price', '.row__chg', '.row__vol', '.row__liq', '.copy'].every((s) => e.querySelector(s) && e.querySelector(s).textContent !== undefined)),
    vols: [...document.querySelectorAll('[data-rows] .row__vol')].map((e) => e.textContent), skelLeft: document.querySelectorAll('.is-skel').length - document.querySelectorAll('[data-ticker] .is-skel,[data-rail] .is-skel').length,
    tick: document.querySelectorAll('[data-ticker-track] .tick').length, rail: document.querySelectorAll('[data-rail] .vcard').length, pill: document.querySelector('[data-pill="market"]').dataset.state,
  }));
  ok(r.syms.length === 10 && r.syms[0] === 'TK0' && r.syms[9] === 'TK9', 'order ' + r.syms.join(',')); ok(r.syms.length === 10 && !r.syms.includes('TK10'), 'ethereum entry leaked');
  ok(r.tiles >= 2, 'letter tiles ' + r.tiles + ' (missing and broken images need them)'); ok(r.imgs >= 1, 'no real logo shown');
  ok(r.ops.every((o) => o === '1'), 'rows not faded in: ' + r.ops.join(',')); ok(r.cells.every(Boolean), 'row cells missing');
  ok(r.tick === 20 && r.rail === 10, `ticker ${r.tick}, rail ${r.rail}`); ok(r.pill === 'live', 'pill ' + r.pill);
  const price = await page.$eval('[data-rows] .row__price', (e) => e.textContent); ok(/^\$0\.0₄/.test(price), 'subscript price format: ' + price);
  const copied = await (async () => { await page.click('[data-rows] .row .copy'); await sleep(200); return page.evaluate(() => navigator.clipboard.readText()); })();
  ok(copied === fixtureAddrs[0], 'copy-per-address wrote ' + copied); await page.close();
});
await gate('market: count-up and flash on change, polling every cycle, immediate fetch on visible, pause while hidden', async () => {
  const state = { round: 0 }; const { page } = await openPage(browser, url, 1366, { state, fast: true });
  await rowsReady(page); ok(state.log.length >= 2 && state.log[0].u.includes('token-boosts') && state.log[1].u.includes('/tokens/v1/solana/'), 'first load must ask boosts then pairs');
  state.round = 3;
  await page.waitForFunction(() => document.querySelector('.flash-up, .flash-down'), { timeout: 8000 }).catch(() => { throw new Error('no flash on value change'); });
  const n1 = state.log.length; ok(n1 >= 4, 'did not poll again: ' + n1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(400); const h0 = state.log.length; await sleep(2500); ok(state.log.length === h0, 'kept fetching while hidden: ' + (state.log.length - h0));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(500); ok(state.log.length > h0, 'no immediate fetch on visible'); await page.close();
});
await gate('market: exponential backoff, dash plus error when down, recovery, last good data kept', async () => {
  const state = { fail: true }; const { page } = await openPage(browser, url, 1366, { state, fast: true });
  await page.waitForFunction(() => document.querySelector('[data-pill="market"]').dataset.state === 'offline', { timeout: 8000 });
  const msg = await page.$eval('[data-msg]', (e) => e.textContent); ok(/—/.test(msg) && msg.length > 12, 'no dash and error: ' + msg);
  const stat = await page.$eval('[data-stat="volume"]', (e) => e.textContent); ok(stat === '—', 'stat not dashed: ' + stat);
  await sleep(2600);
  const gaps = (await page.evaluate(() => window.__d)).filter((d) => !Number.isInteger(d)); ok(gaps.length >= 4, 'too few retries ' + gaps.length);
  ok(gaps[0] >= 1600 && gaps[0] <= 2400 && gaps.slice(1, 4).every((v, i) => v > gaps[i] * 1.3), 'delays do not double: ' + gaps.map(Math.round).join(','));
  state.fail = false; await rowsReady(page); ok((await page.$eval('[data-pill="market"]', (e) => e.dataset.state)) === 'live', 'did not recover');
  state.fail = true; await page.waitForFunction(() => document.querySelector('[data-pill="market"]').dataset.state === 'delayed', { timeout: 8000 });
  ok((await page.$$eval('[data-rows] .row', (e) => e.length)) === 10, 'last good rows dropped'); await page.close();
});
await gate('visuals: reveal on scroll, parallax, spotlight, scroll progress, live dot pulse', async () => {
  const { page } = await openPage(browser, url, 1440, { state: {} }); await rowsReady(page); await sleep(1200);
  const below = await page.evaluate(() => { const el = document.querySelector('.phases [data-reveal]'); return { op: getComputedStyle(el).opacity, rev: el.dataset.revealed || '' }; }); ok(below.op === '0' && !below.rev, 'below-fold element not hidden before scroll');
  await page.evaluate(() => document.querySelector('.phases').scrollIntoView()); await sleep(1800);
  ok((await page.evaluate(() => getComputedStyle(document.querySelector('.phases [data-reveal]')).opacity)) === '1', 'did not reveal');
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  const before = await page.$eval('.blob--a', (e) => e.style.translate); await page.mouse.move(100, 100); await page.mouse.move(1300, 700, { steps: 8 }); await sleep(700);
  const after = await page.$eval('.blob--a', (e) => e.style.translate); ok(after && after !== before, 'parallax did not move: ' + before + ' -> ' + after);
  const box = await page.$eval('.mint', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + 40, y: b.y + 30 }; });
  await page.evaluate(() => document.querySelector('.mint').scrollIntoView({ block: 'center' })); await sleep(300);
  const b2 = await page.$eval('.mint', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + 77, y: b.y + 33 }; }); await page.mouse.move(b2.x, b2.y, { steps: 3 }); await sleep(100);
  ok(/px/.test(await page.$eval('.mint', (e) => e.style.getPropertyValue('--mx'))), 'spotlight tracking missing');
  const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length); ok(anims > 0, 'no running animations in normal motion'); await page.close();
});
await gate('reduced motion: nothing animates, everything visible at once', async () => {
  const { page } = await openPage(browser, url, 1440, { state: {}, reduced: true }); await rowsReady(page);
  const r = await page.evaluate(() => ({ running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect.getTiming().duration > 1).map((a) => a.animationName || a.constructor.name), hidden: [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1').length, ops: [...document.querySelectorAll('[data-rows] .row')].filter((e) => getComputedStyle(e).opacity !== '1').length }));
  ok(!r.running.length, 'running animations: ' + r.running.join(',')); ok(r.hidden === 0, r.hidden + ' reveal elements still hidden'); ok(r.ops === 0, 'rows not instant');
  await page.mouse.move(50, 50); await page.mouse.move(1300, 800, { steps: 6 }); await sleep(300);
  ok(!(await page.$eval('.blob--a', (e) => e.style.translate)), 'parallax moved under reduced motion'); await page.close();
});
await gate('copy slot (current register state): inert slot has no copy hook, live slot copies with feedback', async () => {
  const { page } = await openPage(browser, url, 390, { state: {} }); await rowsReady(page);
  const live = await page.$('#ca.is-live');
  if (!live) { const r = await page.$eval('#ca', (e) => ({ copy: !!e.querySelector('[data-copy]'), text: e.textContent.replace(/\s+/g, ' ').trim() })); ok(!r.copy && /pending/.test(r.text), 'inert slot wrong: ' + r.text); }
  else { await page.click('#ca .ca__btn'); await sleep(250); ok(/Copied/.test(await page.$eval('#ca [data-feedback]', (e) => e.textContent)), 'no copy feedback'); }
  await page.close();
});

// ---------- the flipped build: every unstated social/CA becomes stated, every stated one becomes inert ----------
const mutReg = JSON.parse(read('src/register/register.json'));
const flips = {};
for (const id of ['ca', 'x', 'github']) { const before = mutReg.records[id].state; const m = mutate(mutReg, id, makeStated[id]); mutReg.records[id] = m.records[id]; flips[id] = { before, after: m.records[id].state, rec: m.records[id] }; }
const MUT = path.join(ROOT, 'scripts/out/mut-dist'); const MUTREG = path.join(ROOT, 'scripts/out/mut-register.json');
fs.mkdirSync(path.dirname(MUTREG), { recursive: true }); fs.writeFileSync(MUTREG, JSON.stringify(mutReg));
process.env.REELIS_REGISTER = MUTREG; process.env.REELIS_OUT = MUT;
await build({ configFile: path.join(ROOT, 'vite.config.js'), logLevel: 'silent' });
delete process.env.REELIS_REGISTER; delete process.env.REELIS_OUT;
const mut = await serve(MUT);
for (const id of ['ca', 'x', 'github']) await gate(`flipped build ${id}: ${flips[id].before} -> ${flips[id].after} renders the opposite branch in the real page`, async () => {
  const { page } = await openPage(browser, mut.url, 390, { state: {} }); await rowsReady(page); await sleep(500);
  const r = await page.evaluate((id) => {
    const el = document.querySelector(id === 'ca' ? '#ca' : '[data-social="' + id + '"]');
    return { tag: el.tagName, href: el.getAttribute('href'), label: el.getAttribute('aria-label'), cls: el.className, text: el.textContent.replace(/\s+/g, ' ').trim() };
  }, id);
  const rec = flips[id].rec;
  if (rec.state === 'stated') {
    if (id === 'ca') { ok(/is-live/.test(r.cls) && r.text.includes(rec.value), 'CA not shown in full: ' + r.text); }
    else { ok(r.tag === 'A' && r.href === rec.url && /reelis/.test(r.label), 'social not linked: ' + JSON.stringify(r)); }
  } else {
    if (id === 'ca') ok(/is-inert/.test(r.cls) && /pending/.test(r.text) && !r.text.match(BASE58_ADDRESS), 'CA slot not inert');
    else ok(r.tag === 'SPAN' && !r.href && /pending/.test(r.label), 'social not inert: ' + JSON.stringify(r));
  }
  await page.close(); return flips[id].after;
});
await gate('flipped build: CA click-to-copy with feedback, mint check via stated RPC, market unaffected', async () => {
  if (flips.ca.after !== 'stated') return 'skipped, CA ends inert in the flipped build';
  const { page, state } = await openPage(browser, mut.url, 390, { state: {} }); await rowsReady(page);
  await page.click('#ca .ca__btn'); await sleep(250);
  ok(/Copied/.test(await page.$eval('#ca [data-feedback]', (e) => e.textContent)), 'no feedback'); ok(await page.$eval('#ca', (e) => e.classList.contains('is-copied')), 'no copied state');
  ok((await page.evaluate(() => navigator.clipboard.readText())) === flips.ca.rec.value, 'clipboard mismatch');
  await page.waitForSelector('.ca__ok', { timeout: 5000 }).catch(() => { throw new Error('mint check chip missing, rpc calls ' + state.rpc); });
  ok((await page.$$eval('[data-rows] .row', (e) => e.length)) === 10, 'market changed with CA state');
  for (const w of [360, 1440]) { await page.setViewport({ width: w, height: heightFor(w) }); await sleep(300); const r = await page.evaluate((w) => { const b = document.querySelector('#ca').getBoundingClientRect(); const v = document.querySelector('.ca__value'); return { right: b.right, ovf: document.documentElement.scrollWidth - innerWidth, fs: parseFloat(getComputedStyle(v).fontSize), full: v.textContent.length }; }, w); ok(r.ovf <= 0 && r.right <= w + 0.5, 'CA overflows at ' + w); ok(r.fs >= 15 && r.full >= 32, 'CA font/length at ' + w + ': ' + r.fs); if (w === 1440) ok(r.fs >= 22, 'CA not large on desktop: ' + r.fs); }
  await page.close();
});
mut.srv.close(); srv.close(); await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} gates, ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
