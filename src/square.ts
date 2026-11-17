// Kavadarci, Плоштад Маршал Тито: the town hall's forecourt and the square's furniture. Positions are
// read off an aerial image (Esri World Imagery) and checked against photos (2019–2025):
// - in front of the town hall a terrace with three curved steps and a round fountain at each end of
//   them: dark slate brick, a blue basin, a crown of jets arching in toward the middle;
// - on the west side, along Илинденска: dark granite ball bollards at the kerb, a lawn strip with young
//   trees and globe lamps, the Monument to the Revolution at its south end (landmarks.ts), a street
//   clock at the north end, where a circle is laid in the paving;
// - in the middle three oval planters with clipped bushes; by the glass tower two S-shaped planters
//   of red begonias, mirror images, with wooden seats in their curls;
// - light grey stone paving (the plaza colour, scripts/prepare.ts) with darker bands: one along the
//   square, arcs round the circle at the north end, cross lines.
// One layout serves the model, the walking collision and the walking height of the terrace.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toPts, pip } from './geo.ts';
import { SHARED, areaLift } from './city.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

type LL = [lat: number, lon: number];
const SQ = {
  fountains: [[41.433005, 22.01206], [41.43306, 22.012332]] as LL[],
  /** the lowest step's front edge: where it meets the west fountain, its middle, at the east fountain */
  steps: [[41.433037, 22.012087], [41.43308, 22.012198], [41.433074, 22.012308]] as LL[],
  ovals: [[41.433401, 22.012262], [41.433334, 22.01228], [41.43325, 22.012306]] as LL[],
  /** halfway between the two S planters */
  planters: [41.433304, 22.012429] as LL,
  /** the lawn strip's centre line, north end to south end */
  lawn: [[41.433538, 22.012059], [41.433297, 22.012108]] as LL[],
  /** along the kerb of Илинденска as the map draws it (12 m wide: the real street is narrower) */
  bollards: [[41.433612, 22.012004], [41.433442, 22.01204], [41.433244, 22.012081], [41.433127, 22.012066], [41.433069, 22.012059]] as LL[],
  clock: [41.433576, 22.012032] as LL,
  /** the circle laid in the paving at the north end; the paving's arcs are centred on it */
  circle: [41.433636, 22.012047] as LL,
  /** the darker band along the square: north end, south end (also the square's axis) */
  band: [[41.433686, 22.012191], [41.433043, 22.012396]] as LL[],
};
const STEP = { rise: 0.17, tread: 0.45, n: 3 };
const FOUNTAIN = { r: 2.2, h: 0.8 };
const OVAL = { w: 2.2, d: 5.0, h: 0.5 };
/** S planters: radius of each curl's centre line, band width, height, distance between the two, how far
 *  the ends and the middle curl in */
const S = { r: 2.0, w: 1.3, h: 0.75, gap: 5.7, end: 0.45, cusp: 0.35 };
const LAWN_W = 3.0;

export interface SquareLayout {
  /** the paving's height above the bare terrain */
  lift: number;
  /** base level of the terrace (at the middle of the lowest step) */
  y0: number;
  fountains: Pt[];
  /** the steps' outlines, lowest first (each one also the terrace up to its top) */
  steps: Pt[][];
  /** rotation about +y whose local +z runs along the square, north to south */
  axis: number;
  ovals: Pt[];
  /** the S planters' bands (outline per curl) */
  planters: { bands: Pt[][]; arcs: { c: Pt; t0: number; t1: number; side: number }[] }[];
  lawn: [Pt, Pt];
  bollards: Pt[];
  clock: Pt;
  circle: Pt;
  band: [Pt, Pt];
  /** the square's outline: the paving bands stay inside it */
  plaza: Pt[] | null;
}

function circle3(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const A = a[0] ** 2 + a[1] ** 2, B = b[0] ** 2 + b[1] ** 2, C = c[0] ** 2 + c[1] ** 2;
  const x = (A * (b[1] - c[1]) + B * (c[1] - a[1]) + C * (a[1] - b[1])) / d;
  const z = (A * (c[0] - b[0]) + B * (a[0] - c[0]) + C * (b[0] - a[0])) / d;
  return { c: [x, z], r: Math.hypot(a[0] - x, a[1] - z) };
}

/** a convex outline moved inward by d */
function inset(poly: Pt[], d: number): Pt[] {
  if (!d) return poly;
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const s = a > 0 ? 1 : -1, n = poly.length;
  const nrm = (p: Pt, q: Pt): Pt => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return [(-dz / l) * s, (dx / l) * s]; };
  return poly.map((v, i) => {
    const m1 = nrm(poly[(i + n - 1) % n], v), m2 = nrm(v, poly[(i + 1) % n]), k = d / (1 + m1[0] * m2[0] + m1[1] * m2[1]);
    return [v[0] + (m1[0] + m2[0]) * k, v[1] + (m1[1] + m2[1]) * k];
  });
}

/** room left between the town hall and a street's drawn edge (the pavement) */
const PAVEMENT = 1.5;
const NOT_STREETS = ['footway', 'path', 'steps', 'cycleway', 'track', 'bridleway', 'pedestrian'];

export interface TownhallPlan {
  /** the outline (OSM), corners pushed off the streets as the map draws them */
  ring: Pt[];
  /** the front: the longest edge facing the square, from a to b; nrm points out of it */
  a: Pt;
  b: Pt;
  nrm: Pt;
  /** how far the building reaches back from the front */
  depth: number;
}

/** The town hall's plan. OSM's outline matches the aerial image (a 33.8 m front on the square, the west
 *  side along Илинденска, the east end angled along the street behind), but the map draws Илинденска
 *  12 m wide, wider than it is, so corners closer than a pavement to a drawn street are pushed back. */
export function townhallPlan(data: CityData): TownhallPlan | null {
  const L = data.landmarks;
  if (!L?.townhall) return null;
  const ring: Pt[] = toPts(L.townhall).map(([x, z]) => [x, z]);
  const segs: number[][] = [];
  for (const r of data.roads) {
    if (NOT_STREETS.includes(r.k)) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) segs.push([r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], r.w / 2 + PAVEMENT]);
  }
  for (let pass = 0; pass < 3; pass++) for (const v of ring) for (const [x1, z1, x2, z2, clear] of segs) {
    const dx = x2 - x1, dz = z2 - z1, t = Math.max(0, Math.min(1, ((v[0] - x1) * dx + (v[1] - z1) * dz) / (dx * dx + dz * dz || 1)));
    const px = x1 + dx * t, pz = z1 + dz * t, ex = v[0] - px, ez = v[1] - pz, d = Math.hypot(ex, ez);
    if (d < clear && d > 1e-6) { v[0] = px + (ex / d) * clear; v[1] = pz + (ez / d) * clear; }
  }
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area2 += p[0] * q[1] - q[0] * p[1]; }
  const sq = data.places?.square ?? data.meta.square;
  let best: { a: Pt; b: Pt; nrm: Pt; score: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const nrm: Pt = area2 > 0 ? [dz / len, -dx / len] : [-dz / len, dx / len]; // outward
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, tl = Math.hypot(sq[0] - mx, sq[1] - mz) || 1;
    const facing = (nrm[0] * (sq[0] - mx) + nrm[1] * (sq[1] - mz)) / tl;
    if (facing > 0.6 && (!best || len > best.score)) best = { a, b, nrm, score: len };
  }
  if (!best) return null;
  const { a, b, nrm } = best;
  const depth = Math.max(...ring.map((v) => -((v[0] - a[0]) * nrm[0] + (v[1] - a[1]) * nrm[1])));
  return { ring, a, b, nrm, depth };
}

export function squareLayout(data: CityData, terrain: Terrain): SquareLayout | null {
  const L = data.landmarks;
  if (!L?.townhall || !L.revolution) return null; // Kavadarci only
  const m = data.meta;
  const P = ([lat, lon]: LL): Pt => [(lon - m.lon0) * m.kx, -(lat - m.lat0) * m.ky];
  const lift = areaLift(5);
  // the steps: an arc through three points, closed behind the town hall's front
  const [sw, apex, se] = SQ.steps.map(P);
  const circ = circle3(sw, apex, se);
  const ang = (p: Pt) => Math.atan2(p[1] - circ.c[1], p[0] - circ.c[0]);
  let a0 = ang(sw), a1 = ang(se);
  const am = ang(apex);
  // go the way that passes the apex
  const within = (a: number, b: number, x: number) => { const span = ((b - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), off = ((x - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return off <= span; };
  if (!within(a0, a1, am)) [a0, a1] = [a1, a0];
  const span = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const arc: Pt[] = [];
  for (let i = 0; i <= 28; i++) { const a = a0 + (span * i) / 28; arc.push([circ.c[0] + Math.cos(a) * circ.r, circ.c[1] + Math.sin(a) * circ.r]); }
  const plan = townhallPlan(data);
  const n: Pt = [(apex[0] - circ.c[0]) / circ.r, (apex[1] - circ.c[1]) / circ.r]; // toward the square
  const back = (e: Pt): Pt => { // straight back from an end of the steps to 1.5 m behind the town hall's front
    if (!plan) return [e[0] - n[0] * 9, e[1] - n[1] * 9];
    const { a: front, nrm } = plan;
    const s = ((e[0] - front[0]) * nrm[0] + (e[1] - front[1]) * nrm[1] + 1.5) / (n[0] * nrm[0] + n[1] * nrm[1]);
    return [e[0] - n[0] * s, e[1] - n[1] * s];
  };
  const base = [...arc, back(arc[arc.length - 1]), back(arc[0])];
  const steps = Array.from({ length: STEP.n }, (_, k) => inset(base, k * STEP.tread));
  // the square's axis
  const [bn, bs] = SQ.band.map(P);
  const axis = Math.atan2(bs[0] - bn[0], bs[1] - bn[1]);
  const U: Pt = [Math.cos(axis), -Math.sin(axis)], V: Pt = [Math.sin(axis), Math.cos(axis)];
  // the S planters: two curls each, bulging away from the aisle between them
  const pc = P(SQ.planters);
  const planters = [1, -1].map((side) => {
    const o: Pt = [pc[0] + U[0] * side * S.gap / 2, pc[1] + U[1] * side * S.gap / 2];
    const w = (u: number, v: number): Pt => [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v];
    const curls = [
      { cv: -S.r, t0: -Math.PI / 2 - S.end, t1: Math.PI / 2 + S.cusp }, // the north curl
      { cv: S.r, t0: -Math.PI / 2 - S.cusp, t1: Math.PI / 2 + S.end }, // the south curl
    ];
    const bands = curls.map(({ cv, t0, t1 }) => {
      const out: Pt[] = [], k = 24;
      for (let i = 0; i <= k; i++) { const t = t0 + ((t1 - t0) * i) / k, R = S.r + S.w / 2; out.push(w(side * R * Math.cos(t), cv + R * Math.sin(t))); }
      for (let i = k; i >= 0; i--) { const t = t0 + ((t1 - t0) * i) / k, R = S.r - S.w / 2; out.push(w(side * R * Math.cos(t), cv + R * Math.sin(t))); }
      return out;
    });
    return { bands, arcs: curls.map(({ cv, t0, t1 }) => ({ c: w(0, cv), t0, t1, side })) };
  });
  const sq = data.places?.square;
  const plazaArea = sq ? data.areas.find((a) => a.k === 'plaza' && pip(sq[0], sq[1], toPts(a.r[0]))) : undefined;
  const T = (p: Pt) => terrain.at(p[0], p[1]);
  return {
    lift, y0: T(apex) + lift, fountains: SQ.fountains.map(P), steps, axis, ovals: SQ.ovals.map(P), planters,
    lawn: [P(SQ.lawn[0]), P(SQ.lawn[1])], bollards: SQ.bollards.map(P), clock: P(SQ.clock), circle: P(SQ.circle), band: [bn, bs],
    plaza: plazaArea ? toPts(plazaArea.r[0]) : null,
  };
}

/** a stadium-shaped outline (an oval planter), w across, d along the square */
function stadium(c: Pt, axis: number, w: number, d: number): Pt[] {
  const U: Pt = [Math.cos(axis), -Math.sin(axis)], V: Pt = [Math.sin(axis), Math.cos(axis)], r = w / 2, h = d / 2 - r, out: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI + (Math.PI * i) / 12; out.push([r * Math.cos(a), -h + r * Math.sin(a)]); }
  for (let i = 0; i <= 12; i++) { const a = (Math.PI * i) / 12; out.push([r * Math.cos(a), h + r * Math.sin(a)]); }
  return out.map(([u, v]) => [c[0] + U[0] * u + V[0] * v, c[1] + U[1] * u + V[1] * v]);
}
const disc = (c: Pt, r: number, k = 20): Pt[] => Array.from({ length: k }, (_, i) => [c[0] + Math.cos((i / k) * Math.PI * 2) * r, c[1] + Math.sin((i / k) * Math.PI * 2) * r]);
const flat = (r: Pt[]): Flat => r.flatMap(([x, z]) => [x, z]);

/** Outlines and heights for walking collision: fountains, planters. */
export function squareFootprints(sl: SquareLayout): [Flat, number][] {
  const out: [Flat, number][] = [];
  for (const f of sl.fountains) out.push([flat(disc(f, FOUNTAIN.r)), FOUNTAIN.h + 0.1]);
  for (const c of sl.ovals) out.push([flat(stadium(c, sl.axis, OVAL.w, OVAL.d)), OVAL.h]);
  for (const p of sl.planters) for (const b of p.bands) out.push([flat(b), S.h]);
  return out;
}

/** The terrace and its steps for walking: absolute height, −∞ off them. */
export function squareGround(sl: SquareLayout): (x: number, z: number) => number {
  return (x, z) => {
    for (let k = sl.steps.length - 1; k >= 0; k--) if (pip(x, z, sl.steps[k])) return sl.y0 + (k + 1) * STEP.rise;
    return -Infinity;
  };
}

export function createSquare(sl: SquareLayout, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const group = new THREE.Group();
  /** see-through water: kept out of the ink lines (InkRenderer.skipNormal) */
  const noInk: THREE.Object3D[] = [];
  const T = (x: number, z: number) => terrain.at(x, z);
  const nightLit: THREE.MeshLambertMaterial[] = []; // clock faces: lit at night
  const M = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  /** an outline in world x/z raised as a prism from y to y + h */
  const prism = (ring: Pt[], y: number, h: number, holes: Pt[][] = []) => {
    const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const hr of holes) sh.holes.push(new THREE.Path(hr.map(([x, z]) => new THREE.Vector2(x, -z))));
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y, 0);
  };
  const ground = (p: Pt) => T(p[0], p[1]) + sl.lift;
  const slate = M('#55565b'), coping = M('#77787c');

  // ---------------- the terrace and its curved steps (light grey stone); buried 0.8 m for the slope
  const stepParts = sl.steps.map((r, k) => prism(r, sl.y0 - 0.8, 0.8 + (k + 1) * STEP.rise));
  add(stepParts, M('#c3bfb8'));

  // ---------------- the fountains
  const lathe = (pts: [number, number][], segs = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const { r: FR, h: FH } = FOUNTAIN;
  const wall: THREE.BufferGeometry[] = [], cap: THREE.BufferGeometry[] = [], blue: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
  const jetMat = M('#f4fbff', { transparent: true, opacity: 0.72, depthWrite: false, emissive: '#bfe3f2', emissiveIntensity: 0.25 });
  const jetMeshes: THREE.Mesh[] = [];
  for (const [fx, fz] of sl.fountains) {
    const y = T(fx, fz) + sl.lift - 0.05;
    // lathe profiles run so the normals face out (outer wall bottom → top) or in (inner wall top → bottom)
    wall.push(lathe([[FR, -0.4], [FR, FH]]).translate(fx, y, fz)); // slate brick, outside
    cap.push(lathe([[FR + 0.06, FH - 0.02], [FR + 0.06, FH + 0.08], [FR - 0.32, FH + 0.08]]).translate(fx, y, fz)); // coping
    blue.push(lathe([[FR - 0.32, FH + 0.08], [FR - 0.32, FH - 0.25]]).translate(fx, y, fz)); // painted inside
    water.push(new THREE.CircleGeometry(FR - 0.32, 40).rotateX(-Math.PI / 2).translate(fx, y + FH - 0.22, fz));
    // a crown of jets from round the rim, arching in over the middle; a short one in the middle
    const jets: THREE.BufferGeometry[] = [];
    const wy = FH - 0.2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(c * 1.65, wy, s * 1.65), new THREE.Vector3(c * 0.95, wy + 4.0, s * 0.95), new THREE.Vector3(-c * 0.15, wy + 0.05, -s * 0.15));
      jets.push(new THREE.TubeGeometry(curve, 18, 0.035, 5, false));
    }
    jets.push(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 6).translate(0, wy + 0.65, 0));
    jets.push(new THREE.SphereGeometry(0.75, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1).translate(0, wy, 0)); // foam
    const jm = new THREE.Mesh(mergeGeometries(jets.map((g) => (g.index ? g.toNonIndexed() : g))), jetMat);
    jm.position.set(fx, y, fz);
    group.add(jm);
    noInk.push(jm);
    jetMeshes.push(jm);
  }
  add(wall, slate);
  add(cap, coping);
  add(blue, M('#2f8fc8', { side: THREE.DoubleSide }), false);
  add(water, M('#4fb0de', { emissive: '#1d5f80', emissiveIntensity: 0.15 }), false);

  // ---------------- ball bollards along the kerb, about 0.6 m across, every 2 m (photo of 2019)
  const balls: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < sl.bollards.length; i++) {
    const [a, b] = [sl.bollards[i], sl.bollards[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(len / 2.0));
    for (let j = i ? 1 : 0; j <= k; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / k, z = a[1] + ((b[1] - a[1]) * j) / k;
      balls.push(new THREE.SphereGeometry(0.3, 14, 10).translate(x, ground([x, z]) + 0.27, z));
    }
  }
  add(balls, M('#2c2d31'));

  // ---------------- planters
  const flowerRed = M('#c22238'), flowerDeep = M('#9e1a2c'), bush = M('#4d7e3a'), soil = M('#5a4532'), wood = M('#8a5a35');
  const reds: THREE.BufferGeometry[] = [], deep: THREE.BufferGeometry[] = [], walls: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [];
  const bushes: THREE.BufferGeometry[] = [], soils: THREE.BufferGeometry[] = [], seats: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the S planters: slate walls with a light coping, a mound of red begonias, a wooden seat in each curl
  for (const p of sl.planters) {
    const y = Math.min(...p.bands.flat().map(ground)) - 0.05;
    for (const b of p.bands) walls.push(prism(b, y - 0.4, S.h + 0.4));
    for (const { c, t0, t1, side } of p.arcs) {
      const U: Pt = [Math.cos(sl.axis), -Math.sin(sl.axis)], V: Pt = [Math.sin(sl.axis), Math.cos(sl.axis)];
      const at = (R: number, t: number): Pt => [c[0] + U[0] * side * R * Math.cos(t) + V[0] * R * Math.sin(t), c[1] + U[1] * side * R * Math.cos(t) + V[1] * R * Math.sin(t)];
      const sector = (r0: number, r1: number, ta: number, tb: number, k = 24) => {
        const out: Pt[] = [];
        for (let i = 0; i <= k; i++) out.push(at(r1, ta + ((tb - ta) * i) / k));
        for (let i = k; i >= 0; i--) out.push(at(r0, ta + ((tb - ta) * i) / k));
        return out;
      };
      caps.push(prism(sector(S.r - S.w / 2 - 0.03, S.r + S.w / 2 + 0.03, t0, t1), y + S.h - 0.02, 0.08));
      reds.push(prism(sector(S.r - S.w / 2 + 0.14, S.r + S.w / 2 - 0.14, t0 + 0.05, t1 - 0.05), y + S.h, 0.14));
      // the flowers' lumps along the band
      for (const R of [S.r - 0.3, S.r, S.r + 0.3]) {
        const k = Math.floor(((t1 - t0 - 0.12) * R) / 0.36);
        for (let i = 0; i <= k; i++) {
          const [x, z] = at(R + (rnd() - 0.5) * 0.12, t0 + 0.06 + ((t1 - t0 - 0.12) * i) / k);
          (rnd() < 0.3 ? deep : reds).push(new THREE.IcosahedronGeometry(0.2 + rnd() * 0.05, 0).translate(x, y + S.h + 0.17, z));
        }
      }
      // the seat along the curl's inner wall
      seats.push(prism(sector(S.r - S.w / 2 - 0.48, S.r - S.w / 2, t0 + 0.4, t1 - 0.4), y + 0.38, 0.07));
      seats.push(prism(sector(S.r - S.w / 2 - 0.4, S.r - S.w / 2, t0 + 0.45, t1 - 0.45), y - 0.3, 0.68)); // its front, set back
    }
  }
  // the oval planters: low slate walls, two clipped bushes, flowers round the edge
  for (const c of sl.ovals) {
    const y = Math.min(...stadium(c, sl.axis, OVAL.w, OVAL.d).map(ground)) - 0.05;
    const out = stadium(c, sl.axis, OVAL.w, OVAL.d), inner = stadium(c, sl.axis, OVAL.w - 0.3, OVAL.d - 0.3);
    walls.push(prism(out, y - 0.4, OVAL.h + 0.4, [inner]));
    soils.push(prism(inner, y - 0.4, OVAL.h + 0.33));
    const V: Pt = [Math.sin(sl.axis), Math.cos(sl.axis)];
    for (const v of [-1.15, 1.15]) bushes.push(new THREE.IcosahedronGeometry(0.72, 1).scale(1, 0.9, 1).translate(c[0] + V[0] * v, y + OVAL.h + 0.55, c[1] + V[1] * v));
    const ring = stadium(c, sl.axis, OVAL.w - 0.65, OVAL.d - 0.65);
    for (let i = 0; i < ring.length; i += 2) { const [x, z] = ring[i]; (i % 4 ? reds : deep).push(new THREE.IcosahedronGeometry(0.16, 0).translate(x, y + OVAL.h + 0.08, z)); }
  }
  add(walls, slate);
  add(caps, coping);
  add(soils, soil, false);
  add(reds, flowerRed);
  add(deep, flowerDeep);
  add(bushes, bush);
  add(seats, wood);

  // ---------------- the lawn strip on the west side: a slate kerb, grass, young trees; globe lamps and
  // dark benches along its east side, facing the square
  const [la, lb] = sl.lawn;
  const ldx = lb[0] - la[0], ldz = lb[1] - la[1], ll = Math.hypot(ldx, ldz), lu: Pt = [ldx / ll, ldz / ll], ln: Pt = [-lu[1], lu[0]];
  const rect = (hw: number, ext = 0): Pt[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => {
    const along = t < 0 ? -ext : ll + ext, x = la[0] + lu[0] * along + ln[0] * s * hw, z = la[1] + lu[1] * along + ln[1] * s * hw;
    return [x, z] as Pt;
  });
  const ly = Math.min(...rect(LAWN_W / 2).map(ground)) - 0.05;
  const kerb = rect(LAWN_W / 2), grassR = rect(LAWN_W / 2 - 0.18, -0.18);
  add([prism(kerb, ly - 0.4, 0.62, [grassR])], slate);
  add([prism(grassR, ly - 0.4, 0.55)], M('#86b553'), false);
  const trunks: THREE.BufferGeometry[] = [], crowns: THREE.BufferGeometry[] = [], poles: THREE.BufferGeometry[] = [], globes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5, x = la[0] + ldx * t, z = la[1] + ldz * t, y = ly + 0.15;
    trunks.push(new THREE.CylinderGeometry(0.07, 0.1, 1.7, 6).translate(x, y + 0.85, z));
    crowns.push(new THREE.IcosahedronGeometry(0.85, 1).scale(1, 1.2, 1).translate(x, y + 2.35, z));
  }
  const lamp = (x: number, z: number) => {
    const y = T(x, z) + sl.lift;
    poles.push(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 6).translate(x, y + 1.7, z));
    globes.push(new THREE.SphereGeometry(0.24, 14, 10).translate(x, y + 3.6, z));
  };
  const east = ln[0] > 0 ? 1 : -1; // ln points across the strip; the square is to the east
  for (const t of [0.12, 0.37, 0.63, 0.88]) lamp(la[0] + ldx * t + ln[0] * east * 2.0, la[1] + ldz * t + ln[1] * east * 2.0);
  const benches: THREE.BufferGeometry[] = [];
  for (const t of [0.25, 0.5, 0.75]) {
    const x = la[0] + ldx * t + ln[0] * east * 2.1, z = la[1] + ldz * t + ln[1] * east * 2.1, y = T(x, z) + sl.lift;
    const g = [new THREE.BoxGeometry(0.5, 0.42, 1.8).translate(0, 0.21, 0), new THREE.BoxGeometry(0.1, 0.45, 1.8).translate(0.22 * east, 0.62, 0)] // seat, back on the lawn side;
    for (const b of g) benches.push(b.rotateY(Math.atan2(lu[0], lu[1])).translate(x, y, z));
  }
  {
    const pc: Pt = [(sl.planters[0].arcs[0].c[0] + sl.planters[1].arcs[0].c[0]) / 2, (sl.planters[0].arcs[0].c[1] + sl.planters[1].arcs[0].c[1]) / 2];
    const U: Pt = [Math.cos(sl.axis), -Math.sin(sl.axis)], V: Pt = [Math.sin(sl.axis), Math.cos(sl.axis)];
    for (const su of [-1, 1]) for (const sv of [0, 2 * S.r]) lamp(pc[0] + U[0] * su * (S.gap / 2 + 3.6) + V[0] * sv, pc[1] + U[1] * su * (S.gap / 2 + 3.6) + V[1] * sv);
  }
  add(trunks, M('#6b4a33'));
  add(crowns, M('#5e8c41'));
  const black = M('#2a2b2e');
  add(poles, black);
  add(benches, M('#3b3c40'));
  const globeMat = M('#f6f3ea', { emissive: '#ffe2a8', emissiveIntensity: 0 });
  add(globes, globeMat, false);

  // ---------------- the street clock at the north end: a black post, a round head with two faces
  {
    const [cx, cz] = sl.clock, y = T(cx, cz) + sl.lift;
    const parts = [new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8).translate(0, 1.6, 0), new THREE.CylinderGeometry(0.46, 0.46, 0.18, 24).rotateX(Math.PI / 2).translate(0, 3.6, 0)];
    const head = add(parts, black);
    const faces = add([0.095, -0.095].map((s) => new THREE.CircleGeometry(0.38, 24).rotateY(s > 0 ? 0 : Math.PI).translate(0, 3.6, s)), M('#f7f4ec', { emissive: '#fff1cc', emissiveIntensity: 0 }), false);
    const hands = add([0.1, -0.1].flatMap((s) => [new THREE.BoxGeometry(0.03, 0.26, 0.01).translate(0, 3.69, s), new THREE.BoxGeometry(0.2, 0.03, 0.01).translate(0.08, 3.6, s)]), black, false);
    for (const mesh of [head, faces, hands]) if (mesh) { mesh.position.set(cx, y, cz); mesh.rotation.y = sl.axis; }
    if (faces) nightLit.push(faces.material as THREE.MeshLambertMaterial);
  }

  // ---------------- darker bands in the paving, inside the square's outline
  const bandParts: number[] = [];
  const clip = sl.plaza;
  const inside = (x: number, z: number) => !clip || pip(x, z, clip);
  const quad = (p: Pt[], depth = 0) => {
    const ins = p.map(([x, z]) => inside(x, z));
    if (ins.every((v) => !v) && depth > 0) return;
    if (!ins.every(Boolean)) {
      if (depth >= 2) return;
      const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [A, B, C, D] = p, ab = mid(A, B), bc = mid(B, C), cd = mid(C, D), da = mid(D, A), o = mid(ab, cd);
      for (const q of [[A, ab, o, da], [ab, B, bc, o], [o, bc, C, cd], [da, o, cd, D]] as Pt[][]) quad(q, depth + 1);
      return;
    }
    const v = p.map(([x, z]) => [x, T(x, z) + sl.lift + 0.03, z]);
    bandParts.push(...v[0], ...v[2], ...v[1], ...v[0], ...v[3], ...v[2]);
  };
  /** a band of width w along a path, cut into cells about 1 m long */
  const band = (path: Pt[], w: number) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const [a, b] = [path[i], path[i + 1]], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const nx = -dz / len, nz = dx / len, k = Math.max(1, Math.ceil(len)), m = Math.max(1, Math.ceil(w / 1.2));
      for (let j = 0; j < k; j++) for (let q = 0; q < m; q++) {
        const t0 = j / k, t1 = (j + 1) / k, o0 = -w / 2 + (w * q) / m, o1 = -w / 2 + (w * (q + 1)) / m;
        const pt = (t: number, o: number): Pt => [a[0] + dx * t + nx * o, a[1] + dz * t + nz * o];
        quad([pt(t0, o0), pt(t1, o0), pt(t1, o1), pt(t0, o1)]);
      }
    }
  };
  const circlePath = (c: Pt, r: number): Pt[] => {
    const k = Math.ceil(2 * Math.PI * r);
    return Array.from({ length: k + 1 }, (_, i): Pt => [c[0] + Math.cos((i / k) * Math.PI * 2) * r, c[1] + Math.sin((i / k) * Math.PI * 2) * r]);
  };
  band(sl.band, 4.2); // along the square
  for (const r of [5, 12.3, 27.5]) band(circlePath(sl.circle, r), r === 5 ? 0.5 : 0.6); // round the circle at the north end
  {
    const [a, b] = sl.band, dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    for (let d = 34; d < len - 4; d += 10) { // cross lines south of the arcs
      const cx = a[0] + ux * d, cz = a[1] + uz * d;
      band([[cx - uz * 30, cz + ux * 30], [cx + uz * 30, cz - ux * 30]], 0.32);
    }
  }
  if (bandParts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bandParts, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, M('#aaa7a1'));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  let time = 0;
  return {
    group,
    noInk,
    update(dt: number) {
      time += dt;
      // the jets breathe a little
      for (let i = 0; i < jetMeshes.length; i++) jetMeshes[i].scale.y = 1 + 0.04 * Math.sin(time * 2.3 + i * 1.7);
      globeMat.emissiveIntensity = SHARED.uNight.value * 0.9;
      for (const m of nightLit) m.emissiveIntensity = SHARED.uNight.value * 0.7;
    },
  };
}
