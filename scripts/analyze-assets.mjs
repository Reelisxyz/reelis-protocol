// Reads every brand and reference image byte: container header, colour type, alpha histogram, k-means palette.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dirs = ['brand', 'reference'];
const out = [];

function ihdr(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return { width: w, height: h, bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
}
function kind(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'PNG';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'JPEG';
  return 'UNKNOWN';
}
function kmeans(px, k, iters = 14) {
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let c = []; for (let i = 0; i < k; i++) c.push(px[Math.floor(rnd() * px.length)].slice());
  let asg = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < px.length; i++) {
      let b = 0, bd = 1e12;
      for (let j = 0; j < k; j++) { const d = (px[i][0]-c[j][0])**2+(px[i][1]-c[j][1])**2+(px[i][2]-c[j][2])**2; if (d < bd) { bd = d; b = j; } }
      asg[i] = b;
    }
    const s = c.map(() => [0,0,0,0]);
    for (let i = 0; i < px.length; i++) { const a = s[asg[i]]; a[0]+=px[i][0]; a[1]+=px[i][1]; a[2]+=px[i][2]; a[3]++; }
    c = s.map((a, j) => a[3] ? [a[0]/a[3], a[1]/a[3], a[2]/a[3]] : c[j]);
  }
  const cnt = new Array(k).fill(0); asg.forEach(a => cnt[a]++);
  return c.map((v, j) => ({ centre: v, count: cnt[j] }));
}

for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f); const buf = fs.readFileSync(p);
    const rec = { file: p.split(path.sep).join('/'), bytes: buf.length, container: kind(buf), ihdr: ihdr(buf) };
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    rec.decoded = { w: info.width, h: info.height, channels: info.channels };
    const hist = new Array(8).fill(0); let pureBlackTransparent = 0, opaqueBlack = 0, total = info.width*info.height;
    const sample = [];
    const step = Math.max(1, Math.floor(Math.sqrt(total / 60000)));
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y*info.width + x) * 4; const a = data[i+3];
      hist[Math.min(7, a >> 5)]++;
      if (a < 255 && data[i]+data[i+1]+data[i+2] === 0) pureBlackTransparent++;
      if (a === 255 && data[i]+data[i+1]+data[i+2] < 12) opaqueBlack++;
      if (a > 200 && y % step === 0 && x % step === 0 && data[i]+data[i+1]+data[i+2] > 60) sample.push([data[i], data[i+1], data[i+2], x, y]);
    }
    rec.alphaHistogram_8bins = hist; rec.pureBlackNonOpaque = pureBlackTransparent; rec.opaqueNearBlack = opaqueBlack;
    rec.hasAlphaChannel = rec.ihdr ? [4, 6].includes(rec.ihdr.colourType) : false;
    if (f.includes('LOGO')) {
      const km = kmeans(sample, 8);
      rec.palette = km.filter(k => k.count > 40).sort((a,b) => b.count - a.count).map(k => {
        let best = null, bd = 1e12;
        for (const s of sample) { const dd = (s[0]-k.centre[0])**2+(s[1]-k.centre[1])**2+(s[2]-k.centre[2])**2; if (dd < bd) { bd = dd; best = s; } }
        const hex = '#' + [best[0], best[1], best[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        return { cluster: k.centre.map(Math.round), snappedHex: hex, atPixel: [best[3], best[4]], members: k.count };
      });
    }
    out.push(rec);
  }
}
fs.mkdirSync('scripts/data', { recursive: true });
fs.writeFileSync('scripts/data/assets.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
