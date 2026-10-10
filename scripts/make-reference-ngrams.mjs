// Builds scripts/data/reference-ngrams.json from saved copies of the reference pages.
// Only derived word and 2-gram sets are stored, never the reference copy itself.
// usage: node scripts/make-reference-ngrams.mjs <dir with pg_*.html and index.html>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('pass the directory holding the saved reference pages');
const words = new Set(), bigrams = new Set();

function entities(s) {
  return s.replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function feed(chunk) {
  for (const sentence of chunk.split(/[.!?;:\n|•·]+/)) {
    const toks = sentence.toLowerCase().replace(/[’`]/g, "'").match(/[a-z][a-z']*/g) || [];
    toks.forEach((t, i) => { words.add(t); if (i) bigrams.add(toks[i - 1] + ' ' + t); });
  }
}
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  let h = fs.readFileSync(path.join(dir, f), 'utf8');
  const attrs = [...h.matchAll(/(?:alt|aria-label|title|content|placeholder)="([^"]{2,300})"/g)].map(m => m[1]);
  h = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
  const nodes = h.split(/<[^>]*>/).map(s => entities(s).trim()).filter(Boolean);
  nodes.concat(attrs.map(entities)).forEach(feed);
}
fs.mkdirSync('scripts/data', { recursive: true });
fs.writeFileSync('scripts/data/reference-ngrams.json', JSON.stringify({ words: [...words].sort(), bigrams: [...bigrams].sort() }));
console.log('words', words.size, 'bigrams', bigrams.size);
