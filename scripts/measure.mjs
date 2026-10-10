// Measures the built site at 360, 390, 430, 1366 and 1440 and saves screenshots under scripts/out/.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { launch } from './lib/browser.mjs';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serve = (dir) => new Promise((res) => { const s = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p.endsWith('/')) p += 'index.html'; const f = path.join(dir, decodeURIComponent(p)); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1', () => res({ s, url: 'http://127.0.0.1:' + s.address().port + '/' })); });

const targets = [['dist', path.resolve('dist')]];
if (fs.existsSync('scripts/out/mut-dist')) targets.push(['mut', path.resolve('scripts/out/mut-dist')]);
const b = await launch();
for (const [tag, dir] of targets) {
  const { s, url } = await serve(dir);
  for (const w of [360, 390, 430, 1366, 1440]) {
    const h = w < 700 ? 800 : 900;
    const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
    await p.goto(url, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 3000));
    const m = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      let small = 0; for (const e of document.querySelectorAll('a[href],button')) { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (cs.display !== 'none' && b.width && (b.width < 43.5 || b.height < 43.5)) small++; }
      return { inner: innerWidth, scrollW: document.documentElement.scrollWidth, bar: r('.bar'), ca: r('#ca'), caFont: getComputedStyle(document.querySelector('.ca__value,.ca__pending')).fontSize, x: r('[data-social="x"]'), gh: r('[data-social="github"]'), hero: r('.hero'), small, rows: document.querySelectorAll('[data-rows] .row:not(.is-skel)').length };
    });
    console.log(tag, w, JSON.stringify(m));
    await p.screenshot({ path: `scripts/out/m-${tag}-${w}.png` });
    await p.close();
  }
  s.close();
}
await b.close();
