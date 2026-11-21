// Shared kit for hand-built models on OSM outlines (Bitola, Ohrid, Rostuše, Prilep, Kruševo): a frame along an
// outline's long axis, parts by material in that frame, and the materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { obb } from './geo.ts';
import { strip } from './churches.ts';
import type { Terrain } from './terrain.ts';
import type { Flat, Pt } from './types.ts';

export type Key = 'stone' | 'stoneDark' | 'ashlar' | 'cream' | 'white' | 'pink' | 'brick' | 'lead' | 'tile' | 'glass' | 'dark' | 'door' | 'gold' | 'face' | 'iron'
  | 'concrete' | 'concreteDark' | 'wood' | 'woodDark' | 'rock' | 'rockDark' | 'plaster' | 'ochre' | 'copper' | 'stained' | 'green' | 'water' | 'slate';

export const toPts = (r: Flat): Pt[] => { const p: Pt[] = []; for (let i = 0; i < r.length; i += 2) p.push([r[i], r[i + 1]]); return p; };

/** A model's frame: u along the outline's long axis, v across it (both m), y up from the floor. */
export interface Frame { c: Pt; a: Pt; b: Pt; L: number; W: number; y: number; under: number; m: THREE.Matrix4; local: (x: number, z: number) => Pt; world: (u: number, v: number) => Pt }
export function frame(r: Flat, terrain: Terrain, axis?: Pt, toward = false): Frame | null {
  const pts = toPts(r), o = obb(pts);
  if (!o) return null;
  let a = o.a, b = o.b, L = o.L, W = o.W;
  // `toward`: u is the outline's axis closer to `axis` even when it is the shorter one (a church's apse east)
  if (toward && axis && Math.abs(b[0] * axis[0] + b[1] * axis[1]) > Math.abs(a[0] * axis[0] + a[1] * axis[1])) { [a, b] = [b, a]; [L, W] = [W, L]; }
  if (axis && a[0] * axis[0] + a[1] * axis[1] < 0) a = [-a[0], -a[1]];
  if (a[0] * b[1] - b[0] * a[1] < 0) b = [-b[0], -b[1]]; // keep the frame right-handed (no mirrored faces)
  const hs = pts.map(([x, z]) => terrain.at(x, z));
  const y = Math.max(...hs) + 0.2, under = Math.min(...hs) - y - 0.6;
  const c = o.c;
  const m = new THREE.Matrix4().set(a[0], 0, b[0], c[0], 0, 1, 0, y, a[1], 0, b[1], c[1], 0, 0, 0, 1);
  return {
    c, a, b, L, W, y, under, m,
    local: (x, z) => [(x - c[0]) * a[0] + (z - c[1]) * a[1], (x - c[0]) * b[0] + (z - c[1]) * b[1]],
    world: (u, v) => [c[0] + a[0] * u + b[0] * v, c[1] + a[1] * u + b[1] * v],
  };
}

/** Parts by material, built in a frame's local space (x = u, z = v). */
export function parts() {
  const map = new Map<Key, THREE.BufferGeometry[]>();
  const add = (k: Key, g: THREE.BufferGeometry) => { let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(g); return g; };
  const box = (k: Key, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number) =>
    add(k, new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0).translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2));
  const cyl = (k: Key, u: number, v: number, y0: number, y1: number, r0: number, r1 = r0, seg = 16) =>
    add(k, new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(u, (y0 + y1) / 2, v));
  const cone = (k: Key, u: number, v: number, y: number, r: number, h: number, seg = 16) =>
    add(k, new THREE.ConeGeometry(r, h, seg).translate(u, y + h / 2, v));
  const dome = (k: Key, u: number, v: number, y: number, r: number, squash = 1) =>
    add(k, new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, squash, 1).translate(u, y, v));
  /** an arched opening w wide and h high (to the top of the arch), d deep, built facing +z */
  const arch = (w: number, h: number, d = 0.08) => {
    const r = w / 2, body = Math.max(0.01, h - r);
    const top = new THREE.CylinderGeometry(r, r, d, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, body, d / 2);
    return mergeGeometries([new THREE.BoxGeometry(w, body, d).translate(0, body / 2, d / 2).toNonIndexed(), top.toNonIndexed()].map(strip))!;
  };
  /** a feature built facing +z put at (u, v, y), turned to face (sin ang, cos ang) in (u, v) */
  const put = (k: Key, g: THREE.BufferGeometry, u: number, v: number, y: number, ang: number) => add(k, g.rotateY(ang).translate(u, y, v));
  /** walls on an outline (local u, v) from y0 to y1 */
  const walls = (k: Key, ring: Pt[], y0: number, y1: number) =>
    add(k, new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([u, v]) => new THREE.Vector2(u, -v))), { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0));
  /** the outline's edges: f(mid u, mid v, length, outward facing angle) */
  const edges = (ring: Pt[], f: (u: number, v: number, len: number, ang: number) => void) => {
    let a2 = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], du = q[0] - p[0], dv = q[1] - p[1], len = Math.hypot(du, dv);
      if (len < 0.4) continue;
      const ou = (a2 > 0 ? dv : -dv) / len, ov = (a2 > 0 ? -du : du) / len; // outward
      f((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, len, Math.atan2(ou, ov));
    }
  };
  /** thin bands round an outline (courses, cornices) */
  const bands = (k: Key, ring: Pt[], ys: number[], t: number, o = 0.06) =>
    edges(ring, (u, v, len, ang) => { for (const y of ys) put(k, new THREE.BoxGeometry(len + 2 * o, t, 2 * o).translate(0, t / 2, 0), u, v, y, ang); });
  /** a hipped roof over a rectangle (u0…u1, v0…v1) from its eaves at y, `o` overhang */
  const hip = (k: Key, u0: number, u1: number, v0: number, v1: number, y: number, rise: number, o = 0.4) => {
    const lu = u1 - u0 + 2 * o, lv = v1 - v0 + 2 * o, r = Math.max(0, (lu - lv) / 2);
    const g = new THREE.BufferGeometry(), U0 = u0 - o, U1 = u1 + o, V0 = v0 - o, V1 = v1 + o, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, T = y + rise;
    const A = [U0, y, V0], B = [U1, y, V0], C = [U1, y, V1], D = [U0, y, V1], R1 = [cu - r, T, cv], R2 = [cu + r, T, cv];
    const tri = [A, R1, R2, A, R2, B, D, R2, R1, D, C, R2, A, D, R1, B, R2, C].flat(); // eaves to ridge, both hips
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    g.computeVertexNormals();
    return add(k, g);
  };
  /** an Orthodox cross on a ball (three bars, the lowest slanted), s ≈ its height in metres / 2 */
  const cross = (u: number, v: number, y: number, s: number) => {
    const g = (w: number, h: number, yy: number, rot = 0) => new THREE.BoxGeometry(w * s, h * s, 0.1 * s).rotateZ(rot).translate(0, yy * s, 0);
    const ps = [new THREE.SphereGeometry(0.16 * s, 8, 6).translate(0, 0.05 * s, 0), g(0.11, 1.8, 0.9), g(1.0, 0.11, 1.25), g(0.55, 0.1, 1.55), g(0.65, 0.1, 0.6, 0.35)];
    add('gold', mergeGeometries(ps.map((p) => strip(p.index ? p.toNonIndexed() : p)))!.translate(u, y, v));
  };
  return { map, add, box, cyl, cone, dome, arch, put, walls, edges, bands, hip, cross };
}
export type Parts = ReturnType<typeof parts>;

// facing angles in a frame: toward +u, −u, +v, −v
export const PU = Math.PI / 2, MU = -Math.PI / 2, PV = 0, MV = Math.PI;


/** The materials (by key, one each) and `place`, which merges a model's parts per material into `group` in a frame. */
export function modelKit(group: THREE.Group, clippingPlanes: THREE.Plane[]) {
  const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const glass = mat('#3a3b40', { emissive: '#ffd08a', emissiveIntensity: 0 });
  const stained = mat('#3f6fa6', { emissive: '#ffb860', emissiveIntensity: 0 });
  const MATS: Record<Key, THREE.Material> = {
    stone: mat('#b9aa92'), stoneDark: mat('#9d8f7a'), ashlar: mat('#e2d6c0'), cream: mat('#ece2cf'), white: mat('#f4f0e8'),
    pink: mat('#efd9cf'), brick: mat('#b96a4c'), lead: mat('#8e959b'), tile: mat('#c9653f'), glass, dark: mat('#2e2b2b'),
    door: mat('#7a4a2a'), gold: mat('#e3b84c', { emissive: '#6a4a10', emissiveIntensity: 0.25 }), face: mat('#26386a'), iron: mat('#2b2b2e'),
    concrete: mat('#cdc8bd'), concreteDark: mat('#a9a497'), wood: mat('#8a5a32'), woodDark: mat('#5a3a22'), rock: mat('#a99d8b'), rockDark: mat('#857a6b'),
    plaster: mat('#f1e9d8'), ochre: mat('#d9b27a'), copper: mat('#7fa596'), stained, green: mat('#6f8a55'), water: mat('#6a98b0'), slate: mat('#6b6862'),
  };
  const place = (p: Parts, f: { m: THREE.Matrix4 }) => {
    for (const [k, list] of p.map) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => strip(g.index ? g.toNonIndexed() : g)))!.applyMatrix4(f.m), MATS[k]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  return { MATS, glass, stained, place };
}

/** A gable roof over a rectangle, its ridge along u (or along v with `alongV`): slopes in `roof`, the two gable
 *  triangles in `wall`; `o` overhang at the eaves */
export function gable(p: Parts, roof: Key, wall: Key | null, u0: number, u1: number, v0: number, v1: number, y: number, rise: number, alongV = false, o = 0.3) {
  // built along x (length) and z (span), then turned
  const lx0 = alongV ? v0 : u0, lx1 = alongV ? v1 : u1, s0 = alongV ? u0 : v0, s1 = alongV ? u1 : v1, sm = (s0 + s1) / 2;
  const sl = (za: number) => [lx0 - o, y, za, lx1 + o, y, za, lx1 + o, y + rise, sm, lx0 - o, y, za, lx1 + o, y + rise, sm, lx0 - o, y + rise, sm];
  const turn = (q: THREE.BufferGeometry) => (alongV ? q.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)) : q);
  const ext = rise * o / Math.max(0.1, sm - s0); // the eaves drop below `y` by the overhang's share of the slope
  const top = facing([...sl(s0 - o), ...sl(s1 + o)].map((c, i) => (i % 3 === 1 && c === y ? y - ext : c)), [0, 1, 0]);
  p.add(roof, turn(tris(top)));
  p.add(roof, turn(tris(facing(top.map((c, i) => (i % 3 === 1 ? c - 0.08 : c)), [0, -1, 0])))); // its underside
  if (wall) for (const x of [lx0, lx1]) p.add(wall, turn(tris(facing([x, y, s0, x, y, s1, x, y + rise, sm], [x === lx0 ? -1 : 1, 0, 0]))));
}
/** triangles (flat xyz list) turned so each faces `d` */
export function facing(t: number[], d: [number, number, number]): number[] {
  const out = t.slice();
  for (let i = 0; i < out.length; i += 9) {
    const ax = out[i + 3] - out[i], ay = out[i + 4] - out[i + 1], az = out[i + 5] - out[i + 2];
    const bx = out[i + 6] - out[i], by = out[i + 7] - out[i + 1], bz = out[i + 8] - out[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * d[0] + ny * d[1] + nz * d[2] < 0) for (let k = 0; k < 3; k++) { const q = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = q; }
  }
  return out;
}
export function tris(t: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3));
  g.computeVertexNormals();
  return g;
}

/** A Byzantine church on its outline (Ohrid, Струга, Бигорски, Прилеп, Крушево): the naos as a cross of two gabled
 *  arms over lower corner bays, a drum with arched windows and a tiled cone over the crossing, the apse at +u
 *  (east), a narthex at −u; cloisonné masonry (stone with brick courses) or white plaster, arched windows in
 *  brick frames, a gold cross. Sizes from the frame (L, W: half length and width). */
export interface ChurchOpts {
  /** eaves of the corner bays and of the cross arms (m above the floor) */
  low?: number; high?: number;
  /** wall material and its courses: cloisonné, plain stone, white plaster */
  wall?: 'cloisonne' | 'stone' | 'white';
  roof?: Key;
  /** the crossing's drum: radius (default from the width), height, sides */
  drum?: { r?: number; h?: number; sides?: number } | false;
  /** small drums: at the west corners of the naos (2) or all four */
  minor?: 0 | 2 | 4;
  /** a narthex (lower, at −u) of this length, with an open arcade on its west and side faces */
  narthex?: number; arcade?: boolean;
  /** side conches (Св. Наум, Св. Пантелејмон: a trefoil plan) */
  conches?: boolean;
  /** a bell tower at a corner of the narthex: side half-width and height; v side (±1) */
  tower?: { h: number; s?: number; side?: 1 | -1 };
  /** rows of window arches on the long sides */
  windows?: number;
  /** brick courses in stone or cloisonné walls (default true; Лешок's grey ashlar has none) */
  courses?: boolean;
}
export function byzChurch(p: Parts, f: Frame, o: ChurchOpts = {}): void {
  const L = f.L, W = f.W, under = f.under;
  const low = o.low ?? Math.min(6.5, 2.2 + W * 0.55), high = o.high ?? low + Math.min(3.2, 1 + W * 0.3);
  const wallK: Key = o.wall === 'white' ? 'plaster' : o.wall === 'stone' ? 'stone' : 'ashlar', roof = o.roof ?? 'tile';
  const bricks = o.wall !== 'white' && o.courses !== false;
  const rA = Math.min(W * 0.42, 3.2), nar = Math.min(o.narthex ?? 0, L * 0.6);
  const u0 = -L + nar, u1 = L - rA * 0.9, cw = Math.max(1.4, W * 0.36); // the naos and half the arms' width
  const cu = (u0 + u1) / 2 + (u1 - u0) * 0.08; // the crossing, a little east of the middle
  // plinth, corner bays, the arms
  p.box('stoneDark', -L, u1, -W, W, under, 0.4);
  p.box(wallK, u0, u1, -W, W, 0.4, low);
  p.box(wallK, u0, u1, -cw, cw, low, high); // the arm along u (nave)
  p.box(wallK, cu - cw, cu + cw, -W, W, low, high); // the transept
  const courses = (u0_: number, u1_: number, v0: number, v1: number, y0: number, y1: number, step = 0.75) => {
    if (!bricks) return;
    for (let y = y0 + step; y < y1 - 0.2; y += step) p.box('brick', u0_ - 0.03, u1_ + 0.03, v0 - 0.03, v1 + 0.03, y, y + 0.11);
  };
  courses(u0, u1, -W, W, 0.4, low);
  courses(u0, u1, -cw, cw, low, high, 0.6);
  courses(cu - cw, cu + cw, -W, W, low, high, 0.6);
  p.box('cream', u0 - 0.12, u1 + 0.12, -W - 0.12, W + 0.12, low - 0.18, low); // cornice
  // roofs: lean-to hips over the corner bays, gables on the arms
  const rise = cw * 0.55;
  p.hip(roof, u0, cu - cw, -W, -cw, low, 0.9, 0.35); p.hip(roof, u0, cu - cw, cw, W, low, 0.9, 0.35);
  p.hip(roof, cu + cw, u1, -W, -cw, low, 0.9, 0.35); p.hip(roof, cu + cw, u1, cw, W, low, 0.9, 0.35);
  gable(p, roof, wallK, u0, u1, -cw, cw, high, rise, false, 0.3);
  gable(p, roof, wallK, cu - cw, cu + cw, -W, W, high, rise, true, 0.3);
  // a big blind arch in brick on each gable end, a window in it
  for (const [uu, vv, ang] of [[u1, 0, PU], [u0, 0, MU], [cu, W, PV], [cu, -W, MV]] as const) {
    p.put('brick', p.arch(cw * 1.5, high - low + cw * 0.5, 0.05), uu, vv, low + 0.2, ang);
    p.put(wallK, p.arch(cw * 1.3, high - low + cw * 0.35, 0.06), uu, vv, low + 0.2, ang);
    p.put('brick', p.arch(0.9, 1.9, 0.07), uu, vv, low + 0.6, ang);
    p.put('glass', p.arch(0.6, 1.6, 0.09), uu, vv, low + 0.75, ang);
  }
  // windows on the long sides
  const rows = o.windows ?? 1;
  for (const sv of [-1, 1]) for (const uu of [u0 + (cu - cw - u0) / 2, cu + cw + (u1 - cu - cw) / 2]) for (let r = 0; r < rows; r++) {
    const y = 1.4 + r * 2.4;
    if (y + 2 > low) continue;
    p.put('brick', p.arch(1.25, 2.3, 0.05), uu, sv * W, y - 0.15, sv > 0 ? PV : MV);
    p.put('glass', p.arch(0.8, 1.95, 0.08), uu, sv * W, y, sv > 0 ? PV : MV);
  }
  // the apse: a half cylinder (five sides) with a half cone, three windows
  if (rA > 0.8) {
    p.add(wallK, new THREE.CylinderGeometry(rA, rA, high - 0.4, 10, 1, false, 0, Math.PI).translate(u1, 0.4 + (high - 0.4) / 2, 0));
    if (bricks) for (let y = 1.2; y < high - 0.4; y += 0.75) p.add('brick', new THREE.CylinderGeometry(rA + 0.03, rA + 0.03, 0.11, 10, 1, true, 0, Math.PI).translate(u1, y, 0));
    p.add(roof, new THREE.ConeGeometry(rA + 0.3, rise * 0.9, 10, 1, false, 0, Math.PI).translate(u1, high + rise * 0.45, 0));
    p.add('stoneDark', new THREE.CylinderGeometry(rA + 0.05, rA + 0.05, 0.4 - under, 10, 1, false, 0, Math.PI).translate(u1, (0.4 + under) / 2, 0));
    for (const a of [-0.6, 0, 0.6]) p.put('glass', p.arch(0.55, 1.7, 0.08), u1 + Math.cos(a) * rA * 0.98, Math.sin(a) * rA * 0.98, 2.2, Math.PI / 2 + a);
  }
  // side conches
  if (o.conches) for (const sv of [-1, 1]) {
    const rc = cw * 0.95;
    p.add(wallK, new THREE.CylinderGeometry(rc, rc, low - 0.4, 10, 1, false, sv > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).translate(cu, 0.4 + (low - 0.4) / 2, sv * W));
    p.add(roof, new THREE.ConeGeometry(rc + 0.25, 1.0, 10, 1, false, sv > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).translate(cu, low + 0.5, sv * W));
  }
  // the drum over the crossing
  if (o.drum !== false) {
    const d = o.drum || {}, rD = d.r ?? Math.min(cw * 1.05, 3.4), hD = d.h ?? rD * 1.5, sides = d.sides ?? 8, y0 = high + rise * 0.6;
    p.cyl(wallK, cu, 0, high, y0 + hD, rD, rD, sides);
    if (bricks) for (let y = y0 + 0.5; y < y0 + hD - 0.3; y += 0.7) p.cyl('brick', cu, 0, y, y + 0.1, rD + 0.03, rD + 0.03, sides);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + Math.PI / sides, ap = rD * Math.cos(Math.PI / sides);
      p.put('brick', p.arch(rD * 0.62, hD * 0.72, 0.05), cu + Math.sin(a) * ap, Math.cos(a) * ap, y0 + hD * 0.12, a); // the blind arcade
      if (k % 2 === 0 || sides <= 8) p.put('glass', p.arch(rD * 0.26, hD * 0.5, 0.08), cu + Math.sin(a) * ap, Math.cos(a) * ap, y0 + hD * 0.2, a);
    }
    p.cyl('cream', cu, 0, y0 + hD - 0.15, y0 + hD + 0.05, rD + 0.15, rD + 0.15, sides);
    p.cone(roof, cu, 0, y0 + hD, rD + 0.45, rD * 0.55, sides);
    p.cross(cu, 0, y0 + hD + rD * 0.55, 0.7);
  }
  // small drums
  for (const [mu, mv] of (o.minor === 4 ? [[u0 + 1.6, -W + 1.6], [u0 + 1.6, W - 1.6], [u1 - 1.6, -W + 1.6], [u1 - 1.6, W - 1.6]] : o.minor === 2 ? [[u0 + 1.6, -W + 1.6], [u0 + 1.6, W - 1.6]] : []) as [number, number][]) {
    const r = 1.15;
    p.cyl(wallK, mu, mv, low, high + 1.6, r, r, 8);
    if (bricks) p.cyl('brick', mu, mv, high + 0.6, high + 0.72, r + 0.03, r + 0.03, 8);
    p.cone(roof, mu, mv, high + 1.6, r + 0.3, 0.7, 8);
    p.cross(mu, mv, high + 2.3, 0.4);
  }
  // the narthex: lower, with an open arcade (dark arches) or windows, and the west door
  if (nar > 0.5) {
    const nh = low - 0.6;
    p.box(wallK, -L, u0, -W, W, 0.4, nh);
    courses(-L, u0, -W, W, 0.4, nh);
    gable(p, roof, wallK, -L, u0 + 0.2, -W, W, nh, Math.min(2.2, W * 0.35), true, 0.35);
    const bays = Math.max(2, Math.round((2 * W) / 3));
    for (let i = 0; i < bays; i++) {
      const v = -W + (2 * W * (i + 0.5)) / bays;
      p.put(o.arcade ? 'dark' : 'brick', p.arch(Math.min(2.2, (2 * W) / bays - 0.7), Math.min(nh - 0.6, 3.2), 0.06), -L, v, 0.4, MU);
    }
    if (o.arcade) for (const sv of [-1, 1]) for (let u = -L + nar / 2; u < u0; u += 10) p.put('dark', p.arch(Math.min(2.2, nar - 1), Math.min(nh - 0.6, 3.2), 0.06), u, sv * W, 0.4, sv > 0 ? PV : MV);
  } else p.put('door', p.arch(1.4, 2.6, 0.1), u0, 0, 0.4, MU);
  // the bell tower at the west end (Св. Пантелејмон)
  if (o.tower) {
    const s = o.tower.s ?? 2.2, h = o.tower.h, sv = o.tower.side ?? 1, tu = -L + s, tv = sv * (W - s);
    p.box(wallK, tu - s, tu + s, tv - s, tv + s, under, h);
    courses(tu - s, tu + s, tv - s, tv + s, 0.4, h, 0.9);
    for (const [ang, du, dv] of [[PU, s, 0], [MU, -s, 0], [PV, 0, s], [MV, 0, -s]] as const) {
      p.put('brick', p.arch(1.5, 2.8, 0.05), tu + du, tv + dv, h - 3.6, ang);
      p.put('dark', p.arch(1.1, 2.5, 0.07), tu + du, tv + dv, h - 3.5, ang);
      p.put('glass', p.arch(0.5, 1.4, 0.07), tu + du, tv + dv, h * 0.5, ang);
    }
    p.box('cream', tu - s - 0.15, tu + s + 0.15, tv - s - 0.15, tv + s + 0.15, h - 0.2, h);
    p.add(roof, new THREE.ConeGeometry(s * 1.45, 1.8, 4).rotateY(Math.PI / 4).translate(tu, h + 0.9, tv));
    p.cross(tu, tv, h + 1.8, 0.6);
  }
}
