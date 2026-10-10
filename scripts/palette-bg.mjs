// Dark/glow palette: k-means over reference slide 1 and banner, each centre snapped to a real pixel coordinate.
import sharp from 'sharp';
const files = ['reference/REELIS 1.jpg.jpeg', 'reference/SAMPUL REELIS JPG.jpg.jpeg'];
function km(px, k) {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let c = Array.from({ length: k }, () => px[Math.floor(r() * px.length)].slice(0, 3));
  const asg = new Array(px.length).fill(0);
  for (let it = 0; it < 16; it++) {
    px.forEach((p, i) => { let b = 0, bd = 1e12; c.forEach((q, j) => { const d = (p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2; if (d < bd) { bd = d; b = j; } }); asg[i] = b; });
    const s = c.map(() => [0,0,0,0]); px.forEach((p, i) => { const a = s[asg[i]]; a[0]+=p[0]; a[1]+=p[1]; a[2]+=p[2]; a[3]++; });
    c = s.map((a, j) => a[3] ? [a[0]/a[3], a[1]/a[3], a[2]/a[3]] : c[j]);
  }
  const cnt = new Array(k).fill(0); asg.forEach(a => cnt[a]++);
  return c.map((v, j) => ({ v, n: cnt[j] }));
}
for (const f of files) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = []; for (let y = 0; y < info.height; y += 4) for (let x = 0; x < info.width; x += 4) { const i = (y*info.width+x)*4; px.push([data[i], data[i+1], data[i+2], x, y]); }
  console.log(f);
  km(px, 9).sort((a, b) => b.n - a.n).forEach(k => {
    let best = null, bd = 1e12; for (const p of px) { const d = (p[0]-k.v[0])**2+(p[1]-k.v[1])**2+(p[2]-k.v[2])**2; if (d < bd) { bd = d; best = p; } }
    console.log(' ', '#' + best.slice(0,3).map(v => v.toString(16).padStart(2,'0')).join(''), 'at', best[3], best[4], 'n=', k.n);
  });
}
// logo geometry from the transparent PNG
const { data, info } = await sharp('brand/LOGO REELIS PNG...png').raw().toBuffer({ resolveWithObject: true });
let x0=1e9,y0=1e9,x1=-1,y1=-1;
for (let y=0;y<info.height;y++) for (let x=0;x<info.width;x++) if (data[(y*info.width+x)*4+3] > 128) { x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y); }
console.log('logo bbox', x0,y0,x1,y1);
