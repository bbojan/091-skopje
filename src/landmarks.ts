import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toPts, obb, pip } from './geo.ts';
import { SHARED, MODELLED_BUILDINGS, HEROES_TURN, areaLift, roadLift, isPaintedArea } from './city.ts';
import type { Terrain } from './terrain.ts';
import { squareLayout, createSquare, squareFootprints, squareGround, townhallPlan } from './square.ts';
import { canalLayout, createCanal, canalWalkGround, canalFootprints } from './river.ts';
import { marketFrame, createMarket, marketFootprints, marketGround } from './market.ts';
import type { BuildingData, CityData, Flat, Pt, Vec3 } from './types.ts';

// Hand-built models for landmarks that OSM can only describe as outlines.
const UP = new THREE.Vector3(0, 1, 0);

// a thin box beam from a to b (for lattices, cables, legs)
function beam(a: Vec3, b: Vec3, t = 0.5): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(t, A.distanceTo(B), t);
  const m = new THREE.Matrix4().compose(
    A.clone().add(B).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()),
    new THREE.Vector3(1, 1, 1)
  );
  return g.applyMatrix4(m);
}

interface LatticeSpec {
  origin: THREE.Vector3;
  /** unit direction of the member */
  axis: THREE.Vector3;
  /** unit vector perpendicular to the axis */
  side: THREE.Vector3;
  w: number;
  len: number;
  seg: number;
  t?: number;
}

// square lattice tower between y0..y1 along the given axis frame
function lattice(out: THREE.BufferGeometry[], { origin, axis, side, w, len, seg, t = 0.55 }: LatticeSpec): void {
  const third = new THREE.Vector3().crossVectors(axis, side).normalize();
  const corner = (u: number, s: number, k: number): Vec3 => origin.clone().addScaledVector(axis, u).addScaledVector(side, s * w / 2).addScaledVector(third, k * w / 2).toArray();
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [s, k] of C) out.push(beam(corner(0, s, k), corner(len, s, k), t * 1.3));
  const n = Math.max(1, Math.round(len / seg));
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * len, u2 = ((i + 1) / n) * len;
    for (let c = 0; c < 4; c++) {
      const [s0, k0] = C[c], [s1, k1] = C[(c + 1) % 4];
      out.push(beam(corner(u, s0, k0), corner(u, s1, k1), t));
      if (i < n) {
        out.push(beam(corner(u, s0, k0), corner(u2, s1, k1), t * 0.8));
        out.push(beam(corner(u, s1, k1), corner(u2, s0, k0), t * 0.8));
      }
    }
  }
}

const flatten = (gs: THREE.BufferGeometry[]) => gs.map((g) => (g.index ? g.toNonIndexed() : g));

/** Kavadarci, Спомен-парк Ваташа (Moklište): the busts of the 12 youths shot on 16 June 1943, unveiled on
 *  16 June 2023 (sculptors Kiril Mukaetov and Dimitar Samardžiev). They stand on white pedestals in an arc
 *  round the lawn in front of the memorial, about 2.3 m apart: read off an aerial image (Esri World
 *  Imagery), lat/lon west to east; they face the lawn's middle. */
const VATASA_BUSTS: [lat: number, lon: number][] = [
  [41.401607, 22.028342], [41.401609, 22.028369], [41.401611, 22.028397], [41.401613, 22.028424],
  [41.401611, 22.028451], [41.401606, 22.028478], [41.401597, 22.028502], [41.401588, 22.028526],
  [41.401577, 22.028550], [41.401566, 22.028572], [41.401553, 22.028594], [41.401538, 22.028613],
];
const VATASA_LAWN: [lat: number, lon: number] = [41.4015, 22.028447];
/** the busts' positions and turns (local +z toward the lawn), when the city has the Vataša memorial */
function vatasaBusts(data: CityData): { x: number; z: number; rot: number }[] {
  if (!data.landmarks?.vatasa) return [];
  const m = data.meta, P = ([lat, lon]: [number, number]): Pt => [(lon - m.lon0) * m.kx, -(lat - m.lat0) * m.ky];
  const [lx, lz] = P(VATASA_LAWN);
  return VATASA_BUSTS.map(P).map(([x, z]) => ({ x, z, rot: Math.atan2(lx - x, lz - z) }));
}

// ---------------- Kavadarci, the memorial to Kiro Krstev and Dimče Mirčev: the layout shared by
// the model, walking collision and the walking ground. Local frame: origin at the OSM node, +z
// down the steps (HEROES_TURN), heights from the bare terrain at the node. The elevation data is
// flat here (~0.3 m), but the photos show ~14 steps: the terrace is raised by the model, ~2 m above
// the draped paths (which sit PATH_LIFT above the bare terrain).
const PATH_LIFT = roadLift('path', 0);
const HZ = {
  H: PATH_LIFT + 1.95, // terrace height
  top: [-6.2, 8.4, -5.4, 3.6] as const, // terrace x0, x1, z0, z1: the OSM footway ring round the monument
  bank: 2.6, under: 0.8, // the grass bank: run outward, depth below the ground
  stairs: { cx: 3.5, w: 4.4, tread: 0.38 }, // the OSM steps arrive at x ≈ 3.5
  ramp: { cx: 0.5, w: 2.6, len: 8 }, // the OSM path into the park leaves at x ≈ 0.5
};
function heroesFrame(data: CityData, terrain: Terrain) {
  const p = data.landmarks?.heroes;
  if (!p) return null;
  const [x, z] = p, rot = HEROES_TURN, c = Math.cos(rot), s = Math.sin(rot);
  const world = (lx: number, lz: number): Pt => [x + lx * c + lz * s, z - lx * s + lz * c];
  const local = (wx: number, wz: number): Pt => { const dx = wx - x, dz = wz - z; return [dx * c - dz * s, dx * s + dz * c]; };
  const y0 = terrain.at(x, z), at = (lx: number, lz: number) => terrain.at(...world(lx, lz)) - y0;
  const { H, top: [, , z0, z1], stairs: st, ramp } = HZ;
  const n = Math.max(6, Math.round((H - PATH_LIFT - at(st.cx, z1 + 5)) / 0.155)); // risers, the last one up from the path
  const run = (n - 1) * st.tread, yb = at(st.cx, z1 + run) + PATH_LIFT, rise = (H - yb) / n;
  return { x, z, y0, rot, world, local, n, run, yb, rise, rb: at(ramp.cx, z0 - ramp.len) + PATH_LIFT };
}

/** Kavadarci, the city stadium: what the model, the collision and the clearing share. Local frame:
 *  +x east along the pitch, +z south; the stands start `front` m off the grass. */
const STAD = {
  front: 2.5,
  north: { u0: 24, u1: -40, rows: 10, tread: 0.75, rise: 0.38 }, // old covered stand; its back wall 0.4 m
  east: { R: 16, rows: 9, tread: 0.72, rise: 0.35, end: 8 }, // ends `end` m short of the south side; brick wall behind
  south: { u0: -32, u1: 32, rows: 8, tread: 0.8, rise: 0.4 }, // 2023, white canopy
  clubs: [[-13, 8, 11, 10, 6.4], [-11, -14, 9, 24, 3.6]] as const, // [u from the west end, v, w, d, h]: clubhouse, the long building north of it
};
/** Kavadarci, the city stadium: the pitch's oriented box; local +x east along the long side, +z south. */
function stadiumFrame(data: CityData) {
  const r = data.landmarks?.stadium;
  const o = r ? obb(toPts(r)) : null;
  if (!o) return null;
  const a: Pt = o.a[0] < 0 ? [-o.a[0], -o.a[1]] : o.a;
  const rot = Math.atan2(-a[1], a[0]), cs = Math.cos(rot), sn = Math.sin(rot);
  const world = (u: number, v: number): Pt => [o.c[0] + u * cs + v * sn, o.c[1] - u * sn + v * cs];
  const { front, north: N, east: E, south: S } = STAD, hl = o.L, hw = o.W;
  const nd = N.rows * N.tread + 0.4, ed = E.rows * E.tread + 1.1, sd = S.rows * S.tread + 0.25, eu = hl + front, nv = -hw - front;
  /** walking collision: [u0, u1, v0, v1] */
  const blocks: [number, number, number, number][] = [
    [N.u1, N.u0, nv - nd, nv], [S.u0, S.u1, hw + front, hw + front + sd],
    [eu, eu + ed, nv + E.R, hw - E.end], [N.u0, eu + ed, nv - ed, nv + E.R],
    ...STAD.clubs.map(([u, v, w, d]): [number, number, number, number] => [-hl + u - w / 2, -hl + u + w / 2, v - d / 2, v + d / 2]),
  ];
  return { c: o.c, a, rot, L: hl, W: hw, world, blocks };
}

/** Raised ground of modelled monuments for walking (absolute height, −∞ off them), or null. */
export function landmarkGround(data: CityData, terrain: Terrain): ((x: number, z: number) => number) | null {
  const sl = squareLayout(data, terrain), square = sl ? squareGround(sl) : null; // Kavadarci: the town hall's terrace
  const mf = marketFrame(data, terrain), deck = mf ? marketGround(mf) : null; // the market's deck
  const terrace0 = square && deck ? (x: number, z: number) => Math.max(square(x, z), deck(x, z)) : square || deck;
  const cl = canalLayout(data, terrain), canal = cl ? canalWalkGround(cl, terrain) : null; // the Луда Мара's promenades, footbridges
  const terrace = terrace0 && canal ? (x: number, z: number) => Math.max(terrace0(x, z), canal(x, z)) : terrace0 || canal;
  const f = heroesFrame(data, terrain);
  if (!f) return terrace;
  const { H, bank, under, top: [x0, x1, z0, z1], stairs: st, ramp } = HZ;
  const heroes = (x: number, z: number) => {
    const [lx, lz] = f.local(x, z);
    if (Math.abs(lx) > 25 || Math.abs(lz) > 25) return -Infinity;
    let h = -Infinity;
    const d = Math.max(x0 - lx, lx - x1, z0 - lz, lz - z1, 0);
    if (d < bank) h = H - (d * (H + under)) / bank;
    if (Math.abs(lx - st.cx) < st.w / 2 && lz >= z1 && lz <= z1 + f.run) h = Math.max(h, H - ((lz - z1) / st.tread) * f.rise);
    if (Math.abs(lx - ramp.cx) < ramp.w / 2 && lz <= z0 && lz >= z0 - ramp.len) h = Math.max(h, H - ((z0 - lz) / ramp.len) * (H - f.rb));
    return f.y0 + h;
  };
  return terrace ? (x, z) => Math.max(heroes(x, z), terrace(x, z)) : heroes;
}

/** Outlines of modelled buildings that are not (or no longer) OSM buildings, so walking collides with them. */
export function landmarkFootprints(data: CityData, terrain: Terrain): BuildingData[] {
  const L = data.landmarks || {}, out: BuildingData[] = [];
  const add = (r: Flat, h: number) => out.push({ id: -1 - out.length, r: [r], h, mh: 0, lv: 2, old: 0, t: 'yes', rs: null, w: null, c: null });
  const hall = townhallPlan(data);
  if (hall) add(hall.ring.flatMap(([x, z]) => [x, z]), 12.6); // the model follows this outline
  if (L.culture) {
    const [x, z, rot] = L.culture, c = Math.cos(rot), s = Math.sin(rot);
    const rect = (x0: number, x1: number, z0: number, z1: number): Flat =>
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].flatMap(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    for (const [x0, x1, z0, z1] of [[-7.55, 7.55, -20.7, 20.7], [7.55, 16.1, -20.7, -7.73], [7.55, 13.5, -6.13, 0.34], [7.55, 16.1, 8.2, 17.0], [-11.25, -7.55, -2.5, 0.7]])
      add(rect(x0, x1, z0, z1), 7);
  }
  const sf = stadiumFrame(data);
  if (sf) for (const [u0, u1, v0, v1] of sf.blocks) add([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].flatMap(([u, v]) => sf.world(u, v)), 6); // stands, clubhouse
  const hf = heroesFrame(data, terrain);
  if (hf) { // the slab on its piers, the low wall, the pillar, the pylon, the walls along the steps
    const { stairs: st, top: [, , , z1] } = HZ, px = st.cx + st.w / 2 + 0.25;
    const parts = [[-4.25, 2.8, -0.35, 0.35], [1.49, 4.6, -0.55, 0.75], [px - 0.55, px + 0.55, -0.75, 0.15], [-2.8, -2.2, -3.7, -3.3]];
    for (const sd of [-1, 1]) { const wx = st.cx + sd * (st.w / 2 + 0.25); parts.push([wx - 0.25, wx + 0.25, z1 - 0.6, z1 + hf.run + 0.3]); }
    for (const [x0, x1, z0, z1] of parts) add([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].flatMap(([lx, lz]) => hf.world(lx, lz)), 3);
  }
  for (const { x, z, rot } of vatasaBusts(data)) { // the pedestals of the 12 busts at Vataša
    const c = Math.cos(rot), s = Math.sin(rot);
    add([[-0.43, -0.43], [0.43, -0.43], [0.43, 0.43], [-0.43, 0.43]].flatMap(([u, v]) => [x + u * c + v * s, z - u * s + v * c]), 2.1);
  }
  const sl = squareLayout(data, terrain); // Kavadarci: the square's fountains and planters
  if (sl) for (const [r, h] of squareFootprints(sl)) add(r, h);
  const mf = marketFrame(data, terrain); // the market's shops and stairs block (they stand on the deck)
  if (mf) for (const [r, h] of marketFootprints(mf)) add(r, mf.y - terrain.at(r[0], r[1]) + h);
  const cl = canalLayout(data, terrain); // the Луда Мара's channel, open at the bridges
  if (cl) for (const b of canalFootprints(cl)) out.push({ ...b, id: -1 - out.length });
  return out;
}

export interface LandmarkOptions {
  data: CityData;
  terrain: Terrain;
  clippingPlanes: THREE.Plane[];
}

export function createLandmarks({ data, terrain, clippingPlanes }: LandmarkOptions) {
  const group = new THREE.Group();
  const T = (x: number, z: number) => terrain.at(x, z);
  const Tp = (p: Pt) => terrain.at(p[0], p[1]);
  const L = data.landmarks || {};
  const M = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  const animated: ((dt: number) => void)[] = [];

  // ---------------- Millennium Cross: white steel lattice, lit at night
  const mc = (data.crosses || []).find((c) => /Millennium|Милениум/.test(c.name));
  let crossMat: THREE.MeshLambertMaterial | null = null;
  let stationGlass: THREE.MeshLambertMaterial | null = null; // concourse glows at night
  let gondola: THREE.CatmullRomCurve3 | null = null; // the cable line (for riding it)
  if (mc) {
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.Vector3(mc.x, T(mc.x, mc.z) - 0.5, mc.z);
    const H = mc.h, w = 5.2;
    lattice(parts, { origin: base.clone().add(new THREE.Vector3(0, 3, 0)), axis: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(1, 0, 0), w, len: H, seg: 5.5 });
    const armY = 3 + H * 0.66, arm = H * 0.24;
    lattice(parts, { origin: base.clone().add(new THREE.Vector3(-arm - w / 2, armY, 0)), axis: new THREE.Vector3(1, 0, 0), side: new THREE.Vector3(0, 1, 0), w, len: arm * 2 + w, seg: 5.5 });
    crossMat = M('#f7f4ee', { emissive: '#ffe9b0', emissiveIntensity: 0 });
    add(mergeGeometries(parts), crossMat);
    add(new THREE.CylinderGeometry(11, 12, 3, 24).translate(base.x, base.y + 1.5, base.z), M('#d9cdb8'));
  }

  // ---------------- Warrior on a Horse on its column, in the Square fountain
  if (L.warrior) {
    const [x, z] = L.warrior;
    const y = T(x, z);
    const stone = M('#efe6d4'), bronze = M('#8d6b3e', { emissive: '#2a1d0e' });
    add(new THREE.CylinderGeometry(6, 6.6, 3.2, 24).translate(x, y + 1.6, z), stone);
    add(new THREE.CylinderGeometry(3.1, 3.4, 5, 20).translate(x, y + 5.7, z), stone);
    add(new THREE.CylinderGeometry(2.2, 2.6, 14, 20).translate(x, y + 15.2, z), stone);
    add(new THREE.CylinderGeometry(3.2, 2.4, 1.6, 20).translate(x, y + 23, z), stone);
    // rearing horse + rider, built facing +x then turned toward the square
    const s: THREE.BufferGeometry[] = [];
    const ell = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, rz = 0) =>
      s.push(new THREE.SphereGeometry(1, 14, 10).scale(sx, sy, sz).rotateZ(rz).translate(px, py, pz));
    ell(3.4, 1.7, 1.5, 0, 3.4, 0, 0.45); // body, reared up
    ell(0.8, 2.2, 0.8, 2.6, 6.0, 0, -0.5); // neck
    ell(1.4, 0.75, 0.7, 3.6, 7.4, 0, -0.2); // head
    for (const zz of [-0.7, 0.7]) {
      s.push(beam([-2.3, 2.0, zz], [-2.8, -0.2, zz * 1.2], 0.6)); // hind legs on the plinth
      s.push(beam([1.8, 4.0, zz], [3.4, 3.2, zz], 0.55)); // raised front legs
    }
    ell(0.9, 1.6, 0.9, -0.4, 6.3, 0); // rider torso
    ell(0.55, 0.6, 0.55, -0.3, 8.4, 0); // head
    s.push(beam([-0.2, 7.2, -0.6], [1.6, 10.5, -0.9], 0.35)); // raised sword arm
    const statue = mergeGeometries(flatten(s));
    statue.scale(1.35, 1.35, 1.35);
    const sm = add(statue, bronze);
    sm.position.set(x, y + 23.8, z);
    sm.rotation.y = -Math.PI * 0.6;
  }

  // ---------------- Stone Bridge: arched stone deck across the Vardar
  if (L.stoneBridge) {
    const pts = toPts(L.stoneBridge);
    const a = pts[0], b = pts[pts.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 8;
    const ends = Math.max(Tp(a), Tp(b));
    let low = Infinity;
    for (let i = 0; i <= 20; i++) { const t = i / 20; low = Math.min(low, T(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); }
    // gently humped deck: low at the banks, ~8 m over the water mid-river
    const foot = low - 4;
    const endH = ends + 1.2 - foot, midH = Math.max(endH + 2, low + 8.5 - foot);
    const deckAt = (u: number) => endH + (midH - endH) * Math.sin((Math.PI * u) / len);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0);
    for (let i = 24; i >= 0; i--) shape.lineTo((len * i) / 24, deckAt((len * i) / 24));
    shape.closePath();
    const spans = Math.max(4, Math.round(len / 18)), sw = len / spans;
    for (let i = 0; i < spans; i++) {
      const cx = sw * (i + 0.5), r = sw * 0.36, top = Math.min(deckAt(cx) - 1.8, 1.0 + r * 1.6);
      if (top - r < 0.5) continue;
      const hole = new THREE.Path();
      hole.moveTo(cx - r, 0.0);
      hole.lineTo(cx - r, top - r);
      hole.absarc(cx, top - r, r, Math.PI, 0, true);
      hole.lineTo(cx + r, 0.0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const width = 7;
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 10 });
    g.translate(-len / 2, foot, -width / 2);
    // parapets following the hump
    const parts = [g.toNonIndexed()];
    for (let i = 0; i < 24; i++) {
      const u0 = (len * i) / 24, u1 = (len * (i + 1)) / 24;
      for (const zz of [width / 2 - 0.25, -width / 2 + 0.25])
        parts.push(beam([u0 - len / 2, foot + deckAt(u0) + 0.5, zz], [u1 - len / 2, foot + deckAt(u1) + 0.5, zz], 0.5).toNonIndexed());
    }
    const g2 = mergeGeometries(parts);
    const m = add(g2, M('#e2cfa6'));
    m.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  }

  // ---------------- Porta Macedonia: triumphal arch
  if (L.porta) {
    const ring = toPts(L.porta);
    const ob = obb(ring);
    if (ob) {
      const Lx = ob.L * 2, Wz = ob.W * 2, H = 21, y = T(ob.c[0], ob.c[1]);
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(Lx, 0); s.lineTo(Lx, H); s.lineTo(0, H); s.closePath();
      const r = Lx * 0.2, top = H * 0.62;
      const hole = new THREE.Path();
      hole.moveTo(Lx / 2 - r, 0); hole.lineTo(Lx / 2 - r, top - r); hole.absarc(Lx / 2, top - r, r, Math.PI, 0, true); hole.lineTo(Lx / 2 + r, 0); hole.closePath();
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: Wz, bevelEnabled: false, curveSegments: 12 });
      g.translate(-Lx / 2, 0, -Wz / 2);
      const cornice = new THREE.BoxGeometry(Lx + 1.2, 1.2, Wz + 1.2).translate(0, H * 0.8, 0);
      const attic = new THREE.BoxGeometry(Lx * 0.9, 2.6, Wz * 0.9).translate(0, H + 1.3, 0);
      const m = add(mergeGeometries([g.toNonIndexed(), cornice.toNonIndexed(), attic.toNonIndexed()]), M('#f3eee4'));
      m.position.set(ob.c[0], y - 0.3, ob.c[1]);
      m.rotation.y = -Math.atan2(ob.a[1], ob.a[0]);
    }
  }

  // ---------------- Railway station (Kenzo Tange, 1981): an elevated concrete track deck on
  // rows of tapering piers, a glazed concourse underneath, platform canopies on top.
  // Built in the OSM footprint's frame (x along the tracks).
  const stationB = data.buildings.find((b) => b.id === 144759771 && MODELLED_BUILDINGS.has(b.id));
  if (stationB) {
    const ob = obb(toPts(stationB.r[0]));
    if (ob) {
      const len = ob.L * 2, wid = ob.W * 2, deckY = 10, deckT = 2.2;
      const concrete: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
      // the deck with a thick edge beam on both sides
      concrete.push(new THREE.BoxGeometry(len, deckT, wid * 0.92).translate(0, deckY + deckT / 2, 0));
      for (const sz of [-1, 1]) concrete.push(new THREE.BoxGeometry(len + 2, 1.6, 1.4).translate(0, deckY + deckT + 0.8, sz * wid * 0.46));
      // tapering piers, wider at the top (square truncated pyramids)
      const pier = new THREE.CylinderGeometry(2.3, 1.2, deckY, 4, 1).rotateY(Math.PI / 4);
      const nP = Math.max(3, Math.round(len / 15));
      for (let i = 0; i < nP; i++) {
        const x = -len / 2 + (len * (i + 0.5)) / nP;
        for (const sz of [-1, 1]) concrete.push(pier.clone().translate(x, deckY / 2, sz * wid * 0.3));
      }
      // concourse: glass box between the piers, with a concrete roof band
      glass.push(new THREE.BoxGeometry(len * 0.72, 6.5, wid * 0.38).translate(0, 3.25, 0));
      concrete.push(new THREE.BoxGeometry(len * 0.74, 1.2, wid * 0.42).translate(0, 7.1, 0));
      // tracks and platforms on the deck
      const top = deckY + deckT;
      for (let k = 0; k < 4; k++) dark.push(new THREE.BoxGeometry(len, 0.25, 1.6).translate(0, top + 0.12, -wid * 0.33 + (k * wid * 0.66) / 3));
      for (let k = 0; k < 3; k++) {
        const zc = -wid * 0.22 + k * wid * 0.22;
        concrete.push(new THREE.BoxGeometry(len * 0.9, 0.9, 4).translate(0, top + 0.45, zc)); // platform
        concrete.push(new THREE.BoxGeometry(len * 0.8, 0.35, 6.5).translate(0, top + 5.2, zc)); // canopy
        for (let i = 0; i < 6; i++) concrete.push(new THREE.BoxGeometry(0.5, 4.5, 0.5).translate(-len * 0.38 + (i * len * 0.76) / 5, top + 3, zc));
      }
      const y = T(ob.c[0], ob.c[1]) - 0.4, rot = -Math.atan2(ob.a[1], ob.a[0]);
      for (const [parts, mat] of [[concrete, M('#d8d1c4')], [dark, M('#5a5450')], [glass, M('#4f6274', { emissive: '#ffcf7a', emissiveIntensity: 0 })]] as const) {
        const mesh = add(mergeGeometries(flatten(parts)), mat);
        mesh.position.set(ob.c[0], y, ob.c[1]);
        mesh.rotation.y = rot;
        if (parts === glass) stationGlass = mesh.material as THREE.MeshLambertMaterial;
      }
    }
  }

  // ---------------- Vodno gondola: cable, pylons and moving cabins
  if (L.gondola) {
    const line = toPts(L.gondola);
    const pylons = L.pylons ? toPts(L.pylons) : [];
    const ends = [line[0], line[line.length - 1]];
    const isStation = (p: Pt) => ends.some((e) => Math.hypot(e[0] - p[0], e[1] - p[1]) < 5);
    const cableH = (p: Pt) => Tp(p) + (isStation(p) ? 8 : 18);
    const path = line.map((p) => new THREE.Vector3(p[0], cableH(p), p[1]));
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    gondola = curve;
    const cable = new THREE.TubeGeometry(curve, Math.max(60, line.length * 12), 0.18, 4, false);
    group.add(new THREE.Mesh(cable, M('#3a3431')));
    const steel = M('#8f8d94');
    for (const p of pylons) {
      const y0 = Tp(p), y1 = y0 + 19;
      const parts: THREE.BufferGeometry[] = [];
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) parts.push(beam([p[0] + dx, y0, p[1] + dz], [p[0] + dx * 0.3, y1, p[1] + dz * 0.3], 0.45));
      parts.push(new THREE.BoxGeometry(5, 0.6, 0.8).translate(p[0], y1 + 0.3, p[1]));
      add(mergeGeometries(flatten(parts)), steel);
    }
    const cabinGeo = mergeGeometries([
      new THREE.BoxGeometry(2.4, 2.2, 2.4).translate(0, -3.4, 0),
      new THREE.BoxGeometry(0.2, 2.4, 0.2).translate(0, -1.2, 0),
    ]);
    const cabMat = M('#d8322a');
    const cabins: { m: THREE.Mesh; t: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(cabinGeo, cabMat);
      m.castShadow = true;
      group.add(m);
      cabins.push({ m, t: i / 10 });
    }
    const len = curve.getLength();
    animated.push((dt) => {
      for (const c of cabins) {
        c.t = (c.t + (dt * 5) / len) % 1;
        // up the mountain on one side, down on the other (offset to the side)
        const u = c.t < 0.5 ? c.t * 2 : 2 - c.t * 2;
        const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(c.t < 0.5 ? 2.2 : -2.2);
        c.m.position.copy(p).add(side);
        c.m.rotation.y = Math.atan2(tan.x, tan.z);
      }
    });
  }

  // ================= Kavadarci. Built after photos (Wikimedia Commons) and descriptions
  // (mk.wikipedia, spomenikdatabase.org): proportions are read off photos, not surveyed.
  const facing = (x: number, z: number) => { // turn toward the main square
    const sq = data.places?.square;
    return sq ? Math.atan2(sq[0] - x, sq[1] - z) : 0;
  };
  const concrete = M('#d6cfc1'), darkConcrete = M('#6a6862'), iron = M('#3f3a36');
  const bronze = M('#6f5a3c', { emissive: '#1d140a' });
  // a rounded-rectangle block w × d (x, z), h tall, bottom at y; `inset` > 0 leaves it open on top
  const roundRect = (sh: THREE.Shape | THREE.Path, w: number, d: number, r: number) => {
    const x = -w / 2, z = -d / 2;
    sh.moveTo(x + r, z); sh.lineTo(x + w - r, z); sh.quadraticCurveTo(x + w, z, x + w, z + r);
    sh.lineTo(x + w, z + d - r); sh.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
    sh.lineTo(x + r, z + d); sh.quadraticCurveTo(x, z + d, x, z + d - r);
    sh.lineTo(x, z + r); sh.quadraticCurveTo(x, z, x + r, z);
  };
  const slab = (w: number, d: number, h: number, y: number, r: number, inset = 0) => {
    const sh = new THREE.Shape();
    roundRect(sh, w, d, r);
    if (inset) { const hole = new THREE.Path(); roundRect(hole, w - 2 * inset, d - 2 * inset, Math.max(0.2, r - inset)); sh.holes.push(hole); }
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2).translate(0, y, 0);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  // board-marked concrete: vertical ribs on the straight parts of a w × d outline (corner radius r)
  const ribs = (out: THREE.BufferGeometry[], w: number, d: number, r: number, y: number, h: number, step = 0.6) => {
    for (let u = -w / 2 + r + step / 2; u < w / 2 - r; u += step) for (const sd of [-1, 1]) out.push(box(0.2, h, 0.14, u, y, sd * (d / 2 + 0.05)));
    for (let u = -d / 2 + r + step / 2; u < d / 2 - r; u += step) for (const sd of [-1, 1]) out.push(box(0.14, h, 0.2, sd * (w / 2 + 0.05), y, u));
  };
  // the band of diamond reliefs round the storeys of the ossuary
  const diamonds = (out: THREE.BufferGeometry[], w: number, d: number, r: number, y: number, size = 0.62, gap = 1.12) => {
    const g = () => new THREE.BoxGeometry(size, size, 0.3).rotateZ(Math.PI / 4);
    const n = (len: number) => Math.max(1, Math.floor(len / gap));
    for (const [len, along] of [[w - 2 * r, true], [d - 2 * r, false]] as const) {
      const k = n(len);
      for (let i = 0; i < k; i++) {
        const u = -len / 2 + (len * (i + 0.5)) / k;
        for (const sd of [-1, 1]) out.push(along ? g().translate(u, y, sd * (d / 2 + 0.12)) : g().rotateY(Math.PI / 2).translate(sd * (w / 2 + 0.12), y, u));
      }
    }
  };
  // radial brackets carrying an overhang: from the inner outline at y0 to the outer one at y1
  const brackets = (out: THREE.BufferGeometry[], iw: number, id: number, ow: number, od: number, y0: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const u = -1 + (2 * i + 1) / n;
      for (const sd of [-1, 1]) {
        out.push(beam([u * iw * 0.45, y0, sd * id / 2], [u * ow * 0.45, y1, sd * od / 2], 0.32));
        out.push(beam([sd * iw / 2, y0, u * id * 0.45], [sd * ow / 2, y1, u * od * 0.45], 0.32));
      }
    }
  };
  const place = (parts: THREE.BufferGeometry[], mat: THREE.Material, x: number, y: number, z: number, rot: number) => {
    if (!parts.length) return;
    const m = add(mergeGeometries(flatten(parts)), mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
  };
  /** which local sides (+x, −x, +z, −z) face north and south after turning by `rot` */
  const northSouth = (rot: number) => {
    const sides: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const wz = ([lx, lz]: [number, number]) => -lx * Math.sin(rot) + lz * Math.cos(rot);
    return sides.filter((sd) => Math.abs(wz(sd)) > 0.7);
  };

  // ---------------- Спомен-костурница (Petar Muličkovski, 1976): a stylised old Macedonian house
  // on a fluted concrete shaft, ~13 m: a first storey with a band of diamonds on brackets, a wider
  // open top storey with raised ends, in a courtyard (~20 × 20 m) ringed by fluted concrete wall
  // blocks of different heights, steps down to the shaft in the middle, iron grape-vine gates
  // on the north and south sides
  if (L.ossuary) {
    const ring = toPts(L.ossuary);
    const ob = obb(ring);
    if (ob) {
      const [cx, cz] = ob.c, rot = -Math.atan2(ob.a[1], ob.a[0]);
      const y0 = T(cx, cz);
      const half = 10.5;
      let yMin = y0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) yMin = Math.min(yMin, T(cx + sx * half, cz + sz * half));
      const C: THREE.BufferGeometry[] = [], D: THREE.BufferGeometry[] = [], I: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [];
      // courtyard: a raised paved square with steps down (an amphitheatre) to the shaft
      C.push(box(2 * half + 1, y0 - yMin + 1.5, 2 * half + 1, 0, yMin - y0 - 1.5, 0));
      const frame = (outer: number, inner: number, h: number) => {
        const t = outer - inner;
        C.push(box(2 * outer, h, t, 0, 0, inner + t / 2), box(2 * outer, h, t, 0, 0, -inner - t / 2));
        C.push(box(t, h, 2 * inner, inner + t / 2, 0, 0), box(t, h, 2 * inner, -inner - t / 2, 0, 0));
      };
      frame(half, 6, 1.0); frame(6, 5, 0.66); frame(5, 4, 0.33);
      // perimeter: fluted wall blocks of different heights; gates in the middle of the north and south sides
      const gates = northSouth(rot).map(([a, b]) => `${a},${b}`);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const gate = gates.includes(`${sx},${sz}`);
        for (let i = 0; i < 6; i++) {
          const u = -half + 1.1 + i * 3.7;
          if (gate && (i === 2 || i === 3)) continue;
          const h = 2.6 + ((i * 7 + sx * 3 + sz * 5 + 11) % 5) * 0.42, len = 3.0;
          const along = sz !== 0; // a wall running along x
          const bx = along ? u + len / 2 : sx * (half - 0.7), bz = along ? sz * (half - 0.7) : u + len / 2;
          C.push(along ? box(len, h, 1.4, bx, 1.0, bz) : box(1.4, h, len, bx, 1.0, bz));
          for (let k = 0; k < 5; k++) {
            const v = -len / 2 + 0.3 + k * 0.6;
            C.push(along ? box(0.2, h, 1.6, bx + v, 1.0, bz) : box(1.6, h, 0.2, bx, 1.0, bz + v));
          }
        }
        if (gate) { // iron gate leaves with a grape cluster each
          for (const g of [-1, 1]) {
            const gx = sz !== 0 ? g * 0.75 : sx * (half - 0.7), gz = sz !== 0 ? sz * (half - 0.7) : g * 0.75;
            I.push(sz !== 0 ? box(1.45, 2.6, 0.12, gx, 1.0, gz) : box(0.12, 2.6, 1.45, gx, 1.0, gz));
            for (let k = 0; k < 6; k++) {
              const gy = 2.9 - Math.floor(k / 2) * 0.32, off = ((k % 2) - 0.5) * 0.3 + (k > 3 ? 0.15 : 0);
              const ox = sz !== 0 ? gx + off : gx + sx * -0.12, oz = sz !== 0 ? gz + sz * -0.12 : gz + off;
              I.push(new THREE.SphereGeometry(0.17, 8, 6).translate(ox, gy, oz));
            }
          }
        }
      }
      // the house: shaft, first storey on brackets, recessed neck, wide open top storey
      const sW = 4.4, sD = 4.0, mW = 8.2, mD = 6.6, tW = 13.2, tD = 9.0;
      C.push(box(sW, 6.4, sD, 0, 0, 0)); ribs(C, sW, sD, 0, 0, 6.2, 0.55);
      brackets(C, sW, sD, mW - 0.4, mD - 0.4, 4.5, 6.0, 3);
      C.push(slab(mW, mD, 2.6, 6.0, 1.0)); ribs(C, mW, mD, 1.0, 7.4, 1.2, 0.55);
      diamonds(R, mW, mD, 1.0, 6.75);
      for (const sd of [-1, 1]) D.push(box(2.4, 0.6, 0.2, 0, 7.7, sd * (mD / 2 + 0.03))); // window slots
      C.push(box(mW - 1.4, 0.7, mD - 1.2, 0, 8.6, 0));
      brackets(C, mW - 1.2, mD - 1.0, tW - 0.4, tD - 0.4, 8.0, 9.3, 4);
      C.push(slab(tW, tD, 0.6, 9.3, 1.4), slab(tW, tD, 2.2, 9.9, 1.4, 0.5));
      ribs(C, tW, tD, 1.4, 10.9, 1.2, 0.55);
      diamonds(R, tW, tD, 1.4, 10.35, 0.7, 1.2);
      for (const sd of [-1, 1]) C.push(box(1.4, 1.2, tD - 1.6, sd * (tW / 2 - 0.7), 12.1, 0)); // raised ends
      place(C, concrete, cx, y0, cz, rot);
      place(D, darkConcrete, cx, y0, cz, rot);
      place(R, M('#b4ab9c'), cx, y0, cz, rot); // the diamond reliefs, a shade darker so they read
      place(I, iron, cx, y0, cz, rot);
    }
  }

  // ---------------- Kiro Krstev and Dimče Mirčev, where they fell on 7 April 1944 (north-west
  // corner of the town park; Tome Andreevski, 1959). After two photos of June 2019 (Commons): a
  // raised terrace reached by a flight of steps between rubble-stone walls; on it a long concrete
  // slab, its top rising to the right and its ends cut on a slant, with the names on the left and
  // a dark relief of charging fighters on the right, resting on two piers of white stone blocks
  // (the path into the park passes between them); a tall square concrete pillar at the top of
  // the steps; a small marble pylon behind (inscription, from the description only)
  const hf = heroesFrame(data, terrain);
  if (hf) {
    const { x: hx, z: hz, y0, rot, n, rise, run, yb, rb } = hf;
    const [x0, x1, z0, z1] = HZ.top, { H, bank, under } = HZ, st = HZ.stairs, rp = HZ.ramp;
    const G: THREE.BufferGeometry[] = [], P: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [], C: THREE.BufferGeometry[] = [];
    const Wst: THREE.BufferGeometry[] = [], Gr: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [], Ltr: THREE.BufferGeometry[] = [];
    const Mb: THREE.BufferGeometry[] = [], Sh: THREE.BufferGeometry[] = [], Pl: THREE.BufferGeometry[] = [];
    // a side profile [z, y][] extruded across x from cx − w/2 to cx + w/2
    const profile = (pts: [number, number][], w: number, cx: number) => {
      const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
      return new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(cx + w / 2, 0, 0);
    };
    // the grass bank: a box whose top face is drawn in by `bank` on every side
    const bankGeo = new THREE.BoxGeometry(x1 - x0 + 2 * bank, H + under, z1 - z0 + 2 * bank);
    const pos = bankGeo.attributes.position, kx = (x1 - x0) / (x1 - x0 + 2 * bank), kz = (z1 - z0) / (z1 - z0 + 2 * bank);
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setXYZ(i, pos.getX(i) * kx, pos.getY(i), pos.getZ(i) * kz);
    bankGeo.computeVertexNormals();
    G.push(bankGeo.translate((x0 + x1) / 2, (H - under) / 2 - 0.1, (z0 + z1) / 2));
    P.push(box(x1 - x0 + 0.3, 0.25, z1 - z0 + 0.3, (x0 + x1) / 2, H - 0.25, (z0 + z1) / 2)); // paving
    // the steps down to the street, between rubble-stone walls
    for (let k = 0; k < n - 1; k++) P.push(box(st.w, H - (k + 1) * rise + under, st.tread + 0.02, st.cx, -under, z1 + (k + 0.5) * st.tread));
    for (const sd of [-1, 1])
      R.push(profile([[z1 - 0.6, -under], [z1 + run + 0.3, -under], [z1 + run + 0.3, yb + 0.35], [z1 - 0.6, H + 0.35]], 0.5, st.cx + sd * (st.w / 2 + 0.25)));
    // the path into the park: a gentle ramp behind
    P.push(profile([[z0 + 0.2, -under], [z0 + 0.2, H - 0.02], [z0 - rp.len, rb + 0.03], [z0 - rp.len, -under]], rp.w, rp.cx));
    // the slab (photo: ~7 m, the right end ~0.7 m higher; heights above the terrace)
    const slabShape = new THREE.Shape([[-4.11, 2.75], [2.38, 3.48], [2.77, 1.8], [-0.52, 1.13], [-2.8, 1.07], [-4.23, 1.47]].map(([u, v]) => new THREE.Vector2(u, v + H)));
    C.push(new THREE.ExtrudeGeometry(slabShape, { depth: 0.45, bevelEnabled: false }).translate(0, 0, -0.225));
    // white stone piers: blocks in courses over darker mortar
    const piers = (bx0: number, bx1: number, h: number, bz0: number, bz1: number) => {
      Gr.push(box(bx1 - bx0 - 0.04, h - 0.02, bz1 - bz0 - 0.04, (bx0 + bx1) / 2, H, (bz0 + bz1) / 2));
      const rows = Math.max(2, Math.round(h / 0.24)), rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let u = bx0;
        const first = r % 2 ? 0.26 : 0.42;
        while (u < bx1 - 0.05) {
          const len = Math.min(u === bx0 ? first : 0.44, bx1 - u);
          Wst.push(box(len - 0.035, rh - 0.035, bz1 - bz0, u + len / 2, H + r * rh, (bz0 + bz1) / 2));
          u += len;
        }
      }
    };
    piers(-2.93, -0.47, 1.12, -0.45, 0.45); // left pier
    piers(1.49, 2.32, 1.95, -0.42, 0.42); // right column, up into the slab
    piers(1.49, 4.6, 1.14, -0.55, 0.75); // the low wall on to the pillar
    // the names: two lines of letters on the left
    for (const [ly, cnt] of [[2.24, 11], [2.05, 12]] as const)
      for (let i = 0; i < cnt; i++) Ltr.push(box(0.055, 0.12, 0.03, -3.3 + i * 0.085, H + ly - 0.06, 0.235));
    // the relief: a crowd of fighters charging to the right, fists and rifles raised, two thrown
    // to their knees, the last one reeling back
    for (let i = 0; i < 8; i++) {
      const bx = -0.7 + i * 0.4, foot = H + 1.84, kneel = i === 2 || i === 5, back = i === 7;
      const lean = back ? -0.25 : 0.38 + ((i * 7) % 3) * 0.12, zf = 0.3 + (i % 2) * 0.05, tall = 0.5 + ((i * 5) % 3) * 0.05;
      const hip: Vec3 = [bx, foot + (kneel ? 0.36 : 0.56), zf];
      const sh: Vec3 = [hip[0] + Math.sin(lean) * tall, hip[1] + Math.cos(lean) * tall, zf];
      B.push(beam(hip, sh, 0.3)); // body
      B.push(new THREE.SphereGeometry(0.14, 8, 6).translate(sh[0] + Math.sin(lean) * 0.17, sh[1] + 0.16, zf)); // head
      if (kneel) { B.push(beam(hip, [bx + 0.08, foot + 0.05, zf], 0.16)); B.push(beam([bx + 0.08, foot + 0.05, zf], [bx - 0.3, foot + 0.08, zf], 0.14)); }
      else B.push(beam(hip, [bx - 0.3, foot + 0.02, zf], 0.16));
      B.push(beam(hip, [bx + (back ? 0.15 : 0.32), foot, zf], 0.16)); // front leg
      if (i % 2 === 0 || back) { // a fist raised high
        const fist: Vec3 = [sh[0] + (back ? -0.1 : 0.14), sh[1] + 0.44, zf];
        B.push(beam(sh, fist, 0.12), new THREE.SphereGeometry(0.08, 6, 4).translate(...fist));
      } else B.push(beam([sh[0] + 0.36, sh[1] - 0.16, zf + 0.04], [sh[0] - 0.14, sh[1] + 0.34, zf + 0.04], 0.07)); // rifle
      B.push(beam(sh, [sh[0] + 0.3, sh[1] - 0.14, zf], 0.12)); // the other arm forward
    }
    // the tall pillar at the top of the steps
    Pl.push(box(1.1, 8, 0.9, st.cx + st.w / 2 + 0.25, H - 0.2, -0.3));
    // the marble pylon behind
    Mb.push(box(0.55, 1.3, 0.35, -2.5, H - 0.05, -3.5));
    // shrubs on the bank
    for (const [u, v, r, d] of [[x0 - 1, z1 + 0.6, 1.1, 1], [x0 - 0.9, z0 + 2, 1.3, 0.9], [x1 + 0.9, z0 + 1.5, 1.2, 0.9], [x1 + 0.8, z1 - 1.5, 1, 0.8], [-1.5, z1 + 1.1, 1.2, 1.1]] as const)
      Sh.push(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.75, 1).translate(u, H - (d * (H + under)) / bank + r * 0.3, v));
    place(G, M('#a5d167'), hx, y0, hz, rot);
    place(P, M('#c9c5bd'), hx, y0, hz, rot);
    place(R, M('#a19c92'), hx, y0, hz, rot);
    place(C, M('#a29f98'), hx, y0, hz, rot);
    place(Pl, concrete, hx, y0, hz, rot);
    place(Gr, M('#8a867e'), hx, y0, hz, rot);
    place(Wst, M('#efede7'), hx, y0, hz, rot);
    place(Ltr, darkConcrete, hx, y0, hz, rot);
    place(B, M('#4a4640', { emissive: '#120e0a' }), hx, y0, hz, rot);
    place(Mb, M('#f1eee8'), hx, y0, hz, rot);
    place(Sh, M('#5f8c3e'), hx, y0, hz, rot);
  }

  // ---------------- Vataša memorial at Moklište (Jordan Grabul, 1963), for the 12 youths shot
  // here on 16 June 1943: two curved ~5 m concrete walls (the inscription on the south one)
  // round a small altar
  if (L.vatasa) {
    const [x, z] = L.vatasa;
    const y = T(x, z);
    const arc = (rOut: number, rIn: number, mid: number, span: number, h: number, yb: number) => {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, rOut, mid - span / 2, mid + span / 2, false);
      sh.absarc(0, 0, rIn, mid + span / 2, mid - span / 2, true);
      sh.closePath();
      return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 28 }).rotateX(-Math.PI / 2).translate(0, yb, 0);
    };
    // shape angle −π/2 is south (+z) once laid flat, +π/2 north
    const C = [arc(5.6, 5.0, -Math.PI / 2, 2.1, 5.0, 0.5), arc(5.6, 5.0, Math.PI / 2, 2.1, 4.5, 0.5), box(1.6, 0.9, 1.0, 0, 0.5, 0)];
    const D = [arc(4.99, 4.93, -Math.PI / 2, 1.2, 0.9, 2.4)]; // the inscription
    place([new THREE.CylinderGeometry(8.5, 8.8, 2.5, 32).translate(0, -0.75, 0)], M('#c9c1b2'), x, y, z, 0);
    place(C, concrete, x, y, z, 0);
    place(D, darkConcrete, x, y, z, 0);
  }

  // ---------------- 12-те ваташки деца: twelve white marble busts on tall white pedestals, each on a
  // square base slab, in an arc round the lawn in front of the memorial; tall cypresses behind the
  // western half of the arc (aerial image, photo of 2023)
  {
    const busts = vatasaBusts(data);
    const marble: THREE.BufferGeometry[] = [], cypress: THREE.BufferGeometry[] = [];
    // the lawn's height: a large park is painted into the terrain, a small one draped above it
    const park = busts.length ? data.areas.find((a) => pip(busts[0].x, busts[0].z, toPts(a.r[0]))) : undefined;
    const lift = park && !isPaintedArea(park.k, park.a) ? areaLift(park.z) : 0;
    busts.forEach(({ x, z, rot }, i) => {
      const y = T(x, z) + lift;
      const parts = [
        box(0.85, 0.5, 0.85, 0, -0.35, 0), // base slab, 0.15 m above the grass
        box(0.5, 1.15, 0.5, 0, 0.15, 0), // pedestal
        box(0.6, 0.06, 0.6, 0, 1.3, 0), // its cap
        new THREE.CylinderGeometry(0.25, 0.19, 0.3, 16).scale(1, 1, 0.55).translate(0, 1.51, 0), // chest, cut flat below
        new THREE.SphereGeometry(1, 16, 8).scale(0.26, 0.09, 0.14).translate(0, 1.66, 0), // the shoulders' round
        new THREE.CylinderGeometry(0.06, 0.07, 0.16, 10).translate(0, 1.76, 0), // neck
        new THREE.SphereGeometry(0.125, 16, 12).scale(0.95, 1.22, 1.08).translate(0, 1.95, 0.015), // head
        new THREE.SphereGeometry(0.06, 10, 8).scale(1.1, 0.8, 1).translate(0, 1.86, 0.08), // chin and jaw
      ];
      for (const g of parts) marble.push(g.rotateY(rot).translate(x, y, z));
      // cypresses behind the first seven, between the busts
      if (i < 7) {
        const nx = busts[i + 1].x, nz = busts[i + 1].z, mx = (x + nx) / 2, mz = (z + nz) / 2;
        const ox = -Math.sin(rot) * 2.6, oz = -Math.cos(rot) * 2.6; // away from the lawn
        const cy = T(mx + ox, mz + oz) + lift;
        cypress.push(new THREE.ConeGeometry(0.6, 5.4 + (i % 3) * 0.5, 10).translate(mx + ox, cy + 2.6 + (i % 3) * 0.25, mz + oz));
      }
    });
    place(marble, M('#f3f0ea'), 0, 0, 0, 0);
    place(cypress, M('#3a6337'), 0, 0, 0, 0);
  }

  // ---------------- Плоштад Маршал Тито: the Monument to the Revolution, the town hall with its
  // fountains, flags and conifers, round granite planters, ball bollards and curved paving bands.
  // After photos of 12 Dec 2020 (Commons) and 1 June 2025 (US Army, public domain); the planters'
  // positions are approximate.
  const sqLift = areaLift(5); // the square is draped (plaza) this far above the bare terrain
  const nightGlass: THREE.MeshLambertMaterial[] = []; // windows that light up at night
  /** a canvas texture for lettering and flags */
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  /** a flat ring band laid on the draped ground, following the terrain */
  const drapedRing = (cx: number, cz: number, r: number, w: number, lift: number, mat: THREE.Material) => {
    const n = 96, pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const q = (a: number, rr: number): Vec3 => { const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; return [x, T(x, z) + lift, z]; };
      const A = q(a0, r - w / 2), B = q(a0, r + w / 2), C = q(a1, r + w / 2), D = q(a1, r - w / 2);
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  };

  // ---------------- Monument to the Revolution (Petar Palavičini, 1958): on a tall speckled
  // granite plinth („За слободата на народот свој“), a young man on the left, a tall woman in the
  // middle raising one arm, her other hand on the shoulder of a youth sinking forward on the right;
  // it faces the square, the town hall behind it
  if (L.revolution) {
    const [x, z] = L.revolution;
    const y = T(x, z) + sqLift;
    const top = 2.85;
    const P = [box(1.9, 0.35, 1.3, 0, -0.2, 0), box(1.5, 2.7, 1.0, 0, 0.15, 0), box(1.5, 0.45, 0.42, 0, -0.2, 0.75)];
    const F: THREE.BufferGeometry[] = []; // the flower box at its foot
    for (let i = 0; i < 6; i++) F.push(new THREE.SphereGeometry(0.16, 8, 6).translate(-0.6 + i * 0.24, 0.32, 0.75));
    const G: THREE.BufferGeometry[] = [box(1.25, 0.18, 0.75, 0.1, top - 0.18, 0)];
    const ell = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, rz = 0, rx = 0) =>
      G.push(new THREE.SphereGeometry(1, 12, 9).scale(sx, sy, sz).rotateX(rx).rotateZ(rz).translate(px, py, pz));
    // the young man (viewer's left)
    for (const sd of [-1, 1]) G.push(beam([-0.45 + sd * 0.1, top, 0], [-0.45 + sd * 0.09, top + 0.95, 0], 0.17));
    ell(0.24, 0.4, 0.16, -0.45, top + 1.35, 0); ell(0.11, 0.14, 0.12, -0.45, top + 1.9, 0);
    G.push(beam([-0.67, top + 1.6, 0], [-0.71, top + 1.0, 0.05], 0.12), beam([-0.23, top + 1.6, 0], [-0.25, top + 1.05, 0.12], 0.12));
    // the woman: long dress, one arm raised high, the other hand down on the youth
    G.push(new THREE.CylinderGeometry(0.2, 0.36, 1.3, 12).translate(0.05, top + 0.65, -0.05));
    ell(0.22, 0.42, 0.15, 0.05, top + 1.65, -0.05); ell(0.11, 0.15, 0.12, 0.05, top + 2.22, -0.05);
    G.push(beam([-0.12, top + 1.95, -0.05], [-0.24, top + 3.05, 0], 0.11), beam([0.22, top + 1.95, -0.05], [0.62, top + 1.48, 0.05], 0.11));
    // the youth sinking forward (viewer's right)
    ell(0.2, 0.38, 0.15, 0.68, top + 1.0, 0.1, -0.9, 0.3); ell(0.11, 0.13, 0.12, 0.86, top + 1.28, 0.25);
    G.push(beam([0.55, top, 0], [0.6, top + 0.7, 0.05], 0.15), beam([0.8, top, 0.15], [0.65, top + 0.7, 0.05], 0.15));
    G.push(beam([0.85, top + 1.05, 0.2], [0.95, top + 0.55, 0.45], 0.1));
    const rot = facing(x, z);
    place(P, M('#a9a7a2'), x, y, z, rot);
    place(F, M('#5f7d4a'), x, y, z, rot);
    const g = mergeGeometries(flatten(G));
    g.translate(0, -top, 0).scale(1.2, 1.2, 1.2).translate(0, top, 0);
    place([g], M('#4f544c', { emissive: '#151812' }), x, y, z, rot);
    // the inscription on the plinth's front
    const words = canvasTex(512, 256, (g2) => {
      g2.fillStyle = '#a9a7a2'; g2.fillRect(0, 0, 512, 256);
      g2.fillStyle = '#26231f'; g2.font = "700 50px 'Lora', Georgia, serif"; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('ЗА СЛОБОДАТА', 256, 96); g2.fillText('НА НАРОДОТ СВОЈ', 256, 160);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshLambertMaterial({ map: words, clippingPlanes }));
    plate.position.set(Math.sin(rot) * 0.51, y + 2.25, Math.cos(rot) * 0.51);
    plate.rotation.y = rot;
    plate.position.x += x; plate.position.z += z;
    group.add(plate);
  }

  // ---------------- Општина Кавадарци (town hall): three storeys faced with sand-coloured stone panels
  // mottled salmon, cream bands and pilasters, a projecting entrance bay with the lettering in the middle
  // of the front, tall white-framed windows, a flat white roof with a row of skylights (aerial image,
  // Street View 2025). It follows OSM's outline (townhallPlan, square.ts), kept off the streets; in
  // front: trimmed conifers and flagpoles on the terrace (the steps and fountains are in square.ts)
  const plan = townhallPlan(data);
  if (plan) {
    {
      const { ring, a, b, nrm } = plan;
      const rot = Math.atan2(nrm[0], nrm[1]); // local +z = out of the front
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), H = 12.6, fz = 0; // local origin: the front's middle
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, y = T(cx, cz) + sqLift - 0.3;
      const base = Math.min(...ring.map(([x, z]) => T(x, z))) + sqLift - 0.9;
      const salmon: THREE.BufferGeometry[] = [], cream: THREE.BufferGeometry[] = [], win: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = [];
      // in world coordinates: the walls on the outline, cornice and floor bands along every side,
      // windows on the sides and the back
      const W: THREE.BufferGeometry[] = [], Wc: THREE.BufferGeometry[] = [], Wwin: THREE.BufferGeometry[] = [], Wframe: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      W.push(new THREE.ExtrudeGeometry(shape, { depth: y + H - 0.6 - base, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, base, 0));
      roof.push(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y + H - 0.6, 0));
      let area2 = 0;
      for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area2 += p[0] * q[1] - q[0] * p[1]; }
      /** a box along the edge p→q: u along it from p, `off` outward, y up from the front's level */
      const edgeBox = (p: Pt, q: Pt, w: number, h: number, d: number, u: number, yy: number, off: number) => {
        const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        const ox = area2 > 0 ? uz : -uz, oz = area2 > 0 ? -ux : ux; // outward
        return new THREE.BoxGeometry(w, h, d).rotateY(Math.atan2(-uz, ux)).translate(p[0] + ux * u + ox * off, y + yy + h / 2, p[1] + uz * u + oz * off);
      };
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (l < 0.5) continue;
        Wc.push(edgeBox(p, q, l + 0.5, 0.55, 0.5, l / 2, H - 0.6, 0)); // cornice
        for (const fy of [3.7, 7.7]) Wc.push(edgeBox(p, q, l + 0.1, 0.3, 0.2, l / 2, fy, 0.02)); // floor bands
        if (p === a) continue; // the front is laid out below
        const n = Math.floor((l - 1.2) / 2.9);
        for (let k = 0; k < n; k++) {
          const u = l / 2 + (k - (n - 1) / 2) * 2.9;
          Wc.push(edgeBox(p, q, 0.45, H - 0.6, 0.12, u - 1.45, -0.6, 0.04)); // pilaster strips
          for (const wy of [1.0, 4.6, 8.6]) {
            Wframe.push(edgeBox(p, q, 2.0, 2.5, 0.12, u, wy - 0.1, 0.06));
            Wwin.push(edgeBox(p, q, 1.7, 2.2, 0.14, u, wy + 0.05, 0.08));
          }
        }
      }
      // the front: pilaster strips and windows in bays, the entrance bay in the middle
      const bays = Math.max(6, Math.round(len / 2.8)), bw = len / bays, bay = 7.6;
      for (let k = 0; k <= bays; k++) cream.push(box(0.5, H - 0.6, 0.12, -len / 2 + k * bw, -0.6, fz + 0.04));
      for (const wy of [1.0, 4.6, 8.6]) for (let k = 0; k < bays; k++) {
        const wx = -len / 2 + (k + 0.5) * bw;
        if (Math.abs(wx) < bay / 2 + 0.6) continue; // the bay has its own glazing
        frame.push(box(Math.min(2.1, bw - 0.6), 2.5, 0.12, wx, wy - 0.1, fz + 0.06));
        win.push(box(Math.min(1.8, bw - 0.9), 2.2, 0.14, wx, wy + 0.05, fz + 0.08));
      }
      // skylights: a row along the middle of the roof
      const sky: THREE.BufferGeometry[] = [box(len * 0.55, 0.45, 2.4, 0, H - 0.5, -Math.min(plan.depth, 15) * 0.45)];
      // the entrance bay: projecting, cream frame, glazed ground floor, big windows above
      cream.push(box(bay, H + 0.4, 1.4, 0, -0.6, fz + 0.7));
      salmon.push(box(bay - 1.2, H - 1.2, 0.2, 0, 0.0, fz + 1.45));
      frame.push(box(6.2, 3.4, 0.12, 0, 0.0, fz + 1.58), box(6.2, 2.8, 0.12, 0, 6.0, fz + 1.58), box(6.2, 2.4, 0.12, 0, 9.2, fz + 1.58));
      win.push(box(5.8, 3.0, 0.14, 0, 0.1, fz + 1.6), box(5.8, 2.4, 0.14, 0, 6.2, fz + 1.6), box(5.8, 2.0, 0.14, 0, 9.4, fz + 1.6));
      const stone = M('#dbbfa3'), creamMat = M('#efe3d3'), frameMat = M('#f7f5f0');
      const glassMat = M('#4a5866', { emissive: '#ffd590', emissiveIntensity: 0 });
      nightGlass.push(glassMat);
      place(W, stone, 0, 0, 0, 0);
      place(Wc, creamMat, 0, 0, 0, 0);
      place(Wframe, frameMat, 0, 0, 0, 0);
      place(Wwin, glassMat, 0, 0, 0, 0);
      place(roof, M('#e7e5e0'), 0, 0, 0, 0);
      place(sky, M('#3e4652'), cx, y, cz, rot);
      place(salmon, stone, cx, y, cz, rot);
      place(cream, creamMat, cx, y, cz, rot);
      place(frame, frameMat, cx, y, cz, rot);
      place(win, glassMat, cx, y, cz, rot);
      // lettering above the entrance
      const letters = canvasTex(1024, 128, (g2) => {
        g2.fillStyle = '#e9ddcc'; g2.fillRect(0, 0, 1024, 128);
        g2.fillStyle = '#4a3a30'; g2.font = "700 74px 'Lora', Georgia, serif"; g2.textAlign = 'center'; g2.textBaseline = 'middle';
        g2.fillText('ОПШТИНА КАВАДАРЦИ', 512, 68);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.95), new THREE.MeshLambertMaterial({ map: letters, clippingPlanes }));
      sign.position.set(0, 4.3, fz + 1.62);
      const holder = new THREE.Group();
      holder.add(sign);
      holder.position.set(cx, y, cz);
      holder.rotation.y = rot;
      group.add(holder);
      // trimmed conifers either side of the steps
      const cones: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) cones.push(new THREE.ConeGeometry(0.75, 4.2, 10).translate(sd * 8.6, 1.8, fz + 2.4), box(1.2, 0.5, 1.2, sd * 8.6, -0.3, fz + 2.4));
      place(cones, M('#3f6a3b'), cx, y, cz, rot);
      // flagpoles: two Macedonian flags on the left, the EU flag on the right
      const mk = canvasTex(256, 128, (g2) => {
        g2.fillStyle = '#d20000'; g2.fillRect(0, 0, 256, 128);
        g2.fillStyle = '#ffe600';
        const ox = 128, oy = 64;
        for (const [tx, ty] of [[0, 0], [128, 0], [256, 0], [0, 64], [256, 64], [0, 128], [128, 128], [256, 128]]) {
          const a = Math.atan2(ty - oy, tx - ox), wdt = 0.13;
          g2.beginPath(); g2.moveTo(ox, oy);
          g2.lineTo(ox + Math.cos(a - wdt) * 300, oy + Math.sin(a - wdt) * 300);
          g2.lineTo(ox + Math.cos(a + wdt) * 300, oy + Math.sin(a + wdt) * 300);
          g2.closePath(); g2.fill();
        }
        g2.beginPath(); g2.arc(ox, oy, 18, 0, Math.PI * 2); g2.fillStyle = '#d20000'; g2.fill();
        g2.beginPath(); g2.arc(ox, oy, 14, 0, Math.PI * 2); g2.fillStyle = '#ffe600'; g2.fill();
      });
      const eu = canvasTex(256, 128, (g2) => {
        g2.fillStyle = '#003399'; g2.fillRect(0, 0, 256, 128);
        g2.fillStyle = '#ffcc00';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, sx = 128 + Math.cos(a) * 38, sy = 64 + Math.sin(a) * 38;
          g2.beginPath();
          for (let k = 0; k < 10; k++) { const rr = k % 2 ? 3 : 7.5, b = -Math.PI / 2 + (k * Math.PI) / 5; g2[k ? 'lineTo' : 'moveTo'](sx + Math.cos(b) * rr, sy + Math.sin(b) * rr); }
          g2.closePath(); g2.fill();
        }
      });
      const poles: THREE.BufferGeometry[] = [];
      const flagAt = (px: number, tex: THREE.Texture) => {
        poles.push(new THREE.CylinderGeometry(0.06, 0.08, 9, 6).translate(px, 4.2, fz + 3.6));
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, clippingPlanes }));
        f.position.set(px + 1.0, 7.9, fz + 3.6);
        holder.add(f);
      };
      flagAt(-6.2, mk); flagAt(-4.9, mk); flagAt(5.4, eu);
      place(poles, M('#d9d9d9'), cx, y, cz, rot);
    }
  }

  // ---------------- the square: the town hall's terrace with curved steps and two fountains, ball
  // bollards, planters, the lawn strip, the clock, the paving's bands (square.ts)
  const sqLayout = squareLayout(data, terrain);
  const square = sqLayout ? createSquare(sqLayout, terrain, clippingPlanes) : null;
  if (square) group.add(square.group);

  // ---------------- Градски зелен пазар (2022): the market on its parking deck (market.ts)
  const mFrame = marketFrame(data, terrain);
  const market = mFrame ? createMarket(mFrame, clippingPlanes) : null;
  if (market) group.add(market.group);

  // ---------------- Дом на културата „Иван Мазов-Климе“ (not in OSM). Its plan from the site and
  // floor plans of the 2023 fire-safety report: 41.4 m along Илинденска, ground floor + one storey;
  // stage block at the north (27.4 m wide with the wings), the 260-seat hall in the middle with a
  // vestibule on the west side, the foyer and the main entrance at the south, toward ул. 7 Септември.
  // No photo of the outside was found: the facades are plain (render, window bands).
  let cultureGlass: THREE.MeshLambertMaterial | null = null;
  if (L.culture) {
    const [x, z, rot] = L.culture;
    const y = T(x, z) - 0.3;
    // local frame: z along the building (south +), x toward the east; the body spans x ±7.55, z ±20.7
    const W = [] as THREE.BufferGeometry[], R = [] as THREE.BufferGeometry[], G = [] as THREE.BufferGeometry[];
    const part = (x0: number, x1: number, z0: number, z1: number, h: number) => {
      W.push(box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2));
      R.push(box(x1 - x0 + 0.3, 0.45, z1 - z0 + 0.3, (x0 + x1) / 2, h, (z0 + z1) / 2)); // roof edge
    };
    part(-7.55, 7.55, -20.7, -7.7, 12.5); // stage block (taller: the fly tower)
    part(-7.55, 7.55, -7.7, 8.8, 9.0); // auditorium
    part(-7.55, 7.55, 8.8, 20.7, 7.8); // foyer, two storeys
    part(7.55, 16.1, -20.7, -7.73, 7.2); // east wings
    part(7.55, 13.5, -6.13, 0.34, 7.2);
    part(7.55, 16.1, 8.2, 17.0, 7.2);
    part(-11.25, -7.55, -2.5, 0.7, 3.6); // west vestibule
    // window bands on the wings and the foyer, a glazed entrance with a canopy at the south
    for (const [wx0, wx1, wz0, wz1] of [[7.55, 16.1, -20.7, -7.73], [7.55, 16.1, 8.2, 17.0]] as const)
      for (const wy of [1.2, 4.4]) G.push(box(0.12, 1.5, wz1 - wz0 - 2, wx1 + 0.06, wy, (wz0 + wz1) / 2));
    for (const wy of [1.0, 4.4]) G.push(box(12, 1.6, 0.12, 0, wy, 20.76));
    G.push(box(8, 2.8, 0.14, 0, 0.1, 20.8));
    R.push(box(11, 0.3, 2.6, 0, 3.2, 22.0)); // canopy
    place(W, M('#e9e0d0'), x, y, z, rot);
    place(R, M('#bdb6ab'), x, y, z, rot);
    cultureGlass = M('#4a5866', { emissive: '#ffd590', emissiveIntensity: 0 });
    place(G, cultureGlass, x, y, z, rot);
  }

  // ---------------- Градски стадион (city stadium, ГФК Тиквеш; first match 19 March 1950), round
  // the OSM pitch. After photos of 2010, 2013 and 2020 (Commons), the municipality's photos of the
  // works (Oct 2020) and a match photo of Sept 2024: the old covered north stand (concrete terraces
  // under a dark red roof on red steel columns, a white block wall behind), the east stand rebuilt in
  // 2020 (terraces curving round the north-east corner, a brick wall behind), the roofed south stand
  // of 2023 (a white steel canopy), a white clubhouse behind the west goal, the marked pitch, goals
  // and a white fence. The pitch is flattened in the terrain (`flatWays`, scripts/config.ts).
  const sf = stadiumFrame(data);
  if (sf) {
    const { c, rot, L: hl, W: hw } = sf;
    const y = T(c[0], c[1]);
    const pitchArea = data.areas.find((a) => a.k === 'pitch' && pip(c[0], c[1], toPts(a.r[0])));
    const lineY = areaLift(pitchArea?.z ?? 6) + 0.08;
    const lines: THREE.BufferGeometry[] = [], goals: THREE.BufferGeometry[] = [], terr: THREE.BufferGeometry[] = [];
    const wall: THREE.BufferGeometry[] = [], brick: THREE.BufferGeometry[] = [], redRoof: THREE.BufferGeometry[] = [], redSteel: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [], canopy: THREE.BufferGeometry[] = [], tiles: THREE.BufferGeometry[] = [], yellow: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    // the markings of a 105 × 68 m field
    const FL = 52.5, FW = 34, lw = 0.22;
    const hline = (u0: number, u1: number, v: number) => lines.push(box(u1 - u0 + lw, 0.02, lw, (u0 + u1) / 2, lineY, v));
    const vline = (u: number, v0: number, v1: number) => lines.push(box(lw, 0.02, v1 - v0 + lw, u, lineY, (v0 + v1) / 2));
    hline(-FL, FL, -FW); hline(-FL, FL, FW); vline(-FL, -FW, FW); vline(FL, -FW, FW); vline(0, -FW, FW);
    const ring = (r: number, u: number) => lines.push(new THREE.RingGeometry(r - lw / 2, r + lw / 2, r > 1 ? 56 : 12).rotateX(-Math.PI / 2).translate(u, lineY + 0.02, 0));
    ring(9.15, 0); ring(0.25, 0);
    for (const s of [-1, 1]) {
      for (const [deep, half] of [[16.5, 20.16], [5.5, 9.16]]) { vline(s * (FL - deep), -half, half); hline(Math.min(s * FL, s * (FL - deep)), Math.max(s * FL, s * (FL - deep)), -half); hline(Math.min(s * FL, s * (FL - deep)), Math.max(s * FL, s * (FL - deep)), half); }
      ring(0.25, s * (FL - 11));
      // the goal: 7.32 × 2.44 m, posts and bar, a frame for the net behind
      const g = lineY - 0.08, gu = s * FL, bu = s * (FL + 1.8);
      for (const v of [-3.66, 3.66]) { goals.push(box(0.12, 2.44, 0.12, gu, g, v)); goals.push(beam([gu, g + 2.44, v], [bu, g + 0.9, v], 0.06), beam([bu, g, v], [bu, g + 0.9, v], 0.06)); }
      goals.push(box(0.12, 0.12, 7.44, gu, g + 2.38, 0), beam([bu, g + 0.9, -3.66], [bu, g + 0.9, 3.66], 0.06));
    }
    // a prism swept along a path (u, v; front edge of a stand), from offset o0 to o1 on the outer
    // side (left of travel: travel east → south, west → north, north → east), heights y0..y1
    const sweep = (out: THREE.BufferGeometry[], path: [number, number][], o0: number, o1: number, y0: number, y1: number) => {
      const n = path.length, nrm: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
        let tu = b[0] - a[0], tv = b[1] - a[1];
        const l = Math.hypot(tu, tv) || 1; tu /= l; tv /= l;
        let k = 1;
        if (i > 0 && i < n - 1) { // miter: divide by the cosine of half the turn
          const p = path[i - 1], q = path[i], r = path[i + 1];
          const t1 = [q[0] - p[0], q[1] - p[1]], t2 = [r[0] - q[0], r[1] - q[1]];
          const l1 = Math.hypot(t1[0], t1[1]), l2 = Math.hypot(t2[0], t2[1]);
          k = 1 / Math.max(0.5, Math.cos(Math.acos(Math.max(-1, Math.min(1, (t1[0] * t2[0] + t1[1] * t2[1]) / (l1 * l2)))) / 2));
        }
        nrm.push([-tv * k, tu * k]);
      }
      const P = (i: number, o: number, h: number) => new THREE.Vector3(path[i][0] + nrm[i][0] * o, h, path[i][1] + nrm[i][1] * o);
      const pos: number[] = [];
      const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3) => {
        const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a));
        const tri = nn.dot(want) >= 0 ? [a, b, cc, a, cc, d] : [a, cc, b, a, d, cc];
        for (const v of tri) pos.push(v.x, v.y, v.z);
      };
      const UPv = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < n - 1; i++) {
        const out_ = new THREE.Vector3(nrm[i][0] + nrm[i + 1][0], 0, nrm[i][1] + nrm[i + 1][1]);
        quad(P(i, o0, y1), P(i + 1, o0, y1), P(i + 1, o1, y1), P(i, o1, y1), UPv);
        quad(P(i, o0, y0), P(i + 1, o0, y0), P(i + 1, o0, y1), P(i, o0, y1), out_.clone().negate());
        quad(P(i, o1, y0), P(i + 1, o1, y0), P(i + 1, o1, y1), P(i, o1, y1), out_);
      }
      for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
        const want = new THREE.Vector3(path[i][0] - path[j][0], 0, path[i][1] - path[j][1]);
        quad(P(i, o0, y0), P(i, o1, y0), P(i, o1, y1), P(i, o0, y1), want);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const uv = new Float32Array((pos.length / 3) * 2);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.push(geo);
    };
    const terraces = (path: [number, number][], rows: number, tread: number, rise: number, base = 0.35) => {
      for (let k = 0; k < rows; k++) sweep(terr, path, k * tread, (k + 1) * tread + 0.02, -2, base + (k + 1) * rise);
      return { depth: rows * tread, top: base + rows * rise };
    };
    const { front, north: N, east: E, south: S } = STAD;
    // north: the old covered stand (~64 m)
    const nU0 = N.u0, nU1 = N.u1, nv = -hw - front;
    const ns = terraces([[nU0, nv], [nU1, nv]], N.rows, N.tread, N.rise);
    sweep(wall, [[nU0, nv], [nU1, nv]], ns.depth, ns.depth + 0.4, -2, ns.top + 3.3);
    const nLen = nU0 - nU1 + 1, nMid = (nU0 + nU1) / 2;
    { // the roof: falls toward the pitch, overhanging the front row
      const back = nv - ns.depth - 0.2, fr = nv + 1.2, yb = ns.top + 3.4, yf = ns.top + 1.9, d = Math.hypot(back - fr, yb - yf);
      redRoof.push(new THREE.BoxGeometry(nLen, 0.2, d).rotateX(-Math.atan2(yb - yf, fr - back)).translate(nMid, (yb + yf) / 2, (back + fr) / 2));
      for (let u = nU1 + 1; u <= nU0 - 1; u += 7.9) {
        const cv = nv - 1.6, cy = 0.35 + 3 * 0.38, top = yf + ((yb - yf) * (fr - cv)) / (fr - back);
        redSteel.push(box(0.28, top - cy, 0.28, u, cy, cv));
        redSteel.push(beam([u, top - 0.05, cv], [u, yb - 0.1, back + 0.3], 0.18));
      }
    }
    // yellow huts and the benches by the west end of the north side (photo 2020)
    yellow.push(box(7, 2.6, 3, nU1 - 9, 0.3, nv - 1), box(5, 2.2, 2.5, nU1 - 17, 0.3, nv - 0.8));
    // east: rebuilt in 2020, curving round the north-east corner on to the north side
    const eu = hl + front, R = E.R, ccu = eu - R, ccv = -hw - front + R;
    const ePath: [number, number][] = [[eu, hw - E.end], [eu, ccv]];
    for (let i = 1; i <= 8; i++) { const t = (-Math.PI / 2 * i) / 8; ePath.push([ccu + R * Math.cos(t), ccv + R * Math.sin(t)]); }
    ePath.push([nU0 + 0.5, nv]);
    const es = terraces(ePath, E.rows, E.tread, E.rise);
    sweep(brick, ePath, es.depth + 0.8, es.depth + 1.1, -2, es.top + 2.2);
    // south: the roofed stand of 2023, a white steel canopy
    const sU0 = S.u0, sU1 = S.u1, sv = hw + front;
    const ss = terraces([[sU0, sv], [sU1, sv]], S.rows, S.tread, S.rise);
    sweep(white, [[sU0, sv], [sU1, sv]], ss.depth, ss.depth + 0.25, -2, ss.top + 1.1); // back rail wall
    {
      const roofY = ss.top + 4, back = sv + ss.depth + 0.4, fr = sv - 1;
      canopy.push(box(sU1 - sU0 + 2, 0.15, back - fr, (sU0 + sU1) / 2, roofY, (back + fr) / 2));
      for (let u = sU0; u <= sU1 + 0.1; u += 8) {
        white.push(box(0.22, roofY - 0.4, 0.22, u, 0.4, sv + 0.3), box(0.25, roofY - ss.top, 0.25, u, ss.top, back - 0.2));
        white.push(beam([u, roofY - 0.05, fr], [u, roofY - 0.05, back], 0.3), beam([u, roofY - 0.9, back - 0.2], [u, roofY - 0.1, sv + 2], 0.12));
      }
      white.push(box(sU1 - sU0 + 2, 0.45, 0.3, (sU0 + sU1) / 2, roofY - 0.3, fr)); // front fascia
    }
    // the fence round the grass
    const fo = 1.0;
    white.push(box(2 * hl + 2 * fo, 1.0, 0.07, 0, 0.3, -hw - fo), box(2 * hl + 2 * fo, 1.0, 0.07, 0, 0.3, hw + fo));
    white.push(box(0.07, 1.0, 2 * hw + 2 * fo, -hl - fo, 0.3, 0), box(0.07, 1.0, 2 * hw + 2 * fo, hl + fo, 0.3, 0));
    // west: the white clubhouse (two storeys, tiled roof) and a long single-storey building
    const hip = (w: number, d: number, h: number, u: number, yb: number, v: number) =>
      new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w * 1.08, h, d * 1.08).translate(u, yb + h / 2, v);
    for (const [du, v, w, d, h] of STAD.clubs) {
      const u = -hl + du;
      wall.push(box(w, h + 0.4, d, u, -0.4, v));
      tiles.push(hip(w, d, h > 5 ? 2.6 : 1.8, u, h, v));
      for (let f = 0; f < Math.floor(h / 3); f++) // windows on the side facing the pitch
        for (let k = 0; k < Math.floor(d / 3.2); k++) glass.push(box(0.1, 1.3, 1.2, u + w / 2 + 0.03, 1.1 + f * 3, v - d / 2 + 1.6 + k * 3.2));
    }
    const pl = (parts: THREE.BufferGeometry[], mat: THREE.Material) => place(parts, mat, c[0], y, c[1], rot);
    pl(lines, M('#f7f5ef'));
    pl(goals, M('#fbfbf8'));
    pl(terr, M('#cdc8be'));
    pl(wall, M('#ebe7df'));
    pl(brick, M('#b4614a'));
    pl(redRoof, M('#8b2e26'));
    pl(redSteel, M('#a8392f'));
    pl(white, M('#f3f3f0'));
    pl(canopy, M('#dfe2e4'));
    pl(tiles, M('#74594c'));
    pl(glass, M('#4d5866'));
    pl(yellow, M('#e8c23a'));
  }

  // ---------------- Брана Тиквеш (1968) and ХЕЦ Тиквеш at the north end of Тиквешко Езеро. A rockfill
  // dam with a clay core, 113.5 m from its foundation, crest 338 m (Wikipedia, ЕСМ). The dam body is
  // raised in the terrain (`dams`, scripts/config.ts); here: the rock face downstream with its berms,
  // the riprap running into the lake, the crest's parapets and lamps, the spillway's intake on the
  // east bank, the power house at the foot (113 MW, four units) and its switchyard. The outlines are
  // OSM's; heights and details are read off overview photos, not surveyed.
  if (L.damCrest && L.dam) {
    const crest = toPts(L.damCrest), face = toPts(L.dam);
    const segs = crest.slice(1).map((b, i) => [crest[i], b] as const);
    const segD = (x: number, z: number) => {
      let d = Infinity;
      for (const [a, b] of segs) {
        const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
      }
      return d;
    };
    // downstream: the side that is lower 100 m out (the lake side stops at the water level)
    const downN = ([a, b]: readonly [Pt, Pt]): Pt => {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const n: Pt = [-dz / len, dx / len];
      return T(mx + n[0] * 100, mz + n[1] * 100) < T(mx - n[0] * 100, mz - n[1] * 100) ? n : [-n[0], -n[1]];
    };
    const top = Math.max(...crest.map(Tp)), HALF = 8; // the crest (half its width): as raised in the terrain
    // the downstream face: rock, a little rough, with a berm every 20 m of height (the access road)
    {
      // the OSM outline triangulated, split until every edge is under 3 m so it follows the ground
      const pos: number[] = [], col: number[] = [];
      const rock = new THREE.Color('#b5ad9e'), berm = new THREE.Color('#d6cdb9'), riprap = new THREE.Color('#9d9688'), c = new THREE.Color();
      // the lake side of the crest: the nearest crest segment's downstream normal points away
      const upstream = (x: number, z: number) => {
        let best = Infinity, side = false;
        for (const sg of segs) {
          const [p, q] = sg, dx = q[0] - p[0], dz = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1)));
          const ex = x - p[0] - t * dx, ez = z - p[1] - t * dz, dd = Math.hypot(ex, ez);
          if (dd < best) { const n = downN(sg); best = dd; side = ex * n[0] + ez * n[1] < 0; }
        }
        return side;
      };
      const hash = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
      const tri = (a: Pt, b: Pt, d: Pt): void => {
        const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bd = Math.hypot(d[0] - b[0], d[1] - b[1]), da = Math.hypot(a[0] - d[0], a[1] - d[1]);
        const m = Math.max(ab, bd, da);
        // finer along the crest, so the edge there is hidden by the parapet
        if (m > 3 || (m > 0.8 && segD((a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3) < HALF + 3)) {
          const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          if (m === ab) { const n = mid(a, b); tri(a, n, d); tri(n, b, d); }
          else if (m === bd) { const n = mid(b, d); tri(a, b, n); tri(a, n, d); }
          else { const n = mid(d, a); tri(a, b, n); tri(n, b, d); }
          return;
        }
        const cx = (a[0] + b[0] + d[0]) / 3, cz = (a[1] + b[1] + d[1]) / 3;
        if (segD(cx, cz) < HALF - 0.5) return; // the crest (its road and parapets)
        const drop = top - T(cx, cz), up = upstream(cx, cz), onBerm = !up && drop > 6 && drop % 20 < 2.4;
        c.copy(up ? riprap : onBerm ? berm : rock).multiplyScalar(0.92 + 0.14 * hash(Math.round(cx / 2), Math.round(cz / 2)));
        for (const p of [a, b, d]) { pos.push(p[0], T(p[0], p[1]) + 0.3, p[1]); col.push(c.r, c.g, c.b); }
      };
      const v2 = face.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v2, [])) tri(face[i], face[j], face[k]);
      // keep the triangles facing up
      for (let k = 0; k < pos.length; k += 9) {
        const ux = pos[k + 3] - pos[k], uz = pos[k + 5] - pos[k + 2], vx = pos[k + 6] - pos[k], vz = pos[k + 8] - pos[k + 2];
        if (ux * vz - uz * vx > 0) for (let q = 0; q < 3; q++) { const t = pos[k + 3 + q]; pos[k + 3 + q] = pos[k + 6 + q]; pos[k + 6 + q] = t; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      add(g, M('#ffffff', { vertexColors: true }));
    }
    // the crest: the road on it, HALF either side as raised in the terrain; parapets on both edges,
    // lamps along the downstream one. The rock mesh covers both faces (riprap on the lake side).
    const parapet: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = [], lampHeads: THREE.BufferGeometry[] = [];
    let along = 0;
    for (const sg of segs) {
      const [a, b] = sg, n = downN(sg), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) continue;
      const rot = Math.atan2(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (const off of [-(HALF - 0.6), HALF - 0.6])
        parapet.push(new THREE.BoxGeometry(0.45, 1.1, len + 0.45).rotateY(rot).translate(mx + n[0] * off, top + 0.55, mz + n[1] * off));
      for (let s = (30 - (along % 30)) % 30; s < len; s += 30) {
        const t = s / len, px = a[0] + (b[0] - a[0]) * t + n[0] * (HALF - 0.6), pz = a[1] + (b[1] - a[1]) * t + n[1] * (HALF - 0.6);
        posts.push(new THREE.CylinderGeometry(0.09, 0.12, 7, 6).translate(px, top + 3.5, pz), box(1.2, 0.12, 0.25, px - n[0] * 0.5, top + 6.9, pz - n[1] * 0.5));
        lampHeads.push(box(0.5, 0.18, 0.3, px - n[0] * 1.0, top + 6.8, pz - n[1] * 1.0));
      }
      along += len;
    }
    place(parapet, concrete, 0, 0, 0, 0);
    place(posts, M('#5d6064'), 0, 0, 0, 0);
    if (lampHeads.length) {
      const lampMat = M('#f2ead2', { emissive: '#ffd890', emissiveIntensity: 0 });
      nightGlass.push(lampMat);
      place(lampHeads, lampMat, 0, 0, 0, 0);
    }
  }
  // the spillway: a round bell-mouth intake in the lake off the east end of the crest (OSM: a round
  // water area ~40 m across, a culvert from it under the bank to the chute below the dam). A concrete
  // lip a few metres under the crest, piers round it against vortices, a dark funnel inside
  if (L.spillway) {
    const ring = toPts(L.spillway);
    const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    const R = ring.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / ring.length;
    const crestTop = L.damCrest ? Math.max(...toPts(L.damCrest).map(Tp)) : Tp(c as Pt) + 10;
    const lip = crestTop - 3, base = Tp(c as Pt) - 6;
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(R, R + 2.5, lip - base, 40, 1, true).translate(0, (lip + base) / 2, 0),
      new THREE.TorusGeometry(R - 0.6, 0.8, 6, 40).rotateX(Math.PI / 2).translate(0, lip, 0)];
    for (let k = 0; k < 8; k++) { // the piers point to the centre
      const a = (k / 8) * Math.PI * 2;
      parts.push(new THREE.BoxGeometry(3, 2.2, 1.2).rotateY(-a).translate(Math.cos(a) * (R - 1.4), lip + 1.1, Math.sin(a) * (R - 1.4)));
    }
    place(parts, M('#d9d2c3', { side: THREE.DoubleSide }), c[0], 0, c[1], 0);
    place([new THREE.CylinderGeometry(R - 1.2, 3.5, 14, 40, 1, true).translate(0, lip - 7, 0), new THREE.CircleGeometry(3.6, 20).rotateX(-Math.PI / 2).translate(0, lip - 14, 0)],
      M('#3d4448', { side: THREE.DoubleSide }), c[0], 0, c[1], 0);
  }
  // ХЕЦ Тиквеш: the machine hall at the foot of the dam, tall window bands on the long sides, a
  // lower control block at the end, transformers by the wall; the tailrace opens into the river
  if (L.hpp) {
    const o = obb(toPts(L.hpp));
    if (o) {
      const rot = Math.atan2(o.a[0], o.a[1]), hl = o.L, hw = o.W;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]): Pt => [o.c[0] + o.a[0] * hl * u + o.b[0] * hw * v, o.c[1] + o.a[1] * hl * u + o.b[1] * hw * v]);
      const y = Math.min(...corners.map(Tp)) - 0.5, H = 17;
      const hall: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
      const cl = hl * 0.28; // the control block's share of the length
      // local frame: z along the long axis (rot), x across
      hall.push(box(hw * 2, H, (hl - cl) * 2, 0, 0, cl));
      hall.push(box(hw * 2 - 1, 9, cl * 2, 0, 0, -hl + cl));
      roof.push(box(hw * 2 + 0.6, 0.6, (hl - cl) * 2 + 0.6, 0, H, cl), box(hw * 2 - 0.4, 0.5, cl * 2 + 0.4, 0, 9, -hl + cl));
      dark.push(box(hw * 2 + 0.3, 1.2, hl * 2 + 0.3, 0, 0, 0)); // plinth
      const z0 = -hl + cl * 2 + 2.5, z1 = hl - 2.5, n = Math.max(3, Math.floor((z1 - z0) / 4.5));
      for (let k = 0; k <= n; k++) {
        const z = z0 + ((z1 - z0) * k) / n;
        for (const sd of [-1, 1]) glass.push(box(0.15, H - 5, 2.4, sd * (hw + 0.05), 2.8, z));
      }
      for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) glass.push(box(0.15, 1.4, cl * 2 - 3, sd * (hw - 0.45), 1.8 + k * 2.6, -hl + cl));
      // the tailrace: four outlets under the downstream long side
      for (let k = 0; k < 4; k++) dark.push(box(0.4, 3.2, 4, hw + 0.2, -2, cl - (hl - cl) * 0.75 + ((hl - cl) * 1.5 * k) / 3));
      place(hall, M('#e2dccd'), o.c[0], y, o.c[1], rot);
      place(roof, M('#8f8a80'), o.c[0], y, o.c[1], rot);
      place(dark, M('#6d6b65'), o.c[0], y, o.c[1], rot);
      const g = M('#4d5866', { emissive: '#ffd27a', emissiveIntensity: 0 });
      nightGlass.push(g);
      place(glass, g, o.c[0], y, o.c[1], rot);
    }
  }
  // the switchyard: a gravel pad, steel gantries carrying the 110 kV lines, transformers
  if (L.switchyard) {
    const o = obb(toPts(L.switchyard));
    if (o) {
      const rot = Math.atan2(o.a[0], o.a[1]), hl = o.L, hw = o.W;
      const y = Tp(o.c);
      const steel: THREE.BufferGeometry[] = [], tr: THREE.BufferGeometry[] = [], pad: THREE.BufferGeometry[] = [], ins: THREE.BufferGeometry[] = [];
      pad.push(box(hw * 2, 1.4, hl * 2, 0, -1.2, 0));
      const rows = Math.max(2, Math.floor((hl * 2 - 6) / 9));
      for (let r = 0; r <= rows; r++) {
        const z = -hl + 3 + ((hl * 2 - 6) * r) / rows;
        for (const sd of [-1, 1]) steel.push(box(0.5, 11, 0.5, sd * (hw - 2), 0, z));
        steel.push(box(hw * 2 - 3.5, 0.6, 0.6, 0, 10.6, z));
        for (let k = -1; k <= 1; k++) ins.push(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 6).translate(k * (hw - 3) * 0.6, 9.6, z));
      }
      for (let k = 0; k < 3; k++) {
        const z = -hl * 0.55 + (hl * 1.1 * k) / 2;
        tr.push(box(3.2, 3.4, 4.2, -hw * 0.25, 0, z), box(0.4, 2.6, 3.8, -hw * 0.25 + 1.9, 0.5, z), box(0.4, 2.6, 3.8, -hw * 0.25 - 1.9, 0.5, z));
        ins.push(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6).translate(-hw * 0.25, 4.2, z - 1), new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6).translate(-hw * 0.25, 4.2, z + 1));
      }
      place(pad, M('#bdb6a8'), o.c[0], y, o.c[1], rot);
      place(steel, M('#9ea3a6'), o.c[0], y, o.c[1], rot);
      place(tr, M('#5f6a63'), o.c[0], y, o.c[1], rot);
      place(ins, M('#d8d2c4'), o.c[0], y, o.c[1], rot);
    }
  }

  // ---------------- Kavadarci, the Луда Мара: copings, railings, footbridges, bridge parapets, steps,
  // benches, lamps (river.ts; the water, banks and promenades are draped ground, city.ts)
  const cl = canalLayout(data, terrain);
  if (cl) {
    const cn = createCanal(cl, terrain, M);
    group.add(cn.group);
    nightGlass.push(...cn.glass);
  }

  return {
    group,
    gondola,
    /** see-through parts that draw no ink lines (InkRenderer.skipNormal) */
    noInk: square?.noInk ?? [],
    update(dt: number): void {
      for (const f of animated) f(dt);
      square?.update(dt);
      if (crossMat) crossMat.emissiveIntensity = SHARED.uNight.value * 0.9;
      if (stationGlass) stationGlass.emissiveIntensity = SHARED.uNight.value * 0.55;
      for (const m of nightGlass) m.emissiveIntensity = SHARED.uNight.value * 0.6;
      if (cultureGlass) cultureGlass.emissiveIntensity = SHARED.uNight.value * 0.6;
      for (const m of market?.nightLit ?? []) m.emissiveIntensity = SHARED.uNight.value * 0.6;
    },
  };
}
