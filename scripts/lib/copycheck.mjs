// Copy originality: our visible strings versus the derived reference word and 2-gram sets.
import fs from 'node:fs';
import path from 'node:path';

export const STOP = new Set(('a about above after again all am an and any are as at be been being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours s t')
  .split(' '));
// Words the brief itself dictates (data labels, chain and feed names) plus the product and proper names.
export const ALLOW = new Set(['solana', 'dexscreener', 'reelis', 'github', 'x', 'price', 'volume', 'liquidity', 'market', 'address', 'contract', 'copy', 'copied', 'live', 'chain', 'token', 'tokens', 'logo', 'change', 'ctrl', 'c', 'h']);

const stripHtml = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&mdash;/g, '-').replace(/&#x27;|&#39;/g, "'");

export function htmlCopy(html) {
  const attrs = [...html.matchAll(/(?:alt|aria-label|title)="([^"]{2,300})"/g)].map((m) => m[1]);
  for (const m of html.matchAll(/<meta\s+(?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)"\s+content="([^"]+)"/g)) attrs.push(m[1]);
  const tt = html.match(/<title>([^<]+)<\/title>/); if (tt) attrs.push(tt[1]);
  const nodes = stripHtml(html).split(/<[^>]*>/).map((s) => decode(s).trim()).filter(Boolean);
  return nodes.concat(attrs.map(decode));
}
export function jsCopy(src) {
  const out = [];
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])+)\1/g)) {
    const s = m[2];
    if (/^[\w.:/#\[\]=-]+$/.test(s) && !/^[A-Z]/.test(s) && !/^(pending)$/.test(s)) continue;
    if (/[<>{}$_]|^\.|^data-|^is-|https?:/.test(s) || /^(POST|GET|summary|website)/.test(s) || (/^[a-z]+( [a-z]+)*$/.test(s) && s !== 'pending') || /^[a-z]+(-[a-z]+)+/.test(s) || /^[a-z]+ [a-z]+(__|-)/.test(s)) continue;
    if (/^[A-Za-z][A-Za-z0-9 ,.'!?+—−-]{2,}$/.test(s) && /[A-Za-z]{3}/.test(s) && (/\s/.test(s) || /^[A-Z]/.test(s) || s === 'pending')) out.push(s);
  }
  return out;
}
export function cssCopy(css) { return [...css.matchAll(/content:\s*"([^"]+)"/g)].map((m) => m[1]); }

export function tokenize(chunk) {
  const seqs = [];
  for (const sentence of chunk.split(/[.!?;:\n|]+/)) {
    const toks = sentence.toLowerCase().replace(/[’`]/g, "'").match(/[a-z][a-z']*/g) || [];
    if (toks.length) seqs.push(toks);
  }
  return seqs;
}

export function compare(chunks, ref) {
  const words = new Set(ref.words), bigrams = new Set(ref.bigrams);
  const badWords = new Map(), badBigrams = new Map();
  for (const c of chunks) for (const toks of tokenize(c)) {
    toks.forEach((t, i) => {
      if (words.has(t) && !STOP.has(t) && !ALLOW.has(t)) badWords.set(t, c);
      if (i) {
        const b = toks[i - 1] + ' ' + t;
        const allStop = STOP.has(toks[i - 1]) && STOP.has(t);
        if (bigrams.has(b) && !allStop) badBigrams.set(b, c);
      }
    });
  }
  return { badWords, badBigrams };
}

export function collectCopy(root = '.') {
  const chunks = [];
  const dist = path.join(root, 'dist/index.html');
  if (fs.existsSync(dist)) chunks.push(...htmlCopy(fs.readFileSync(dist, 'utf8')));
  for (const f of fs.readdirSync(path.join(root, 'src/js'))) chunks.push(...jsCopy(fs.readFileSync(path.join(root, 'src/js', f), 'utf8')));
  chunks.push(...cssCopy(fs.readFileSync(path.join(root, 'src/styles/main.css'), 'utf8')));
  return chunks;
}

if (process.argv[1] && process.argv[1].endsWith('copycheck.mjs')) {
  const ref = JSON.parse(fs.readFileSync('scripts/data/reference-ngrams.json', 'utf8'));
  const r = compare(collectCopy('.'), ref);
  console.log('shared words:', [...r.badWords.entries()].map(([w, c]) => `${w}  <- "${c.slice(0, 70)}"`));
  console.log('shared 2-grams:', [...r.badBigrams.entries()].map(([w, c]) => `${w}  <- "${c.slice(0, 70)}"`));
}
