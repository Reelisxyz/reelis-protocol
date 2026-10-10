import { defineConfig } from 'vite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { stripDates, validateRegister, view } from './src/register/register.js';
import { renderApp } from './src/render.js';

const tokens = fs.readFileSync('src/styles/tokens.css', 'utf8');
const token = (name) => { const m = tokens.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{3,8})')); if (!m) throw new Error('token missing: ' + name); return m[1]; };

function reelis() {
  const raw = JSON.parse(fs.readFileSync(process.env.REELIS_REGISTER || 'src/register/register.json', 'utf8'));
  const errors = validateRegister(raw);
  if (errors.length) throw new Error('register invalid:\n' + errors.join('\n'));
  const reg = stripDates(raw);
  const v = view(reg);
  const inline = "document.documentElement.classList.add('js')";
  const hash = crypto.createHash('sha256').update(inline).digest('base64');
  const origins = new Set(["'self'"]);
  for (const r of Object.values(reg.records)) {
    if (r.state !== 'stated') continue;
    for (const k of ['rpc', 'boostsUrl', 'pairsUrl']) if (r[k]) origins.add(new URL(r[k].replace('{addresses}', 'x')).origin);
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${hash}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src ${[...origins].join(' ')}`,
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    name: 'reelis',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace('<!--APP-->', renderApp(v))
          .replace('%THEME_INK%', token('ink'))
          .replace('%CANONICAL%', v.site.live ? `<link rel="canonical" href="${v.site.url}">` : '');
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({
        name: 'Reelis', short_name: 'Reelis', start_url: './', display: 'standalone',
        background_color: token('ink'), theme_color: token('ink'),
        icons: [{ src: './brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: './brand/icon-512.png', sizes: '512x512', type: 'image/png' }],
      }) });
      this.emitFile({ type: 'asset', fileName: '_headers', source:
        `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nAllow: /\n' });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [reelis()],
  build: { outDir: process.env.REELIS_OUT || 'dist', emptyOutDir: true, target: 'es2020', cssTarget: 'chrome90', assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
