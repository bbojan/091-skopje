// Builds a heightfield for the map extent from AWS Terrarium elevation tiles.
// Usage: node scripts/terrain.ts [city]. Output: FILES.terrainBin (Uint16, decimetres above the
// minimum) + FILES.terrainJson (public/terrain.* for Skopje)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { BBOX, FILES, unproj, W, H } from './config.ts';

const Z = 15;
const CELL = 10; // metres between samples
const CACHE = 'data/terrarium';
fs.mkdirSync(CACHE, { recursive: true });

const lon2x = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced)
function decodePNG(buf: Buffer): { w: number; h: number; bpp: number; data: Buffer } {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported png'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('png colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  const stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

const x0 = Math.floor(lon2x(BBOX.w)), x1 = Math.floor(lon2x(BBOX.e));
const y0 = Math.floor(lat2y(BBOX.n)), y1 = Math.floor(lat2y(BBOX.s));
const tiles = new Map<string, Float32Array>();
const jobs: [number, number][] = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
console.log(`fetching ${jobs.length} tiles…`);
async function getTile(x: number, y: number): Promise<void> {
  const f = `${CACHE}/${Z}_${x}_${y}.png`;
  if (!fs.existsSync(f)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const png = decodePNG(fs.readFileSync(f));
  const hts = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) {
    const r = png.data[i * png.bpp], g = png.data[i * png.bpp + 1], b = png.data[i * png.bpp + 2];
    hts[i] = r * 256 + g + b / 256 - 32768;
  }
  tiles.set(`${x},${y}`, hts);
}
for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(([x, y]) => getTile(x, y)));

function elev(lat: number, lon: number): number {
  const gx = lon2x(lon) * 256 - 0.5, gy = lat2y(lat) * 256 - 0.5;
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const s = (px: number, py: number) => {
    const t = tiles.get(`${Math.floor(px / 256)},${Math.floor(py / 256)}`);
    return t ? t[(py & 255) * 256 + (px & 255)] : 0;
  };
  return (s(ix, iy) * (1 - fx) + s(ix + 1, iy) * fx) * (1 - fy) + (s(ix, iy + 1) * (1 - fx) + s(ix + 1, iy + 1) * fx) * fy;
}

const nx = Math.ceil(W / CELL) + 1, nz = Math.ceil(H / CELL) + 1;
let g = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++)
  for (let i = 0; i < nx; i++) {
    const [lat, lon] = unproj(-W / 2 + i * CELL, -H / 2 + j * CELL);
    g[j * nx + i] = elev(lat, lon);
  }

// Smooth out DSM noise (buildings/trees baked into the source) – 3 box passes
for (let pass = 0; pass < 3; pass++) {
  const o = new Float32Array(g.length);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          s += g[b * nx + a]; n++;
        }
      o[j * nx + i] = s / n;
    }
  g = o;
}

let min = Infinity, max = -Infinity;
for (const v of g) { if (v < min) min = v; if (v > max) max = v; }
const out = new Uint16Array(g.length);
for (let i = 0; i < g.length; i++) out[i] = Math.round((g[i] - min) * 10);
fs.writeFileSync(FILES.terrainBin, Buffer.from(out.buffer));
fs.writeFileSync(FILES.terrainJson, JSON.stringify({ nx, nz, cell: CELL, x0: -W / 2, z0: -H / 2, min: +min.toFixed(1), max: +max.toFixed(1) }));
console.log(`terrain ${nx}x${nz} @${CELL}m, elevation ${min.toFixed(0)}–${max.toFixed(0)} m`);
