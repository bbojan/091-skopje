// Kavadarci: the town churches, after photos (Nov 2026) and an aerial image (Esri World Imagery), on
// their OSM outlines (the generic buildings are left out, `petka` / `dimitrij` in PREP).
// - Св. Димитриј (renovated): grey-brown rubble-stone walls with brick-red courses and brick arches round
//   the windows (cross-shaped openings), a cream cornice, tiled lean-to roofs; above them a white
//   rendered nave and transept with tiled gable roofs, a white octagonal drum with arched windows over the
//   crossing; the bell tower in the middle of the west front: stone below, two white stages with arched
//   openings and round oculi above, a low tiled cap. Gold crosses.
// - Св. Петка (new, Byzantine revival): pale ashlar banded with brick (cloisonné), red tiled roofs; a wide
//   west front: a tall gabled middle bay with a big arch over the porch, a gabled side bay on each side
//   with a door, a dome on its drum and a rounded end; behind it the cross-in-square naos with crossing
//   gable roofs, the tall main drum, two small drums at the east corners and the apse. The bell tower
//   stands apart, ~34 m south-east (aerial image): a square stone shaft, tiled eaves, an octagonal belfry
//   with arched openings and a small tiled dome.
// Heights are read off the photos (door ≈ 2.6 m), not measured.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat, Pt } from './types.ts';

/** A church's frame: origin at the middle of its outline's bounding box, e east, n north (m), y up from its floor. */
export interface ChurchFrame {
  cx: number;
  cz: number;
  /** the floor (absolute): a little above the highest ground under the outline */
  y: number;
  /** the lowest ground under the outline, relative to the floor (the plinth goes down to it) */
  under: number;
  /** the outline in the frame, [e, n] */
  ring: Pt[];
}

function churchFrame(r: Flat, terrain: Terrain): ChurchFrame {
  const pts: Pt[] = [];
  for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const hs = pts.map(([x, z]) => terrain.at(x, z));
  const y = Math.max(...hs) + 0.25;
  return { cx, cz, y, under: Math.min(...hs) - y - 0.6, ring: pts.map(([x, z]): Pt => [x - cx, cz - z]) };
}

/** Св. Петка's bell tower: half its width (m). */
const PETKA_TOWER = 2.5;

/** Walking collision: the churches' outlines and Св. Петка's bell tower, as [outline, height]. */
export function churchFootprints(data: CityData): [Flat, number][] {
  const L = data.landmarks || {}, out: [Flat, number][] = [];
  if (L.petka) out.push([L.petka, 9]);
  if (L.dimitrij) out.push([L.dimitrij, 9]);
  if (L.petkaTower) {
    const [x, z] = L.petkaTower, h = PETKA_TOWER;
    out.push([[x - h, z - h, x + h, z - h, x + h, z + h, x - h, z + h], 17]);
  }
  return out;
}

type Key = 'stone' | 'brick' | 'white' | 'cream' | 'tile' | 'glass' | 'dark' | 'door' | 'plaster' | 'gold';

/** Parts of one building, by material, in its frame (x = e, z = −n). */
function kit() {
  const parts = new Map<Key, THREE.BufferGeometry[]>();
  const add = (k: Key, g: THREE.BufferGeometry) => {
    let a = parts.get(k);
    if (!a) parts.set(k, (a = []));
    a.push(g);
    return g;
  };
  const box = (k: Key, e0: number, e1: number, n0: number, n1: number, y0: number, y1: number) =>
    add(k, new THREE.BoxGeometry(e1 - e0, y1 - y0, n1 - n0).translate((e0 + e1) / 2, (y0 + y1) / 2, -(n0 + n1) / 2));
  /** a thin band round a box (courses, cornices): `o` wider than the box on every side */
  const band = (k: Key, e0: number, e1: number, n0: number, n1: number, y: number, t: number, o = 0.05) => box(k, e0 - o, e1 + o, n0 - o, n1 + o, y, y + t);
  /** a feature built facing +z (the wall at z = 0) put on a wall at (e, n, y), facing outward (sin a, cos a) in x, z */
  const put = (k: Key, g: THREE.BufferGeometry, e: number, n: number, y: number, a: number) => add(k, g.rotateY(a).translate(e, y, -n));
  /** facing angles: north, south, east, west */
  const N = Math.PI, S = 0, E = Math.PI / 2, W = -Math.PI / 2;
  /** an arched opening w × h (to the top of the arch), standing out d from the wall */
  const arch = (w: number, h: number, d = 0.08) => {
    const r = w / 2, body = Math.max(0.01, h - r);
    const top = new THREE.CylinderGeometry(r, r, d, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, body, d / 2);
    return mergeGeometries([new THREE.BoxGeometry(w, body, d).translate(0, body / 2, d / 2).toNonIndexed(), top.toNonIndexed()].map(strip))!;
  };
  /** an extruded 2D shape [u across, y] along e (`alongE`) or n, from a0 to a1 */
  const prism = (k: Key, pts: [number, number][], a0: number, a1: number, alongE: boolean) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y))), { depth: a1 - a0, bevelEnabled: false });
    return add(k, alongE ? g.rotateY(Math.PI / 2).translate(a0, 0, 0) : g.translate(0, 0, -a1));
  };
  /** a gable roof over a rectangle (ridge along e or n), with the gable walls under it */
  const gable = (wall: Key, e0: number, e1: number, n0: number, n1: number, y: number, rise: number, alongE: boolean, o = 0.45, oa = 0.35) => {
    const [c0, c1, a0, a1] = alongE ? [n0, n1, e0, e1] : [e0, e1, n0, n1];
    const mid = (c0 + c1) / 2, s = rise / ((c1 - c0) / 2), ye = y - o * s, t = 0.28;
    prism('tile', [[c0 - o, ye], [c0 - o, ye + t], [mid, y + rise + t], [c1 + o, ye + t], [c1 + o, ye], [mid, y + rise]], a0 - oa, a1 + oa, alongE);
    prism(wall, [[c0, y - 0.01], [c1, y - 0.01], [mid, y + rise]], a0, a1, alongE);
  };
  /** a hipped roof over a rectangle (a pyramid when square): a solid from the eaves up */
  const hip = (e0: number, e1: number, n0: number, n1: number, y: number, rise: number, o = 0.45) => {
    const lx = e1 - e0 + 2 * o, lz = n1 - n0 + 2 * o, half = Math.min(lx, lz) / 2, s = rise / ((Math.min(e1 - e0, n1 - n0)) / 2 || 1);
    const ye = y - o * s, top = y + rise, ce = (e0 + e1) / 2, cn = (n0 + n1) / 2;
    const xs = [e0 - o, e1 + o], zs = [-(n1 + o), -(n0 - o)];
    const A: V = [xs[0], ye, zs[0]], B: V = [xs[1], ye, zs[0]], C: V = [xs[1], ye, zs[1]], D: V = [xs[0], ye, zs[1]];
    const r = lx >= lz ? (lx / 2 - half) : (lz / 2 - half);
    const R1: V = lx >= lz ? [ce - r, top, -cn] : [ce, top, -cn - r], R2: V = lx >= lz ? [ce + r, top, -cn] : [ce, top, -cn + r];
    const tris: V[][] = lx >= lz
      ? [[A, B, R2], [A, R2, R1], [D, C, R2], [D, R2, R1], [A, D, R1], [B, C, R2], [A, B, C], [A, C, D]]
      : [[A, D, R2], [A, R2, R1], [B, C, R2], [B, R2, R1], [A, B, R1], [D, C, R2], [A, B, C], [A, C, D]];
    return add('tile', solid(tris));
  };
  /** an octagonal prism (drums, apses, belfries) with faces toward north, south, east, west and between */
  const octo = (k: Key, e: number, n: number, y0: number, y1: number, r: number) =>
    add(k, new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1, false, -Math.PI / 8).translate(e, (y0 + y1) / 2, -n));
  /** an octagonal tiled roof; `sq` squashes it along n (the rounded ends of Св. Петка's side bays) */
  const cone = (e: number, n: number, y: number, r: number, rise: number, sq = 1) =>
    add('tile', new THREE.ConeGeometry(r, rise, 8, 1, false, -Math.PI / 8).scale(1, 1, sq).translate(e, y + rise / 2, -n));
  /** features on the faces of an octagon of radius r: f(angle, e, n) at each face's middle */
  const octFaces = (e: number, n: number, r: number, f: (a: number, fe: number, fn: number) => void, only?: number[]) => {
    const ap = r * Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      if (only && !only.includes(k)) continue;
      const a = (k * Math.PI) / 4; // outward (sin a, cos a) in x, z: k = 0 south, 2 east, 4 north, 6 west
      f(a, e + Math.sin(a) * ap, n - Math.cos(a) * ap);
    }
  };
  /** an Orthodox cross on a small ball (three bars, the lowest slanted) */
  const cross = (e: number, n: number, y: number, s: number) => {
    const g = (w: number, h: number, yy: number, rot = 0) => new THREE.BoxGeometry(w * s, h * s, 0.1 * s).rotateZ(rot).translate(0, yy * s, 0);
    const parts2 = [new THREE.SphereGeometry(0.16 * s, 8, 6).translate(0, 0.05 * s, 0), g(0.11, 1.8, 0.9), g(1.0, 0.11, 1.25), g(0.55, 0.1, 1.55), g(0.65, 0.1, 0.6, 0.35)];
    add('gold', mergeGeometries(parts2.map((p) => strip(p.index ? p.toNonIndexed() : p)))!.translate(e, y, -n));
  };
  /** the outline's edges: f(p, q, length, outward facing angle) */
  const edges = (ring: Pt[], f: (p: Pt, q: Pt, len: number, a: number) => void) => {
    let a2 = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], de = q[0] - p[0], dn = q[1] - p[1], len = Math.hypot(de, dn);
      if (len < 0.3) continue;
      const oe = (a2 > 0 ? dn : -dn) / len, on = (a2 > 0 ? -de : de) / len; // outward, in e and n
      f(p, q, len, Math.atan2(oe, -on));
    }
  };
  /** walls on the outline from y0 to y1, with courses (`k`, thickness t) at `ys` */
  const ringWalls = (k: Key, ring: Pt[], y0: number, y1: number) =>
    add(k, new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([e, n]) => new THREE.Vector2(e, n))), { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0));
  const ringBands = (k: Key, ring: Pt[], ys: number[], t: number, o = 0.05) =>
    edges(ring, (p, q, len, a) => {
      for (const y of ys) put(k, new THREE.BoxGeometry(len + 2 * o, t, o * 2).translate(0, t / 2, 0), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, y, a);
    });
  return { parts, add, box, band, put, arch, gable, hip, octo, cone, octFaces, cross, edges, ringWalls, ringBands, N, S, E, W };
}
type V = [number, number, number];

/** only position and normal (so parts from different generators merge) */
function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}

/** a convex solid from triangles, each turned to face away from the middle */
function solid(tris: V[][]): THREE.BufferGeometry {
  const all = tris.flat(), m = [0, 1, 2].map((i) => all.reduce((s, v) => s + v[i], 0) / all.length);
  const pos: number[] = [];
  for (let [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3 - m[i]);
    if (nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function createChurches(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const L = data.landmarks || {};
  const group = new THREE.Group();
  const M = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, clippingPlanes, ...extra });
  const glass = M('#3d3a3c', { emissive: '#ffd08a', emissiveIntensity: 0 });
  const shared: Partial<Record<Key, THREE.Material>> = {
    tile: M('#cf6440'), glass, dark: M('#2f2b2b'), door: M('#a8682f'), gold: M('#e3b84c', { emissive: '#6a4a10', emissiveIntensity: 0.25 }),
    white: M('#f3eee5'), cream: M('#e8dccb'), plaster: M('#f4efe6'),
  };
  const place = (k: ReturnType<typeof kit>, f: ChurchFrame, mats: Partial<Record<Key, THREE.Material>>) => {
    for (const [key, list] of k.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => strip(g.index ? g.toNonIndexed() : g)))!, mats[key] ?? shared[key]!);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(f.cx, f.y, f.cz);
      group.add(mesh);
    }
  };

  // ---------------- Св. Димитриј. Outline (frame metres): the west front at e ≈ −17, the tower's bump in its
  // middle (n −1.3…3.5), the south aisle out to n ≈ −10.7 west of e ≈ 2, the north transept's bump at
  // e −0.8…8, the polygonal apse at the east end (e ≈ 18.8). The nave runs along the tower's axis (n 1.1).
  if (L.dimitrij) {
    const f = churchFrame(L.dimitrij, terrain), k = kit(), u = f.under, H1 = 6.6, ax = 1.1;
    const { box, band, put, arch, gable, hip, octo, cone, octFaces, cross, N, S, E, W } = k;
    // the stone body on the outline, its brick courses and the cream cornice
    k.ringWalls('stone', f.ring, u, H1);
    k.ringBands('brick', f.ring, [2.0, 4.2], 0.14);
    k.ringBands('cream', f.ring, [H1 - 0.3], 0.35, 0.14);
    // windows: tall arched ones in brick arches along the walls (not on the west front, by the tower)
    k.edges(f.ring, (p, q, len, a) => {
      const me = (p[0] + q[0]) / 2, mn = (p[1] + q[1]) / 2;
      if (len < 4 || me < -16) return;
      const north = me < -11 && mn > 7; // the north door is on this stretch
      const n = north ? 0 : Math.floor(len / 4.6);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, e = p[0] + (q[0] - p[0]) * t, nn = p[1] + (q[1] - p[1]) * t;
        put('brick', arch(1.6, 3.4, 0.04), e, nn, 1.55, a);
        put('stone', arch(1.25, 3.2, 0.06), e, nn, 1.65, a);
        put('glass', arch(0.85, 2.6, 0.09), e, nn, 1.85, a);
      }
      if (north) { // the side door with a gold mosaic above it
        put('brick', arch(2.0, 3.6, 0.05), me, mn, 0, a);
        put('door', arch(1.5, 2.6, 0.08), me, mn, 0, a);
        put('gold', arch(1.3, 0.75, 0.08).translate(0, 2.75, 0), me, mn, 0, a);
      }
    });
    // tiled lean-to roofs over the stone body (their inner parts are under the white upper walls)
    hip(-17.0, 17.4, -5.5, 7.8, H1, 1.7);
    hip(-11.2, 17.2, 7.8, 9.4, H1, 0.8);
    hip(-17.0, 1.7, -10.7, -5.5, H1, 1.0);
    hip(1.6, 6.0, -8.6, -5.5, H1, 0.8);
    hip(-0.8, 8.0, 9.4, 10.7, H1, 0.6);
    // the white upper nave and transept with gable roofs
    box('white', -14.0, 13.0, ax - 4.7, ax + 4.7, 0, 9.6);
    gable('white', -14.0, 13.0, ax - 4.7, ax + 4.7, 9.6, 1.9, true);
    box('white', -0.6, 7.8, -7.0, 9.2, 0, 9.6);
    gable('white', -0.6, 7.8, -7.0, 9.2, 9.6, 1.9, false);
    band('cream', -14.0, 13.0, ax - 4.7, ax + 4.7, 9.3, 0.3, 0.1);
    band('cream', -0.6, 7.8, -7.0, 9.2, 9.3, 0.3, 0.1);
    for (const e of [-11, -7.5, 9.5]) for (const [nn, a] of [[ax + 4.7, N], [ax - 4.7, S]] as const) put('glass', arch(0.55, 1.3, 0.06), e, nn, 7.6, a);
    for (const [nn, a] of [[9.2, N], [-7.0, S]] as const) { put('cream', arch(1.5, 2.4, 0.04), 3.6, nn, 7.0, a); put('glass', arch(1.0, 2.0, 0.07), 3.6, nn, 7.2, a); }
    put('glass', arch(0.9, 1.8, 0.06), 13.0, ax, 7.6, E);
    // the drum over the crossing: a square white base with a tiled skirt, the octagon with arched
    // windows (cross-shaped openings in the photos), a cornice and an octagonal tiled roof
    const de = 3.6, dn = ax;
    box('white', de - 3.2, de + 3.2, dn - 3.2, dn + 3.2, 0, 11.6);
    hip(de - 3.2, de + 3.2, dn - 3.2, dn + 3.2, 11.6, 0.8, 0.3);
    octo('white', de, dn, 11.6, 15.3, 3.0);
    octo('cream', de, dn, 15.25, 15.6, 3.25);
    octFaces(de, dn, 3.0, (a, e, n) => { put('cream', arch(1.15, 2.25, 0.05), e, n, 12.45, a); put('glass', arch(0.7, 1.8, 0.09), e, n, 12.6, a); });
    cone(de, dn, 15.6, 3.45, 1.6);
    cross(de, dn, 17.15, 1);
    // the apse
    octo('stone', 15.4, 2.9, u, 5.8, 3.4);
    for (const y of [2.0, 4.2]) octo('brick', 15.4, 2.9, y, y + 0.14, 3.44);
    octo('cream', 15.4, 2.9, 5.5, 5.85, 3.6);
    cone(15.4, 2.9, 5.85, 3.8, 1.3);
    octFaces(15.4, 2.9, 3.4, (a, e, n) => { put('brick', arch(0.95, 2.0, 0.04), e, n, 1.9, a); put('glass', arch(0.6, 1.7, 0.08), e, n, 2.05, a); }, [1, 2, 3]);
    // the bell tower in the middle of the west front: stone with paired windows, then two white stages
    const t0 = -18.8, t1 = -14.0, tn0 = -1.3, tn1 = 3.5, tc = (t0 + t1) / 2, tn = (tn0 + tn1) / 2;
    box('stone', t0, t1, tn0, tn1, u, 10.2);
    for (const y of [2.0, 4.2, 8.4]) band('brick', t0, t1, tn0, tn1, y, 0.14);
    band('cream', t0, t1, tn0, tn1, 10.0, 0.4, 0.18);
    const faces: [number, number, number, number][] = [[t0, tn, W, 0], [tc, tn1, N, 1], [tc, tn0, S, 1], [t1, tn, E, 0]]; // e, n, facing, along e?
    for (const [e, n, a, alongE] of faces) {
      if (a === E) continue; // against the nave
      const off = (d: number): [number, number] => (alongE ? [e + d, n] : [e, n + d]);
      put('brick', arch(1.75, 2.3, 0.04), ...off(0), 6.0, a);
      for (const d of [-0.4, 0.4]) put('glass', arch(0.5, 1.6, 0.08), ...off(alongE ? d : -d), 6.3, a);
    }
    put('brick', arch(2.1, 3.4, 0.05), t0, tn, 0, W);
    put('door', arch(1.6, 2.9, 0.09), t0, tn, 0, W); // the west door
    box('white', t0 + 0.1, t1 - 0.1, tn0 + 0.1, tn1 - 0.1, 10.4, 15.6);
    band('cream', t0 + 0.1, t1 - 0.1, tn0 + 0.1, tn1 - 0.1, 15.5, 0.35, 0.2);
    box('white', t0 + 0.2, t1 - 0.2, tn0 + 0.2, tn1 - 0.2, 15.85, 19.3);
    band('cream', t0 + 0.2, t1 - 0.2, tn0 + 0.2, tn1 - 0.2, 19.2, 0.3, 0.25);
    for (const [e0, n0, a, alongE] of faces) {
      const off = (inset: number, d: number): [number, number] => {
        const sgn = a === W ? 1 : a === E ? -1 : a === N ? -1 : 1; // inward
        return alongE ? [e0 + d, n0 + sgn * inset] : [e0 + sgn * inset, n0 + d];
      };
      for (const d of [-1.3, 0, 1.3]) put('dark', arch(0.75, 3.0, 0.08), ...off(0.1, d), 11.4, a);
      for (const d of [-0.75, 0.75]) put('dark', arch(0.7, 1.9, 0.08), ...off(0.2, d), 16.4, a);
      put('dark', new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12).rotateX(Math.PI / 2).translate(0, 0, 0.04), ...off(0.2, 0), 18.6, a);
    }
    hip(t0 + 0.2, t1 - 0.2, tn0 + 0.2, tn1 - 0.2, 19.5, 1.1, 0.35);
    cross(tc, tn, 20.5, 0.9);
    place(k, f, { stone: M('#b9a891'), brick: M('#9c5b44') });
  }

  // ---------------- Св. Петка. Outline (frame metres): the west front at e ≈ −13.8, 33 m wide with the
  // side bays' rounded ends at n ±15…16.7, the naos e −5…12.6 (n −10…10.8, the transept's ends to ±12),
  // the apse at e ≈ 13.8; the axis at n ≈ 0.3.
  if (L.petka) {
    const f = churchFrame(L.petka, terrain), k = kit(), u = f.under, H1 = 7.2;
    const { box, band, put, arch, gable, hip, octo, cone, octFaces, cross, N, S, E, W } = k;
    const courses = (y0: number, y1: number) => { const ys: number[] = []; for (let y = y0 + 1.2; y < y1 - 0.4; y += 1.2) ys.push(y); return ys; };
    k.ringWalls('stone', f.ring, u, H1);
    k.ringBands('brick', f.ring, courses(0, H1), 0.12);
    k.ringBands('brick', f.ring, [H1 - 0.25], 0.25, 0.12);
    // windows on the outline (the west front has its own)
    k.edges(f.ring, (p, q, len, a) => {
      const me = (p[0] + q[0]) / 2;
      if (len < 3 || me < -13.3) return;
      const n = Math.max(1, Math.floor(len / 4));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, e = p[0] + (q[0] - p[0]) * t, nn = p[1] + (q[1] - p[1]) * t;
        put('brick', arch(1.05, 2.25, 0.04), e, nn, 2.9, a);
        put('glass', arch(0.6, 1.8, 0.08), e, nn, 3.1, a);
      }
    });
    /** a box of banded stone */
    const stoneBox = (e0: number, e1: number, n0: number, n1: number, y1: number) => {
      box('stone', e0, e1, n0, n1, u, y1);
      for (const y of courses(0, y1)) band('brick', e0, e1, n0, n1, y, 0.12);
      band('brick', e0, e1, n0, n1, y1 - 0.25, 0.25, 0.1);
    };
    /** a drum with arched windows, a brick cornice, a tiled octagonal roof and a cross */
    const drum = (e: number, n: number, y0: number, y1: number, r: number, win: [number, number], cs: number, only?: number[]) => {
      octo('stone', e, n, y0, y1, r);
      octo('brick', e, n, y0 + 0.35, y0 + 0.47, r + 0.05);
      octo('brick', e, n, y1 - 0.25, y1, r + 0.18);
      octFaces(e, n, r, (a, fe, fn) => { put('brick', arch(win[0] + 0.35, win[1] + 0.3, 0.04), fe, fn, y0 + 0.65, a); put('glass', arch(win[0], win[1], 0.08), fe, fn, y0 + 0.8, a); }, only);
      const rise = r * 0.55;
      cone(e, n, y1, r + 0.35, rise);
      cross(e, n, y1 + rise - 0.1, cs);
    };
    // the west front: the tall middle bay (a big arch over the porch, a triple window under its gable)
    stoneBox(-13.8, -5.2, -4.6, 4.6, 10.4);
    gable('stone', -13.8, -5.2, -4.6, 4.6, 10.4, 2.4, true);
    put('brick', arch(6.2, 7.4, 0.04), -13.8, 0, 0.2, W);
    put('plaster', arch(5.4, 6.9, 0.07), -13.8, 0, 0.3, W);
    put('door', arch(1.9, 3.3, 0.1), -13.8, 0, 0.3, W);
    for (const d of [-3.65, 3.65]) { put('brick', arch(1.35, 3.6, 0.04), -13.8, d, 0.3, W); put('plaster', arch(1.0, 3.4, 0.07), -13.8, d, 0.35, W); }
    for (const d of [-0.75, 0, 0.75]) put('glass', arch(0.5, 1.5, 0.08), -13.8, d, 8.3, W);
    // the side bays: a gable to the west with a door and a window, the rounded end, a dome on its drum
    for (const sd of [-1, 1]) {
      const n0 = sd > 0 ? 4.6 : -15.1, n1 = sd > 0 ? 15.1 : -4.6, nc = sd * 9.9;
      gable('stone', -13.8, -5.2, n0, n1, H1, 2.0, true);
      put('brick', arch(1.9, 3.3, 0.04), -13.8, nc, 0.2, W);
      put('door', arch(1.3, 2.8, 0.09), -13.8, nc, 0.3, W);
      put('brick', arch(0.95, 1.9, 0.04), -13.8, nc, 4.1, W);
      put('glass', arch(0.55, 1.6, 0.08), -13.8, nc, 4.25, W);
      put('glass', arch(0.4, 1.0, 0.08), -13.8, nc, 7.6, W);
      cone(-9.4, sd * 15.1, H1, 4.7, 1.6, 0.42);
      stoneBox(-11.6, -7.2, nc - 2.2, nc + 2.2, 9.6);
      hip(-11.6, -7.2, nc - 2.2, nc + 2.2, 9.6, 0.5, 0.3);
      drum(-9.4, nc, 9.6, 12.5, 2.4, [0.45, 1.3], 0.75);
    }
    // the naos: tiled roofs over its corners, the two crossing arms with gables, the main drum
    hip(-5.2, 12.4, -10.0, 10.8, H1, 1.5);
    stoneBox(-5.2, 12.4, -4.3, 5.1, 11.0);
    gable('stone', -5.2, 12.4, -4.3, 5.1, 11.0, 2.4, true);
    stoneBox(0.9, 8.3, -12.1, 11.9, 11.0);
    gable('stone', 0.9, 8.3, -12.1, 11.9, 11.0, 2.4, false);
    for (const [nn, a] of [[11.9, N], [-12.1, S]] as const) {
      put('brick', arch(6.0, 10.6, 0.04), 4.6, nn, 0.4, a);
      put('stone', arch(5.6, 10.3, 0.06), 4.6, nn, 0.5, a);
      for (const d of [-0.8, 0, 0.8]) put('glass', arch(0.55, 1.9, 0.09), 4.6 + (a === N ? -d : d), nn, 7.4, a);
      put('door', arch(1.4, 2.7, 0.09), 4.6, nn, 0.3, a);
    }
    stoneBox(0.9, 8.3, -3.3, 4.1, 13.6);
    hip(0.9, 8.3, -3.3, 4.1, 13.6, 0.6, 0.3);
    drum(4.6, 0.4, 13.6, 18.9, 3.6, [0.7, 2.4], 1.25);
    // small drums at the east corners
    for (const nc of [7.9, -7.2]) drum(10.4, nc, 7.6, 10.6, 1.6, [0.35, 1.0], 0.6, [0, 2, 4, 6]);
    // the apse
    octo('stone', 10.6, 0.3, u, 7.6, 3.4);
    for (const y of courses(0, 7.6)) octo('brick', 10.6, 0.3, y, y + 0.12, 3.45);
    octo('brick', 10.6, 0.3, 7.35, 7.6, 3.55);
    octFaces(10.6, 0.3, 3.4, (a, e, n) => { put('brick', arch(0.9, 2.2, 0.04), e, n, 2.9, a); put('glass', arch(0.55, 1.9, 0.08), e, n, 3.05, a); }, [1, 2, 3]);
    cone(10.6, 0.3, 7.6, 3.7, 1.4);

    // the bell tower, on its own ground (frame metres from the church's frame)
    if (L.petkaTower) {
      const te = L.petkaTower[0] - f.cx, tn = f.cz - L.petkaTower[1], h = PETKA_TOWER;
      const dy = terrain.at(...L.petkaTower) + 0.2 - f.y, tu = dy - 0.5, Y = (y: number) => dy + y;
      box('stone', te - h, te + h, tn - h, tn + h, tu, Y(17.2));
      for (let y = 1.5; y < 17; y += 1.5) band('brick', te - h, te + h, tn - h, tn + h, Y(y), 0.12);
      for (const [a, de, dn] of [[N, 0, h], [S, 0, -h], [E, h, 0], [W, -h, 0]] as const) {
        put('brick', arch(1.9, 14.6, 0.03), te + de, tn + dn, Y(1.4), a); // the tall blind arch
        put('stone', arch(1.6, 14.4, 0.05), te + de, tn + dn, Y(1.5), a);
        for (const y of [5.0, 9.0, 13.0]) { put('brick', arch(0.9, 1.9, 0.07), te + de, tn + dn, Y(y - 0.15), a); put('glass', arch(0.55, 1.6, 0.1), te + de, tn + dn, Y(y), a); }
      }
      hip(te - h, te + h, tn - h, tn + h, Y(17.2), 0.8, 0.9);
      octo('stone', te, tn, Y(17.5), Y(21.8), 2.2);
      octo('brick', te, tn, Y(17.9), Y(18.02), 2.25);
      octo('brick', te, tn, Y(21.55), Y(21.8), 2.4);
      octFaces(te, tn, 2.2, (a, e, n) => { put('brick', arch(1.15, 2.6, 0.04), e, n, Y(18.15), a); put('dark', arch(0.8, 2.3, 0.08), e, n, Y(18.3), a); });
      cone(te, tn, Y(21.8), 2.6, 1.5);
      cross(te, tn, Y(23.2), 0.9);
    }
    place(k, f, { stone: M('#e6dac6'), brick: M('#c27a5c'), plaster: M('#f5f0e6') });
  }

  return { group, nightLit: [glass] };
}
