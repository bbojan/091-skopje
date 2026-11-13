// Builds a heightfield for the map extent from AWS Terrarium elevation tiles.
// Usage: node scripts/terrain.ts [city]. Output: FILES.terrainBin (Uint16, decimetres above the
// minimum) + FILES.terrainJson (public/terrain.* for Skopje)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { BBOX, CITIES, CITY, FILES, proj, unproj, W, H } from './config.ts';
import { polygonsOf, wayPts, isWater, type OsmJson } from './osm.ts';
import { rowCrossings } from '../src/geo.ts';
import type { Poly, Pt } from '../src/types.ts';

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

const SPEC = CITIES[CITY].terrain;
// Smooth out DSM noise (buildings/trees baked into the source): box passes (Skopje 3)
for (let pass = 0; pass < SPEC.smooth; pass++) {
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

// ---------------- corrections from the OSM shapes (per city, see TerrainSpec in config.ts)
const smoothstep = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const cellX = (i: number) => -W / 2 + i * CELL, cellZ = (j: number) => -H / 2 + j * CELL;
/** height at a scene point, bilinear */
const sample = (x: number, z: number) => {
  const gx = Math.min(Math.max((x + W / 2) / CELL, 0), nx - 1.001), gz = Math.min(Math.max((z + H / 2) / CELL, 0), nz - 1.001);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, k = j * nx + i;
  return (g[k] * (1 - fx) + g[k + 1] * fx) * (1 - fz) + (g[k + nx] * (1 - fx) + g[k + nx + 1] * fx) * fz;
};
/** grid cells inside a polygon (holes respected), by scanlines */
function cellsIn(poly: Poly): number[] {
  const out: number[] = [], xs: number[] = [];
  let z0 = Infinity, z1 = -Infinity;
  for (const [, z] of poly[0]) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let j = Math.max(0, Math.ceil((z0 + H / 2) / CELL)); j <= Math.min(nz - 1, Math.floor((z1 + H / 2) / CELL)); j++) {
    rowCrossings(poly, cellZ(j), xs);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil((xs[k] + W / 2) / CELL)); i <= Math.min(nx - 1, Math.floor((xs[k + 1] + W / 2) / CELL)); i++) out.push(j * nx + i);
  }
  return out;
}
const segDist = (px: number, pz: number, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz);
};
const fixes = SPEC.flatWater || SPEC.flatSquares?.length || SPEC.rivers || SPEC.points?.length;
if (fixes) {
  if (!fs.existsSync(FILES.raw)) { console.error(`${FILES.raw} is missing: run \`npm run download -- ${CITY}\` first`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(FILES.raw, 'utf8')) as OsmJson;

  // river channels: lowered along the waterway, full depth within the half width, easing out over
  // 10 m; not within 5–9 m of a road (it crosses on a bridge or a culvert)
  if (SPEC.rivers) {
    const roads: [Pt, Pt][] = [];
    const RG = 20, roadGrid = new Map<number, number[]>();
    for (const el of raw.elements) {
      const t = el.tags ?? {};
      if (el.type !== 'way' || !t.highway || t.tunnel === 'yes' || t.area === 'yes') continue;
      const pts = wayPts(el.geometry || []);
      for (let k = 0; k + 1 < pts.length; k++) {
        const id = roads.push([pts[k], pts[k + 1]]) - 1;
        const [a, b] = roads[id];
        for (let i = Math.floor((Math.min(a[0], b[0]) - 10) / RG); i <= Math.floor((Math.max(a[0], b[0]) + 10) / RG); i++)
          for (let j = Math.floor((Math.min(a[1], b[1]) - 10) / RG); j <= Math.floor((Math.max(a[1], b[1]) + 10) / RG); j++) {
            const key = i * 100003 + j;
            (roadGrid.get(key) ?? roadGrid.set(key, []).get(key)!).push(id);
          }
      }
    }
    const roadDist = (x: number, z: number) => {
      let d = Infinity;
      for (const id of roadGrid.get(Math.floor(x / RG) * 100003 + Math.floor(z / RG)) ?? []) d = Math.min(d, segDist(x, z, ...roads[id]));
      return d;
    };
    const FEATHER = 10, cut = new Float32Array(g.length);
    let channels = 0;
    for (const el of raw.elements) {
      const t = el.tags ?? {}, spec = t.waterway ? SPEC.rivers[t.waterway] : undefined;
      if (el.type !== 'way' || !spec || t.tunnel === 'yes' || t.tunnel === 'culvert') continue;
      const [hw, depth] = spec, reach = hw + FEATHER, pts = wayPts(el.geometry || []);
      channels++;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach + W / 2) / CELL)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + reach + W / 2) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach + H / 2) / CELL)), j1 = Math.min(nz - 1, Math.ceil((Math.max(a[1], b[1]) + reach + H / 2) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const d = segDist(cellX(i), cellZ(j), a, b);
          if (d >= reach) continue;
          const v = depth * (1 - smoothstep(hw, reach, d));
          if (v > cut[j * nx + i]) cut[j * nx + i] = v;
        }
      }
    }
    for (let k = 0; k < g.length; k++) if (cut[k] > 0) {
      const x = cellX(k % nx), z = cellZ(Math.floor(k / nx));
      g[k] -= cut[k] * smoothstep(5, 9, roadDist(x, z));
    }
    console.log(`river channels: ${channels} waterways cut in`);
  }

  // lakes and reservoirs: one water level, the 15th percentile of the ground inside (EU-DEM water
  // surfaces are nearly flat already; this removes the last ripples and the channel cut into them)
  if (SPEC.flatWater) {
    let lakes = 0;
    for (const el of raw.elements) {
      if (!isWater(el.tags ?? {})) continue;
      for (const poly of polygonsOf(el)) {
        const cells = cellsIn(poly);
        if (cells.length < 4) continue;
        const hs = cells.map((k) => g[k]).sort((a, b) => a - b), level = hs[Math.floor(hs.length * 0.15)];
        for (const k of cells) g[k] = level;
        lakes++;
      }
    }
    console.log(`flat water: ${lakes} lakes`);
  }

  // squares: flat at their median height, blended back into the ground over 15 m around them
  for (const name of SPEC.flatSquares ?? []) {
    const els = raw.elements.filter((e) => e.tags?.name === name);
    for (const el of els) for (const poly of polygonsOf(el)) {
      const inside = new Set(cellsIn(poly));
      if (inside.size < 2) continue;
      const hs = [...inside].map((k) => g[k]).sort((a, b) => a - b), level = hs[hs.length >> 1];
      const F = 15, ring = poly[0];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let j = Math.max(0, Math.floor((z0 - F + H / 2) / CELL)); j <= Math.min(nz - 1, Math.ceil((z1 + F + H / 2) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((x0 - F + W / 2) / CELL)); i <= Math.min(nx - 1, Math.ceil((x1 + F + W / 2) / CELL)); i++) {
          const k = j * nx + i;
          if (inside.has(k)) { g[k] = level; continue; }
          let d = Infinity;
          for (let m = 0; m < ring.length; m++) d = Math.min(d, segDist(cellX(i), cellZ(j), ring[m], ring[(m + 1) % ring.length]));
          if (d < F) g[k] = level + (g[k] - level) * smoothstep(0, F, d);
        }
      console.log(`flat square: ${name} at ${level.toFixed(1)} m`);
    }
  }

  // known heights: the ground is bent so each point reads its height, easing out to its radius
  if (SPEC.points?.length) {
    const corr = new Float32Array(g.length), wsum = new Float32Array(g.length);
    for (const [lat, lon, metres, radius = 150] of SPEC.points) {
      const [px, pz] = proj(lat, lon), delta = metres - sample(px, pz);
      for (let j = Math.max(0, Math.floor((pz - radius + H / 2) / CELL)); j <= Math.min(nz - 1, Math.ceil((pz + radius + H / 2) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((px - radius + W / 2) / CELL)); i <= Math.min(nx - 1, Math.ceil((px + radius + W / 2) / CELL)); i++) {
          const d = Math.hypot(cellX(i) - px, cellZ(j) - pz);
          if (d >= radius) continue;
          const w = 0.5 * (1 + Math.cos((Math.PI * d) / radius)), k = j * nx + i;
          corr[k] += w * delta; wsum[k] += w;
        }
      console.log(`known height ${lat},${lon}: ${metres} m (was ${(metres - delta).toFixed(1)})`);
    }
    for (let k = 0; k < g.length; k++) if (wsum[k] > 0) g[k] += corr[k] / Math.max(1, wsum[k]);
  }
}

let min = Infinity, max = -Infinity;
for (const v of g) { if (v < min) min = v; if (v > max) max = v; }
const out = new Uint16Array(g.length);
for (let i = 0; i < g.length; i++) out[i] = Math.round((g[i] - min) * 10);
fs.writeFileSync(FILES.terrainBin, Buffer.from(out.buffer));
fs.writeFileSync(FILES.terrainJson, JSON.stringify({ nx, nz, cell: CELL, x0: -W / 2, z0: -H / 2, min: +min.toFixed(1), max: +max.toFixed(1) }));
console.log(`terrain ${nx}x${nz} @${CELL}m, elevation ${min.toFixed(0)}–${max.toFixed(0)} m`);
