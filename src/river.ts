// Kavadarci, the Луда Мара through the town: a stone-lined channel between two promenades, after photos
// (2015–2024) and the town's aerial images:
// - a trapezoidal channel ~8.6 m wide at the top: shallow water ~5 m wide, both banks pitched with
//   light, irregular stones (greener at the waterline), a white concrete coping along the top, a
//   railing on the east side;
// - low cascades where the water steps down (the town falls ~30 m over the 1.9 km);
// - a promenade on each side: big light concrete slabs; on the west side a red-brick walk with white
//   edges; benches, lamps; plane trees and young trees along the outer edge;
// - arched steel footbridges (light grey, arched railings) where OSM has footway bridges; the road
//   bridges get concrete parapets, the draped road being their deck;
// - steps down the bank to the water here and there.
// The terrain is not cut along it (scripts/config.ts `riversKeep`): the corridor is cut out of the
// terrain mesh and the draped ground instead (`cut`), and its surfaces (water, banks, promenades) are
// emitted into the draped ground (`canalGround`), so the far-ground bake shows them too.
// One layout serves the ground, the model, the walking height and collision and the trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toPts } from './geo.ts';
import type { Terrain } from './terrain.ts';
import type { BuildingData, CityData, Flat, Pt } from './types.ts';

/** cross-section, metres from the centre line; heights above the bare terrain */
export const CANAL = {
  /** half width of the water */
  water: 2.6,
  /** the banks' top edge (inner face of the coping) */
  top: 4.3,
  /** coping width, height above the promenade */
  coping: 0.4, copingH: 0.45,
  /** promenade: full outer half width (less where a street runs closer), height above the bare terrain */
  out: 8.7, prom: 0.8,
  /** water below the promenade (mean) */
  depth: 2.35,
  /** footbridges: deck width, rise of the arch */
  deck: 2.2, rise: 0.75,
};
const STEP = 2; // section spacing (prepare.ts resamples the centre line every 2 m)
const FOOT = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway']);

export interface RoadCross {
  /** fractional section index and the crossing point */
  k: number; p: Pt;
  /** the road's direction (unit) and half width (with the casing for major and minor roads) */
  dir: Pt; hw: number;
  /** its polyline (for distances) */
  pts: Pt[];
}
export interface CanalLayout {
  c: Pt[];
  /** unit normal: +n is the left bank looking downstream (north), here the east bank */
  n: Pt[];
  /** promenade outer half width per section: [east (+n), west (−n)] */
  out: [number, number][];
  /** bare terrain height at the centre (street level: the terrain is not cut here) */
  base: number[];
  /** water level at each section; between k and k + 1 the water falls over a cascade if weir[k] */
  level: number[];
  weir: boolean[];
  roads: RoadCross[];
  foot: RoadCross[];
  /** sections next to a road bridge (no coping, no railing, nothing on the promenade) */
  nearRoad: (k: number, d: number) => boolean;
  /** the polygon minus the corridor (null: untouched; [] when inside) */
  cut: (poly: Pt[]) => Pt[][] | null;
  /** terrain cells (j * nx + i) the corridor may touch */
  cells: (terrain: Terrain) => Set<number>;
  /** nearest point on the centre line: fractional section index, signed offset (+ = east) */
  locate: (x: number, z: number, reach?: number) => { k: number; d: number } | null;
}

const cache = new WeakMap<CityData, CanalLayout | null>();

const hash = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// keep the part of `poly` with a*x + b*z <= c (Sutherland–Hodgman)
function clipHalf(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [], n = poly.length;
  for (let k = 0; k < n; k++) {
    const P = poly[k], Q = poly[(k + 1) % n];
    const dp = a * P[0] + b * P[1] - c, dq = a * Q[0] + b * Q[1] - c;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}
const polyArea = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
};
const lineDist = (p: Pt, pts: Pt[]) => {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(p, pts[i], pts[i + 1]));
  return d;
};
// where segment a→b crosses c→d: t along a→b, or −1
function crossT(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

export function canalLayout(data: CityData, terrain: Terrain): CanalLayout | null {
  if (cache.has(data)) return cache.get(data)!;
  const flat = data.landmarks?.canal;
  if (!flat || flat.length < 8) { cache.set(data, null); return null; }
  const c = toPts(flat), N = c.length;
  const T = (p: Pt) => terrain.at(p[0], p[1]);
  const n: Pt[] = c.map((_, k) => {
    const a = c[Math.max(0, k - 1)], b = c[Math.min(N - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  });
  const off = (k: number, d: number): Pt => [c[k][0] + n[k][0] * d, c[k][1] + n[k][1] * d];

  // road crossings (bridges and culverts) and footbridges
  const roads: RoadCross[] = [], foot: RoadCross[] = [];
  const near: { pts: Pt[]; hw: number }[] = [];
  for (const r of data.roads) {
    const pts = toPts(r.p), isFoot = FOOT.has(r.k);
    const major = !isFoot && r.k !== 'service' && r.k !== 'track';
    const hw = r.w / 2 + (major ? 1.6 : 0);
    let crossed = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      // quick reject: far from the line's box
      for (let k = 0; k + 1 < N; k++) {
        const t = crossT(c[k], c[k + 1], pts[i], pts[i + 1]);
        if (t < 0) continue;
        crossed = true;
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1;
        const x: RoadCross = { k: k + t, p: [c[k][0] + (c[k + 1][0] - c[k][0]) * t, c[k][1] + (c[k + 1][1] - c[k][1]) * t], dir: [(pts[i + 1][0] - pts[i][0]) / L, (pts[i + 1][1] - pts[i][1]) / L], hw, pts };
        if (!isFoot) roads.push(x);
        else if (r.b) foot.push({ ...x, hw: CANAL.deck / 2 });
      }
    }
    if (!crossed && !isFoot && r.k !== 'track') near.push({ pts, hw });
  }
  // a road crossing next to a section's point at offset d
  const nearRoad = (k: number, d: number) => {
    const p = off(Math.round(k), d);
    return roads.some((r) => Math.abs(r.k - k) < 30 && lineDist(p, r.pts) < r.hw + 0.3);
  };

  // promenade width: up to CANAL.out, kept 0.6 m off streets running alongside
  const minOut = CANAL.top + CANAL.coping + 1.2;
  const rawOut = c.map((_, k): [number, number] => {
    const res: [number, number] = [CANAL.out, CANAL.out];
    for (const [si, sg] of [[0, 1], [1, -1]] as const) {
      for (let d = minOut; d <= CANAL.out; d += 0.5) {
        const p = off(k, sg * d);
        if (near.some((r) => Math.abs(r.pts[0][0] - p[0]) < 3000 && lineDist(p, r.pts) < r.hw + 0.6)) { res[si] = Math.max(minOut, d - 0.5); break; }
      }
    }
    return res;
  });
  // narrowest within ±6 m, then smoothed
  const out = rawOut.map((_, k): [number, number] => {
    const r: [number, number] = [Infinity, Infinity];
    for (let q = Math.max(0, k - 3); q <= Math.min(N - 1, k + 3); q++) { r[0] = Math.min(r[0], rawOut[q][0]); r[1] = Math.min(r[1], rawOut[q][1]); }
    return r;
  }).map((_, k, a): [number, number] => {
    let e = 0, w = 0, m = 0;
    for (let q = Math.max(0, k - 2); q <= Math.min(N - 1, k + 2); q++) { e += a[q][0]; w += a[q][1]; m++; }
    return [e / m, w / m];
  });

  // water: the street level (bare terrain at the centre and both banks, the lowest), smoothed over
  // ±20 m and never rising downstream, less the depth; flat-ish pools with a cascade every ~70 m
  const base = c.map((p) => T(p));
  const street = c.map((_, k) => Math.min(T(off(k, CANAL.top)), T(off(k, -CANAL.top)), base[k]));
  let target = street.map((_, k) => {
    let s = 0, m = 0;
    for (let q = Math.max(0, k - 10); q <= Math.min(N - 1, k + 10); q++) { s += street[q]; m++; }
    return s / m + CANAL.prom - CANAL.depth;
  });
  for (let k = 1; k < N; k++) target[k] = Math.min(target[k], target[k - 1]);
  const weirs: number[] = [0];
  const bridgeNear = (k: number) => [...roads, ...foot].some((r) => Math.abs(r.k - k) < 6);
  for (let k = 35; k < N - 20; ) {
    let q = k;
    while (q < N - 20 && bridgeNear(q)) q++;
    weirs.push(q);
    k = q + 35;
  }
  weirs.push(N - 1);
  const level = new Array<number>(N), weir = new Array<boolean>(N).fill(false);
  for (let w = 0; w + 1 < weirs.length; w++) {
    const a = weirs[w], b = weirs[w + 1], m = Math.round((a + b) / 2);
    for (let k = w === 0 ? a : a + 1; k <= b; k++) level[k] = target[m] + 0.35 * (target[k] - target[m]);
  }
  // a cascade only where the step is worth showing; elsewhere the pools join
  for (const k of weirs.slice(1, -1)) {
    if (level[k] - level[k + 1] > 0.12) weir[k] = true;
    else level[k + 1] = level[k];
  }
  target = [];

  // the corridor as triangles (two per section pair), on a grid for the cut
  const tris: Pt[][] = [];
  for (let k = 0; k + 1 < N; k++) {
    const a = off(k, out[k][0]), b = off(k + 1, out[k + 1][0]), cc = off(k + 1, -out[k + 1][1]), d = off(k, -out[k][1]);
    tris.push([a, b, cc], [a, cc, d]);
  }
  const G = 20, grid = new Map<number, number[]>();
  const boxes = tris.map((t) => [Math.min(t[0][0], t[1][0], t[2][0]), Math.min(t[0][1], t[1][1], t[2][1]), Math.max(t[0][0], t[1][0], t[2][0]), Math.max(t[0][1], t[1][1], t[2][1])]);
  // each triangle's edges as half-planes a*x + b*z <= c (inside)
  const planes = tris.map((t) => {
    const o = Math.sign(polyArea(t)) || 1;
    return [0, 1, 2].map((e) => {
      const P = t[e], Q = t[(e + 1) % 3], dx = Q[0] - P[0], dz = Q[1] - P[1];
      return [o * dz, -o * dx, o * (dz * P[0] - dx * P[1])] as [number, number, number];
    });
  });
  boxes.forEach(([x0, z0, x1, z1], i) => {
    for (let gi = Math.floor(x0 / G); gi <= Math.floor(x1 / G); gi++)
      for (let gj = Math.floor(z0 / G); gj <= Math.floor(z1 / G); gj++) {
        const key = gi * 100003 + gj;
        (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
      }
  });
  const cut = (poly: Pt[]): Pt[][] | null => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const cand = new Set<number>();
    for (let gi = Math.floor(x0 / G); gi <= Math.floor(x1 / G); gi++)
      for (let gj = Math.floor(z0 / G); gj <= Math.floor(z1 / G); gj++)
        for (const i of grid.get(gi * 100003 + gj) ?? []) {
          const b = boxes[i];
          if (b[0] < x1 && b[2] > x0 && b[1] < z1 && b[3] > z0) cand.add(i);
        }
    if (!cand.size) return null;
    let pieces = [poly], touched = false;
    for (const i of [...cand].sort((a, b) => a - b)) {
      const next: Pt[][] = [];
      for (const piece of pieces) {
        let rest = piece, inside = true;
        const kept: Pt[][] = [];
        for (const [a, b, cc] of planes[i]) {
          const o = clipHalf(rest, -a, -b, -cc);
          if (o.length >= 3 && Math.abs(polyArea(o)) > 1e-4) kept.push(o);
          rest = clipHalf(rest, a, b, cc);
          if (rest.length < 3 || Math.abs(polyArea(rest)) < 1e-4) { inside = false; break; }
        }
        if (!inside) next.push(piece); // no overlap with this triangle
        else { touched = true; next.push(...kept); }
      }
      pieces = next;
    }
    return touched ? pieces : null;
  };

  // nearest section: grid of the centre line's segments
  const LG = 25, lgrid = new Map<number, number[]>();
  for (let k = 0; k + 1 < N; k++) {
    const gi = Math.floor((c[k][0] + c[k + 1][0]) / 2 / LG), gj = Math.floor((c[k][1] + c[k + 1][1]) / 2 / LG);
    const key = gi * 100003 + gj;
    (lgrid.get(key) ?? lgrid.set(key, []).get(key)!).push(k);
  }
  const locate = (x: number, z: number, reach = 14) => {
    let best: { k: number; d: number; e: number } | null = null;
    const gi = Math.floor(x / LG), gj = Math.floor(z / LG);
    for (let i = gi - 1; i <= gi + 1; i++)
      for (let j = gj - 1; j <= gj + 1; j++)
        for (const k of lgrid.get(i * 100003 + j) ?? []) {
          const a = c[k], b = c[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
          const px = a[0] + dx * t, pz = a[1] + dz * t, e = Math.hypot(x - px, z - pz);
          if (e > reach || (best && e >= best.e)) continue;
          // signed: + on the east (+n) side
          const nn = n[k], d = (x - px) * nn[0] + (z - pz) * nn[1];
          best = { k: k + t, d, e };
        }
    if (!best) return null;
    if ((best.k <= 0 || best.k >= N - 1)) return null; // past the ends
    return { k: best.k, d: best.d };
  };

  let cellSet: Set<number> | null = null;
  const cells = (tr: Terrain) => {
    if (cellSet) return cellSet;
    cellSet = new Set();
    for (const [x0, z0, x1, z1] of boxes)
      for (let j = Math.floor((z0 - tr.z0) / tr.cell); j <= Math.floor((z1 - tr.z0) / tr.cell); j++)
        for (let i = Math.floor((x0 - tr.x0) / tr.cell); i <= Math.floor((x1 - tr.x0) / tr.cell); i++) cellSet.add(j * tr.nx + i);
    return cellSet;
  };
  const L: CanalLayout = { c, n, out, base, level, weir, roads, foot, nearRoad, cut, cells, locate };
  cache.set(data, L);
  return L;
}

// ---------------------------------------------------------------- the draped surfaces
type Vec3 = [number, number, number];
export interface GroundSink { tri(a: Vec3, b: Vec3, c: Vec3, col: THREE.Color, hint: Vec3): void }
const UP: Vec3 = [0, 1, 0];
const col = (s: string) => new THREE.Color(s); // as city.ts's palette
const STONES = ['#cfc7b6', '#bfb7a6', '#dad2c1', '#b1a998', '#c8bfad', '#d4cbb9', '#aca596'].map(col);
const MOSS = ['#a3a58b', '#9a9e86', '#aeae93'].map(col);
const CONCRETE = ['#e3ded3', '#dcd6ca', '#e7e2d8'].map(col);
const BRICK = col('#c9775c'), BRICK_EDGE = col('#efe7da'), FOAM = col('#f1f7f6'), FOAM2 = col('#cfe9ee');

/** The corridor in pieces of ~20 m (clearings: no trees, sheds or parked cars). */
export function canalPieces(L: CanalLayout): Pt[][] {
  const res: Pt[][] = [], N = L.c.length;
  for (let k0 = 0; k0 + 1 < N; k0 += 10) {
    const k1 = Math.min(N - 1, k0 + 10), ring: Pt[] = [];
    for (let k = k0; k <= k1; k++) ring.push([L.c[k][0] + L.n[k][0] * L.out[k][0], L.c[k][1] + L.n[k][1] * L.out[k][0]]);
    for (let k = k1; k >= k0; k--) ring.push([L.c[k][0] - L.n[k][0] * L.out[k][1], L.c[k][1] - L.n[k][1] * L.out[k][1]]);
    res.push(ring);
  }
  return res;
}

/** The section pairs [k, k + 1] whose middle lies in each chunk (by `key`). */
export function canalChunks(L: CanalLayout, key: (x: number, z: number) => number): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let k = 0; k + 1 < L.c.length; k++) {
    const id = key((L.c[k][0] + L.c[k + 1][0]) / 2, (L.c[k][1] + L.c[k + 1][1]) / 2);
    (m.get(id) ?? m.set(id, []).get(id)!).push(k);
  }
  return m;
}

/** Water, banks and promenades of the section pairs `ks` into the draped ground (`water`: the
 *  palette's water colour, so it gets the glints and the far bake shows it). */
export function canalGround(L: CanalLayout, terrain: Terrain, ks: number[], B: GroundSink, water: THREE.Color): void {
  const { c, n, out, level, weir } = L;
  const W = CANAL.water, TOP = CANAL.top, PROM = CANAL.prom;
  const P = (k: number, d: number, y?: number): Vec3 => {
    const x = c[k][0] + n[k][0] * d, z = c[k][1] + n[k][1] * d;
    return [x, y ?? terrain.at(x, z) + PROM, z];
  };
  const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3, colr: THREE.Color, hint: Vec3 = UP) => { B.tri(a, b, cc, colr, hint); B.tri(a, cc, d, colr, hint); };
  const ROWS = 6, ACROSS = 3; // stones: 6 rows up the bank, 3 per section along it
  for (const k of ks) {
    const k1 = k + 1;
    // water (a cascade falls between k and k + 1 where weir[k]; foam below it)
    const foam = weir[k] ? FOAM : (k > 0 && weir[k - 1]) || (k > 1 && weir[k - 2]) ? FOAM2 : null;
    quad(P(k, -W - 0.4, level[k]), P(k1, -W - 0.4, level[k1]), P(k1, W + 0.4, level[k1]), P(k, W + 0.4, level[k]), foam ?? water);
    for (const sg of [1, -1]) {
      // the bank: stones from below the water up to the coping
      for (let r = 0; r < ROWS; r++) {
        const f0 = r / ROWS, f1 = (r + 1) / ROWS;
        for (let j = 0; j < ACROSS; j++) {
          const g0 = j / ACROSS, g1 = (j + 1) / ACROSS;
          const pt = (g: number, f: number): Vec3 => {
            // along: blend sections k → k1; across: water edge (f = 0, a little under) → top (f = 1)
            const a = P(k, sg * (W - 0.5 + (TOP - W + 0.5) * f), 0), b = P(k1, sg * (W - 0.5 + (TOP - W + 0.5) * f), 0);
            const x = a[0] + (b[0] - a[0]) * g, z = a[2] + (b[2] - a[2]) * g;
            const lw = level[k] + (level[k1] - level[k]) * g - 0.45, ly = terrain.at(x, z) + PROM;
            return [x, lw + (ly - lw) * f, z];
          };
          const h = hash(k * ACROSS + j + (sg > 0 ? 0 : 7919), r);
          const cl = r === 0 ? MOSS[Math.floor(h * MOSS.length)] : STONES[Math.floor(h * STONES.length)];
          // stagger the joints row by row
          const sh = r % 2 ? 0.5 / ACROSS : 0;
          const ga = Math.min(1, g0 + sh), gb = Math.min(1, g1 + sh);
          quad(pt(ga, f0), pt(gb, f0), pt(gb, f1), pt(ga, f1), cl, [-sg * n[k][0] * 0.6, 1, -sg * n[k][1] * 0.6]);
          if (r % 2 && j === 0) quad(pt(0, f0), pt(sh, f0), pt(sh, f1), pt(0, f1), STONES[Math.floor(hash(k, r + 99) * STONES.length)], [-sg * n[k][0] * 0.6, 1, -sg * n[k][1] * 0.6]);
        }
      }
      // the promenade: concrete slabs; on the west side a red-brick walk with white edges
      const o0 = out[k][sg > 0 ? 0 : 1], o1 = out[k1][sg > 0 ? 0 : 1];
      const slab = CONCRETE[Math.floor(hash(Math.floor(k / 2), sg) * CONCRETE.length)];
      const bands: [number, number, THREE.Color][] = sg > 0 ? [[TOP, 1, slab]] : [];
      if (sg < 0) {
        const b0 = TOP + CANAL.coping + 1.8, b1 = b0 + 1.6;
        bands.push([TOP, b0 - 0.12, slab], [b0 - 0.12, b0, BRICK_EDGE], [b0, b1, BRICK], [b1, b1 + 0.12, BRICK_EDGE], [b1 + 0.12, 1, slab]);
      }
      for (const [d0, d1, cl] of bands) {
        const e0 = Math.min(d0, o0), e1 = Math.min(d0, o1), f0 = d1 === 1 ? o0 : Math.min(d1, o0), f1 = d1 === 1 ? o1 : Math.min(d1, o1);
        if (f0 - e0 < 0.01 && f1 - e1 < 0.01) continue;
        quad(P(k, sg * e0), P(k1, sg * e1), P(k1, sg * f1), P(k, sg * f0), cl);
      }
      // the kerb at the outer edge, down into the ground beside it
      const a = P(k, sg * o0), b = P(k1, sg * o1);
      quad(a, b, [b[0], b[1] - PROM - 0.3, b[2]], [a[0], a[1] - PROM - 0.3, a[2]], CONCRETE[1], [sg * n[k][0], 0, sg * n[k][1]]);
    }
  }
}

/** Promenade height for walking (absolute; −∞ off it): the promenades and the footbridges' decks. */
export function canalWalkGround(L: CanalLayout, terrain: Terrain): (x: number, z: number) => number {
  return (x, z) => {
    const q = L.locate(x, z, CANAL.out + 1);
    if (!q) return -Infinity;
    const ad = Math.abs(q.d);
    for (const f of L.foot) {
      const along = (x - f.p[0]) * f.dir[0] + (z - f.p[1]) * f.dir[1];
      const k = Math.round(f.k), nn = L.n[k], acr = (x - f.p[0]) * -nn[1] + (z - f.p[1]) * nn[0];
      const span = CANAL.top + CANAL.coping + 0.6;
      const u = (x - f.p[0]) * nn[0] + (z - f.p[1]) * nn[1];
      if (Math.abs(acr) < CANAL.deck / 2 && Math.abs(u) < span && Math.abs(along) < span + 2) return footY(L, terrain, f) + CANAL.rise * (1 - (u / span) ** 2) + 0.2;
    }
    if (ad >= CANAL.top && ad <= Math.max(...L.out[Math.round(q.k)])) return terrain.at(x, z) + CANAL.prom;
    return -Infinity;
  };
}
const footY = (L: CanalLayout, terrain: Terrain, f: RoadCross) => {
  const k = Math.round(f.k), span = CANAL.top + CANAL.coping + 0.6, nn = L.n[k];
  return (terrain.at(f.p[0] + nn[0] * span, f.p[1] + nn[1] * span) + terrain.at(f.p[0] - nn[0] * span, f.p[1] - nn[1] * span)) / 2 + CANAL.prom;
};

/** Walking collision: the channel between the copings, open at the bridges, in pieces of ~40 m. */
export function canalFootprints(L: CanalLayout): BuildingData[] {
  const { c, n } = L, N = c.length, out: BuildingData[] = [];
  const w = CANAL.top + CANAL.coping;
  const open = (k: number) => L.roads.some((r) => Math.abs(r.k - k) * STEP < r.hw + 1) || L.foot.some((f) => Math.abs(f.k - k) * STEP < CANAL.deck / 2 + 0.2);
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) {
      const ring: Flat = [];
      for (const k of run) ring.push(c[k][0] + n[k][0] * w, c[k][1] + n[k][1] * w);
      for (const k of [...run].reverse()) ring.push(c[k][0] - n[k][0] * w, c[k][1] - n[k][1] * w);
      out.push({ id: -5000 - out.length, r: [ring], h: 1.4, mh: 0, lv: 1, old: 0, t: 'yes', rs: null, w: null, c: null });
    }
    run = [];
  };
  for (let k = 0; k < N; k++) {
    if (open(k)) { flush(); continue; }
    run.push(k);
    if (run.length > 20) { flush(); run.push(k); }
  }
  flush();
  return out;
}

/** Tree spots along the promenades' outer edges (plane trees; checked against buildings and roads by the caller). */
export function canalTrees(L: CanalLayout): Pt[] {
  const res: Pt[] = [];
  for (let k = 3; k < L.c.length - 3; k += 8) {
    for (const [si, sg] of [[0, 1], [1, -1]] as const) {
      if (hash(k, si + 3) < 0.3) continue;
      const d = L.out[k][si] + 3 + hash(k, si) * 1.5;
      if (L.nearRoad(k, sg * d)) continue;
      res.push([L.c[k][0] + L.n[k][0] * sg * d, L.c[k][1] + L.n[k][1] * sg * d]);
    }
  }
  return res;
}

// ---------------------------------------------------------------- the model
type Mat = (color: THREE.ColorRepresentation, extra?: THREE.MeshLambertMaterialParameters) => THREE.MeshLambertMaterial;
type V = THREE.Vector3;

/** Triangles with outward faces (each convex piece is turned away from its own centre). */
class Soup {
  pos: number[] = [];
  /** a convex block between two rings of corners (same count, same order) */
  block(a: V[], b: V[]): void {
    const cen = new THREE.Vector3();
    for (const p of [...a, ...b]) cen.add(p);
    cen.multiplyScalar(1 / (a.length + b.length));
    const m = a.length;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; this.tri(a[i], a[j], b[j], cen); this.tri(a[i], b[j], b[i], cen); }
    for (let i = 1; i + 1 < m; i++) { this.tri(a[0], a[i], a[i + 1], cen); this.tri(b[0], b[i], b[i + 1], cen); }
  }
  tri(a: V, b: V, c: V, cen: V): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(new THREE.Vector3().subVectors(a, cen)) < 0) [b, c] = [c, b];
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Copings, railings, footbridges, road-bridge parapets, steps, benches, lamps, the cascades' sills. */
export function createCanal(L: CanalLayout, terrain: Terrain, M: Mat) {
  const group = new THREE.Group();
  const { c, n, out, level, weir } = L, N = c.length;
  const T = (x: number, z: number) => terrain.at(x, z);
  const PROM = CANAL.prom, TOP = CANAL.top, CW = CANAL.coping, W = CANAL.water;
  const P = (k: number, d: number): Pt => [c[k][0] + n[k][0] * d, c[k][1] + n[k][1] * d];
  /** the promenade's height at a point */
  const Y = (p: Pt) => T(p[0], p[1]) + PROM;
  const V3 = (p: Pt, y: number) => new THREE.Vector3(p[0], y, p[1]);
  const soup = { concrete: new Soup(), steel: new Soup(), deck: new Soup(), dark: new Soup() };
  const boxes = { steel: [] as THREE.BufferGeometry[], wood: [] as THREE.BufferGeometry[], post: [] as THREE.BufferGeometry[], lamp: [] as THREE.BufferGeometry[] };
  // turn so local +z points along n[k] (local +x then runs upstream/downstream)
  const turn = (k: number) => Math.atan2(n[k][0], n[k][1]);
  // a square beam from a to b (w × h)
  const beam = (S: Soup, a: V, b: V, w: number, h: number) => {
    const ax = new THREE.Vector3().subVectors(b, a);
    if (ax.length() < 1e-3) return;
    ax.normalize();
    const side = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const upv = new THREE.Vector3().crossVectors(side, ax).normalize();
    const ring = (p: V) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => p.clone().addScaledVector(side, (u * w) / 2).addScaledVector(upv, (v * h) / 2));
    S.block(ring(a), ring(b));
  };

  // where steps go down to the water: every ~150 m, alternate sides, away from bridges and cascades
  const stairs: [number, number][] = [];
  for (let k = 40, side = 1; k < N - 40; k += 75, side = -side) {
    let q = k;
    while (q < N - 40 && (L.roads.some((r) => Math.abs(r.k - q) < 12) || L.foot.some((f) => Math.abs(f.k - q) < 8) || weir.slice(q - 8, q + 8).some(Boolean))) q++;
    if (q < N - 40) stairs.push([q, side]);
  }

  // ---- copings (white concrete) along both tops; a railing on the east one; gaps at the bridges and steps
  const footGap = (k: number) => L.foot.some((f) => Math.abs(f.k - k) * STEP < CANAL.deck / 2 + 0.6);
  const COPING: [number, number][] = [[TOP - 0.02, -0.6], [TOP + CW, -0.05], [TOP + CW, CANAL.copingH], [TOP, CANAL.copingH]];
  for (let k = 0; k + 1 < N; k++) {
    for (const sg of [1, -1]) {
      if (L.nearRoad(k, sg * TOP) || L.nearRoad(k + 1, sg * TOP) || footGap(k) || footGap(k + 1)) continue;
      if (stairs.some(([q, sd]) => sd === sg && k >= q - 1 && k <= q)) continue;
      const ring = (q: number) => COPING.map(([d, y]) => { const p = P(q, sg * d); return V3(p, Y(p) + y); });
      soup.concrete.block(ring(k), ring(k + 1));
      if (sg < 0) continue;
      const a = P(k, TOP + CW / 2), b = P(k + 1, TOP + CW / 2), ya = Y(a) + CANAL.copingH, yb = Y(b) + CANAL.copingH;
      if (k % 2 === 0) beam(soup.steel, V3(a, ya), V3(a, ya + 0.9), 0.06, 0.06); // posts every 4 m
      beam(soup.steel, V3(a, ya + 0.9), V3(b, yb + 0.9), 0.07, 0.07);
      beam(soup.steel, V3(a, ya + 0.45), V3(b, yb + 0.45), 0.04, 0.04);
    }
  }

  // ---- cascades: a concrete sill across the channel at the top of each
  for (let k = 0; k + 1 < N; k++) {
    if (!weir[k]) continue;
    beam(soup.concrete, V3(P(k, -W - 0.6), level[k] - 0.12), V3(P(k, W + 0.6), level[k] - 0.12), 0.5, 0.3);
  }

  // ---- the ends, under the road bridges: dark culvert mouths
  for (const k of [0, N - 1]) {
    const y1 = Y(c[k]), y0 = Math.min(level[k] - 0.6, y1 - 3.2);
    beam(soup.dark, V3(P(k, -TOP), (y0 + y1) / 2), V3(P(k, TOP), (y0 + y1) / 2), 0.3, y1 - y0);
  }

  // ---- road bridges: concrete parapets along the deck's edges over the channel, the fascia under them
  for (const r of L.roads) {
    const k = Math.min(N - 1, Math.round(r.k)), nn = n[k];
    const cosA = Math.abs(r.dir[0] * nn[0] + r.dir[1] * nn[1]);
    const half = (TOP + CW + 0.4) / Math.max(0.35, cosA);
    const perp: Pt = [-r.dir[1], r.dir[0]];
    for (const sg of [1, -1]) {
      const o = r.hw - 0.2;
      const a: Pt = [r.p[0] + perp[0] * o * sg - r.dir[0] * half, r.p[1] + perp[1] * o * sg - r.dir[1] * half];
      const b: Pt = [r.p[0] + perp[0] * o * sg + r.dir[0] * half, r.p[1] + perp[1] * o * sg + r.dir[1] * half];
      const ya = T(a[0], a[1]), yb = T(b[0], b[1]);
      beam(soup.concrete, V3(a, ya + 1.48), V3(b, yb + 1.48), 0.35, 0.9);
      beam(soup.concrete, V3(a, ya + 0.45), V3(b, yb + 0.45), 0.3, 1.1);
    }
  }

  // ---- footbridges: a slim arched deck, arched railings with posts, two steel arches under it
  for (const f of L.foot) {
    const k = Math.min(N - 1, Math.round(f.k)), nn = n[k], tt: Pt = [-nn[1], nn[0]];
    const span = TOP + CW + 0.6, y0 = footY(L, terrain, f), hd = CANAL.deck / 2, S = 16;
    const deckY = (u: number) => y0 + CANAL.rise * (1 - (u / span) ** 2);
    const pt = (u: number, v: number, y: number) => new THREE.Vector3(f.p[0] + nn[0] * u + tt[0] * v, y, f.p[1] + nn[1] * u + tt[1] * v);
    const as = span - 0.7; // the arches spring from the copings
    const archY = (u: number) => y0 - 0.55 + (CANAL.rise + 0.5) * (1 - (u / as) ** 2);
    for (let i = 0; i < S; i++) {
      const u0 = -span + (2 * span * i) / S, u1 = -span + (2 * span * (i + 1)) / S;
      const ring = (u: number) => [pt(u, -hd, deckY(u)), pt(u, hd, deckY(u)), pt(u, hd, deckY(u) + 0.16), pt(u, -hd, deckY(u) + 0.16)];
      soup.deck.block(ring(u0), ring(u1));
      const a0 = -as + (2 * as * i) / S, a1 = -as + (2 * as * (i + 1)) / S;
      for (const v of [-hd + 0.05, hd - 0.05]) {
        beam(soup.steel, pt(u0, v, deckY(u0) + 1.16), pt(u1, v, deckY(u1) + 1.16), 0.07, 0.07); // handrail
        beam(soup.steel, pt(u0, v, deckY(u0) + 0.62), pt(u1, v, deckY(u1) + 0.62), 0.04, 0.04);
        if (i % 2 === 0) beam(soup.steel, pt(u0, v, deckY(u0) + 0.16), pt(u0, v, deckY(u0) + 1.16), 0.05, 0.05);
        beam(soup.steel, pt(a0, v, archY(a0)), pt(a1, v, archY(a1)), 0.12, 0.16);
      }
    }
    for (const v of [-hd + 0.05, hd - 0.05]) beam(soup.steel, pt(span, v, deckY(span) + 0.16), pt(span, v, deckY(span) + 1.16), 0.05, 0.05);
  }

  // ---- steps straight down the bank to the water, every ~150 m on alternate sides, flush with the slope
  for (const [q, side] of stairs) {
    const top = Y(P(q, side * TOP)), lw = level[q] - 0.45, bottom = level[q] + 0.05;
    const nSteps = Math.max(4, Math.round((top - bottom) / 0.24)), rise = (top - bottom) / nSteps;
    // where the bank's surface is at height y
    const dAt = (y: number) => W - 0.5 + (TOP - W + 0.5) * Math.max(0, (y - lw) / (top - lw));
    for (let i = 1; i <= nSteps; i++) {
      const y = top - i * rise, d1 = dAt(y), d0 = dAt(y - rise), run = Math.max(0.12, d1 - d0);
      const p = P(q, side * (d0 + run / 2));
      const g = new THREE.BoxGeometry(1.3, rise + 0.4, run).translate(0, y - (rise + 0.4) / 2, 0).rotateY(turn(q)).translate(p[0], 0, p[1]);
      soup.concrete.pos.push(...Array.from(g.toNonIndexed().attributes.position.array));
    }
  }

  // ---- benches facing the water (alternate sides) and lamps on the east promenade
  for (let k = 6, i = 0; k < N - 6; k += 13, i++) {
    const sg = i % 2 ? 1 : -1, si = sg > 0 ? 0 : 1;
    if (out[k][si] < TOP + CW + 2.6 || L.nearRoad(k, sg * (TOP + CW + 1.5)) || footGap(k)) continue;
    const p = P(k, sg * (out[k][si] - 0.7)), y = Y(p), r = turn(k);
    const place = (g: THREE.BufferGeometry) => g.rotateY(r).translate(p[0], y, p[1]);
    boxes.wood.push(place(new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0)), place(new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.72, sg * 0.24)));
    for (const e of [-0.75, 0.75]) boxes.post.push(place(new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(e, 0.22, 0)));
  }
  for (let k = 10; k < N - 6; k += 15) {
    if (out[k][0] < TOP + CW + 1.6 || L.nearRoad(k, TOP + CW + 1) || footGap(k)) continue;
    const p = P(k, out[k][0] - 0.5), y = Y(p), hp = P(k, out[k][0] - 1.1), r = turn(k);
    boxes.post.push(new THREE.CylinderGeometry(0.06, 0.09, 5, 6).translate(p[0], y + 2.5, p[1]));
    boxes.post.push(new THREE.BoxGeometry(0.08, 0.08, 0.7).rotateY(r).translate((p[0] + hp[0]) / 2, y + 5, (p[1] + hp[1]) / 2));
    boxes.lamp.push(new THREE.BoxGeometry(0.36, 0.14, 0.24).rotateY(r).translate(hp[0], y + 4.92, hp[1]));
  }

  const addGeo = (geo: THREE.BufferGeometry | null, mat: THREE.Material) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  const merged = (list: THREE.BufferGeometry[]) => list.length ? mergeGeometries(list.map((g) => { const h = g.index ? g.toNonIndexed() : g; h.deleteAttribute('uv'); return h; })) : null;
  addGeo(soup.concrete.geometry(), M('#ece8e0'));
  addGeo(soup.steel.geometry(), M('#c9ced2'));
  addGeo(soup.deck.geometry(), M('#bfc4c6'));
  addGeo(soup.dark.geometry(), M('#4a4d50'));
  addGeo(merged(boxes.wood), M('#a8754e'));
  addGeo(merged(boxes.post), M('#5d6064'));
  const glass: THREE.MeshLambertMaterial[] = [];
  if (boxes.lamp.length) {
    const lampMat = M('#f2ead2', { emissive: '#ffd890', emissiveIntensity: 0 });
    glass.push(lampMat);
    addGeo(merged(boxes.lamp), lampMat);
  }
  return { group, glass };
}
