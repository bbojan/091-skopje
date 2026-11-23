// The whole country at 100 m for the country view (and later the F-15): heights from the same AWS Terrarium
// tiles as scripts/terrain.ts (zoom 11, ~57 m per pixel here) and the land cover and border from
// data/country_cover.json (scripts/country_cover.py, from the Geofabrik extract).
// Usage: node scripts/country.ts. Output: public/country.png + public/country.json.
//   R, G: height in whole metres above `min` (R the high byte; metres, not decimetres: half the file, and 1 m is
//   plenty at 100 m cells); B: the land cover class (COVER), +128 inside the border.
// One RGB PNG instead of a .bin: GitHub Pages does not gzip .bin files, and the browser decodes the PNG natively.
import fs from 'node:fs';
import { rowCrossings } from '../src/geo.ts';
import { decodePNG, encodePNG } from './png.ts';
import type { Poly } from '../src/types.ts';

/** the box around the country, a little wider than its border (the view shows the neighbours' relief around it) */
const BOX = { s: 40.62, w: 20.4, n: 42.42, e: 23.1 };
const CELL = 100; // metres
const Z = 11;
/** land cover classes: the same numbers as scripts/country_cover.py and src/country.ts */
const COVER = { none: 0, meadow: 1, field: 2, forest: 3, water: 4, town: 5, rock: 6, vine: 7 } as const;
/** painting order: a later class wins where areas overlap (water last, so lakes stay whole) */
const ORDER = [COVER.meadow, COVER.field, COVER.vine, COVER.forest, COVER.rock, COVER.town, COVER.water];

const lat0 = (BOX.s + BOX.n) / 2, lon0 = (BOX.w + BOX.e) / 2;
const R = 6378137;
const kx = (Math.cos((lat0 * Math.PI) / 180) * R * Math.PI) / 180, ky = (R * Math.PI) / 180;
const W = (BOX.e - BOX.w) * kx, H = (BOX.n - BOX.s) * ky;
const nx = Math.floor(W / CELL) + 1, nz = Math.floor(H / CELL) + 1;
/** cell (i, j) → lat / lon; i east from the west edge, j south from the north edge */
const cellLL = (i: number, j: number): [number, number] => [BOX.n - (j * CELL) / ky, BOX.w + (i * CELL) / kx];
/** lon / lat → fractional cell coordinates */
const toCell = (lon: number, lat: number): [number, number] => [((lon - BOX.w) * kx) / CELL, ((BOX.n - lat) * ky) / CELL];

// ---------------- heights
const CACHE = 'data/terrarium';
fs.mkdirSync(CACHE, { recursive: true });
const lon2x = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };
const tiles = new Map<string, Float32Array>();
const jobs: [number, number][] = [];
for (let x = Math.floor(lon2x(BOX.w)); x <= Math.floor(lon2x(BOX.e)); x++)
  for (let y = Math.floor(lat2y(BOX.n)); y <= Math.floor(lat2y(BOX.s)); y++) jobs.push([x, y]);
console.log(`grid ${nx} × ${nz} (${CELL} m), fetching ${jobs.length} tiles…`);
async function getTile(x: number, y: number): Promise<void> {
  const f = `${CACHE}/${Z}_${x}_${y}.png`;
  if (!fs.existsSync(f)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${x},${y}: ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const png = decodePNG(fs.readFileSync(f));
  const hts = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) hts[i] = png.data[i * png.bpp] * 256 + png.data[i * png.bpp + 1] + png.data[i * png.bpp + 2] / 256 - 32768;
  tiles.set(`${x},${y}`, hts);
}
for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(([x, y]) => getTile(x, y)));
function elev(lat: number, lon: number): number {
  const gx = lon2x(lon) * 256 - 0.5, gy = lat2y(lat) * 256 - 0.5;
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const s = (px: number, py: number) => tiles.get(`${Math.floor(px / 256)},${Math.floor(py / 256)}`)?.[(py & 255) * 256 + (px & 255)] ?? 0;
  return (s(ix, iy) * (1 - fx) + s(ix + 1, iy) * fx) * (1 - fy) + (s(ix, iy + 1) * (1 - fx) + s(ix + 1, iy + 1) * fx) * fy;
}
const hts = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++)
  for (let i = 0; i < nx; i++) {
    // the average of four samples a quarter cell apart: a 100 m cell from ~57 m pixels without aliasing
    const [la, lo] = cellLL(i, j), dla = CELL / 4 / ky, dlo = CELL / 4 / kx;
    hts[j * nx + i] = (elev(la - dla, lo - dlo) + elev(la - dla, lo + dlo) + elev(la + dla, lo - dlo) + elev(la + dla, lo + dlo)) / 4;
  }

// ---------------- land cover and the border
type Cover = { areas: [number, number[][]][]; border: number[][] };
const src = JSON.parse(fs.readFileSync('data/country_cover.json', 'utf8')) as Cover;
/** rings in lon / lat (flat) → a polygon in cell coordinates */
const toPoly = (rings: number[][]): Poly => rings.map((r) => { const out: [number, number][] = []; for (let k = 0; k + 1 < r.length; k += 2) out.push(toCell(r[k], r[k + 1])); return out; });
/** the cells whose centres lie inside a polygon, by scanlines (holes respected, even–odd) */
function cellsIn(poly: Poly, each: (k: number) => void): void {
  let z0 = Infinity, z1 = -Infinity;
  for (const ring of poly) for (const [, z] of ring) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.ceil(z0)); j <= Math.min(nz - 1, Math.floor(z1)); j++) {
    rowCrossings(poly, j, xs);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil(xs[k])); i <= Math.min(nx - 1, Math.floor(xs[k + 1])); i++) each(j * nx + i);
  }
}
const cover = new Uint8Array(nx * nz);
const byClass = new Map<number, Poly[]>();
for (const [c, rings] of src.areas) { const l = byClass.get(c) ?? []; l.push(toPoly(rings)); byClass.set(c, l); }
const counts: Record<string, number> = {};
for (const c of ORDER) {
  for (const poly of byClass.get(c) ?? []) {
    if (c === COVER.water) {
      // lakes lie flat: every cell of a lake at its 20th-percentile height (the tiles' water is noisy near the shore)
      const ks: number[] = [];
      cellsIn(poly, (k) => ks.push(k));
      if (ks.length >= 8) {
        const sorted = ks.map((k) => hts[k]).sort((a, b) => a - b), level = sorted[Math.floor(sorted.length * 0.2)];
        for (const k of ks) hts[k] = level;
      }
      for (const k of ks) cover[k] = c;
    } else cellsIn(poly, (k) => (cover[k] = c));
  }
}
const inside = new Uint8Array(nx * nz);
cellsIn(toPoly(src.border), (k) => (inside[k] = 1));
for (let k = 0; k < cover.length; k++) { const name = Object.keys(COVER)[cover[k]]; counts[name] = (counts[name] ?? 0) + 1; }

// ---------------- write
let min = Infinity, max = -Infinity;
for (const v of hts) { min = Math.min(min, v); max = Math.max(max, v); }
min = Math.floor(min);
const rgb = new Uint8Array(nx * nz * 3);
for (let k = 0; k < nx * nz; k++) {
  const dm = Math.max(0, Math.min(65535, Math.round(hts[k] - min)));
  rgb[k * 3] = dm >> 8; rgb[k * 3 + 1] = dm & 255; rgb[k * 3 + 2] = cover[k] | (inside[k] << 7);
}
const png = encodePNG(nx, nz, rgb);
fs.writeFileSync('public/country.png', png);
const meta = { nx, nz, cell: CELL, box: BOX, lat0, lon0, kx, ky, min, max: Math.round(max * 10) / 10 };
fs.writeFileSync('public/country.json', JSON.stringify(meta) + '\n');
console.log(`public/country.png ${(png.length / 1e6).toFixed(1)} MB, heights ${min}–${meta.max} m, cells:`, counts);
