import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toPts, obb, pip } from './geo.ts';
import { SHARED, MODELLED_BUILDINGS, areaLift } from './city.ts';
import type { Terrain } from './terrain.ts';
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

/** Outlines of modelled buildings that are not (or no longer) OSM buildings, so walking collides with them. */
export function landmarkFootprints(data: CityData): BuildingData[] {
  const L = data.landmarks || {}, out: BuildingData[] = [];
  const add = (r: Flat, h: number) => out.push({ id: -1 - out.length, r: [r], h, mh: 0, lv: 2, old: 0, t: 'yes', rs: null, w: null, c: null });
  const hall = L.townhall ? obb(toPts(L.townhall)) : null;
  if (hall) { // the model fills the outline's oriented box, so collide with that box
    const { c, a, b, L: hl, W: hw } = hall;
    add([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([u, v]) => [c[0] + a[0] * hl * u + b[0] * hw * v, c[1] + a[1] * hl * u + b[1] * hw * v]), 12.6);
  }
  if (L.culture) {
    const [x, z, rot] = L.culture, c = Math.cos(rot), s = Math.sin(rot);
    const rect = (x0: number, x1: number, z0: number, z1: number): Flat =>
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].flatMap(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    for (const [x0, x1, z0, z1] of [[-7.55, 7.55, -20.7, 20.7], [7.55, 16.1, -20.7, -7.73], [7.55, 13.5, -6.13, 0.34], [7.55, 16.1, 8.2, 17.0], [-11.25, -7.55, -2.5, 0.7]])
      add(rect(x0, x1, z0, z1), 7);
  }
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

  // ---------------- People's Heroes Kiro Krstev (Atanasovski) and Dimče Mirčev, where they fell
  // (north-west corner of the town park): a tall concrete pillar (~8 m) beside a raised wall
  // (~6 m) with a bronze relief of figures (Tome Andreevski, 1959), a marble pylon behind,
  // wide steps up between stone cheek walls
  if (L.heroes) {
    const [x, z] = L.heroes;
    const y = T(x, z), rot = facing(x, z);
    const C: THREE.BufferGeometry[] = [], S: THREE.BufferGeometry[] = [], D: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [], W: THREE.BufferGeometry[] = [];
    S.push(box(9, 3.1, 6, 0, -1.5, -0.5)); // platform on its base
    for (let k = 0; k < 8; k++) S.push(box(5, 0.2 * (k + 1) + 1.5, 0.36, 0, -1.5, 2.5 + (7 - k + 0.5) * 0.36));
    for (const sd of [-1, 1]) S.push(box(0.6, 3.3, 3.2, sd * 2.8, -1.5, 3.95)); // cheek walls
    D.push(box(6, 2.3, 0.6, -0.9, 1.6, -0.9)); // the relief wall
    for (let i = 0; i < 9; i++) { // relief: a row of figures standing out of the wall
      const fx = -3.4 + i * 0.62, tall = 0.85 + ((i * 5) % 3) * 0.12;
      B.push(new THREE.CapsuleGeometry(0.17, tall, 3, 8).translate(fx, 2.45 + tall / 2, -0.52));
      B.push(new THREE.SphereGeometry(0.15, 8, 6).translate(fx + 0.03, 2.75 + tall, -0.5));
    }
    C.push(box(1.5, 8, 1.1, 3.1, 1.6, -1.3)); // the pillar
    W.push(box(0.7, 3.2, 0.7, 0.2, 1.6, -3.0)); // marble pylon behind
    place(S, M('#bdb3a3'), x, y, z, rot);
    place(C, concrete, x, y, z, rot);
    place(D, darkConcrete, x, y, z, rot);
    place(B, bronze, x, y, z, rot);
    place(W, M('#f1eee8'), x, y, z, rot);
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

  // ---------------- Општина Кавадарци (town hall): three storeys faced with salmon and cream stone
  // panels, a projecting entrance bay with the lettering, tall white-framed windows, a flat roof;
  // in front: steps, trimmed conifers, flagpoles and a round fountain on each side
  if (L.townhall) {
    const ob = obb(toPts(L.townhall));
    if (ob) {
      // the front is the long side that faces the square
      const sq = data.places?.square ?? data.meta.square;
      const toSq = [sq[0] - ob.c[0], sq[1] - ob.c[1]];
      const nrm: Pt = toSq[0] * ob.b[0] + toSq[1] * ob.b[1] >= 0 ? ob.b : [-ob.b[0], -ob.b[1]];
      const rot = Math.atan2(nrm[0], nrm[1]); // local +z = the front
      const len = ob.L * 2, dep = ob.W * 2, H = 12.6, fz = dep / 2;
      const [cx, cz] = ob.c, y = T(cx, cz) + sqLift - 0.3;
      const salmon: THREE.BufferGeometry[] = [], cream: THREE.BufferGeometry[] = [], win: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = [];
      salmon.push(box(len, H, dep, 0, -0.6, 0));
      cream.push(box(len + 0.5, 0.55, dep + 0.5, 0, H - 0.6, 0)); // cornice
      for (const fy of [3.7, 7.7]) cream.push(box(len + 0.1, 0.3, dep + 0.1, 0, fy, 0)); // floor bands
      for (let u = -len / 2; u <= len / 2 + 0.01; u += len / 12) cream.push(box(0.5, H - 0.6, 0.12, u, -0.6, fz + 0.04)); // pilaster strips
      // windows: three rows on the front and the back, two-light, white frames
      const bay = 11;
      for (const sd of [1, -1]) for (const wy of [1.0, 4.6, 8.6]) for (let u = -len / 2 + 2.4; u < len / 2 - 1.5; u += len / 12) {
        if (sd === 1 && Math.abs(u + len / 24) < bay / 2 + 0.5) continue; // the bay has its own glazing
        const wx = u + len / 24;
        frame.push(box(2.1, 2.5, 0.12, wx, wy - 0.1, sd * (fz + 0.06)));
        win.push(box(1.8, 2.2, 0.14, wx, wy + 0.05, sd * (fz + 0.08)));
      }
      // the entrance bay: projecting, cream frame, glazed ground floor, big windows above
      cream.push(box(bay, H + 0.4, 1.4, 0, -0.6, fz + 0.7));
      salmon.push(box(bay - 1.2, H - 1.2, 0.2, 0, 0.0, fz + 1.45));
      frame.push(box(7.2, 3.4, 0.12, 0, 0.0, fz + 1.58), box(7.2, 2.8, 0.12, 0, 6.0, fz + 1.58), box(7.2, 2.4, 0.12, 0, 9.2, fz + 1.58));
      win.push(box(6.8, 3.0, 0.14, 0, 0.1, fz + 1.6), box(6.8, 2.4, 0.14, 0, 6.2, fz + 1.6), box(6.8, 2.0, 0.14, 0, 9.4, fz + 1.6));
      // steps up to the entrance
      const steps: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 4; k++) steps.push(box(15 - k * 0.8, 0.18 * (k + 1) + 0.3, 0.42, 0, -0.3, fz + 1.4 + (4 - k) * 0.42));
      place(salmon, M('#dcb4a0'), cx, y, cz, rot);
      place(cream, M('#efe3d3'), cx, y, cz, rot);
      place(frame, M('#f7f5f0'), cx, y, cz, rot);
      const glassMat = M('#4a5866', { emissive: '#ffd590', emissiveIntensity: 0 });
      nightGlass.push(glassMat);
      place(win, glassMat, cx, y, cz, rot);
      place(steps, M('#c9c4bb'), cx, y, cz, rot);
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
      // a round fountain on each side: dark granite basin, a ring of jets round a tall one
      const basin: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [], jets: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) {
        const fx = sd * len * 0.3, fzz = fz + 7.5;
        basin.push(new THREE.CylinderGeometry(2.9, 3.0, 0.65, 32).translate(fx, 0.02, fzz));
        water.push(new THREE.CylinderGeometry(2.55, 2.55, 0.1, 32).translate(fx, 0.62, fzz));
        jets.push(new THREE.ConeGeometry(0.16, 2.6, 8).translate(fx, 1.95, fzz));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          jets.push(new THREE.ConeGeometry(0.1, 1.3, 6).translate(fx + Math.cos(a) * 1.5, 1.3, fzz + Math.sin(a) * 1.5));
        }
      }
      place(basin, M('#4e4e50'), cx, y + 0.3, cz, rot);
      place(water, M('#8cc7e2'), cx, y + 0.3, cz, rot);
      place(jets, M('#e6f5fb'), cx, y + 0.3, cz, rot);
    }
  }

  // ---------------- the square's furniture: round raised planters of dark granite (flowers, two
  // with curved wooden seats), black granite ball bollards along the street, curved paving bands
  const sqPt = data.places?.square;
  const plaza = sqPt ? data.areas.find((a) => a.k === 'plaza' && pip(sqPt[0], sqPt[1], toPts(a.r[0]))) : undefined;
  if (plaza && L.revolution) {
    const ring = toPts(plaza.r[0]);
    const [mx, mz] = L.revolution, sq = data.places!.square;
    // paving: two bands round the middle of the square
    const band = M('#8f8c87');
    drapedRing(sq[0], sq[1], 7, 0.8, sqLift + 0.03, band);
    drapedRing(sq[0], sq[1], 15, 0.9, sqLift + 0.03, band);
    // bollards along the edges that face a street to the west or east (outside the town hall's front)
    const balls: THREE.BufferGeometry[] = [];
    let ccx = 0, ccz = 0;
    for (const [px, pz] of ring) { ccx += px; ccz += pz; }
    ccx /= ring.length; ccz /= ring.length;
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % ring.length];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz);
      if (l < 4) continue;
      let nx = dz / l, nz = -dx / l;
      if ((p0[0] + dx / 2 - ccx) * nx + (p0[1] + dz / 2 - ccz) * nz < 0) { nx = -nx; nz = -nz; }
      if (Math.abs(nx) < 0.75) continue;
      for (let t = 1.5; t < l - 1; t += 3.2) {
        const bx = p0[0] + (dx * t) / l - nx * 1.1, bz = p0[1] + (dz * t) / l - nz * 1.1;
        balls.push(new THREE.SphereGeometry(0.32, 12, 9).translate(bx, T(bx, bz) + sqLift + 0.3, bz));
      }
    }
    place(balls, M('#3a3a3c'), 0, 0, 0, 0);
    // planters: a row along the east side, from the monument northward
    const rim: THREE.BufferGeometry[] = [], soil: THREE.BufferGeometry[] = [], green: THREE.BufferGeometry[] = [], flowers: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
    const ex = (sq[0] - mx), ez = (sq[1] - mz), el = Math.hypot(ex, ez) || 1; // toward the square's middle
    const ax = ez / el, az = -ex / el; // across the square
    for (let k = 0; k < 4; k++) {
      const off = 10 + k * 9, side = 11;
      const px = mx + (ex / el) * off + ax * side, pz = mz + (ez / el) * off + az * side;
      const py = T(px, pz) + sqLift;
      rim.push(new THREE.CylinderGeometry(2.1, 2.2, 0.6, 28).translate(px, py + 0.3, pz));
      soil.push(new THREE.CylinderGeometry(1.85, 1.85, 0.06, 28).translate(px, py + 0.58, pz));
      green.push(new THREE.SphereGeometry(0.9, 10, 8).scale(1, 0.55, 1).translate(px, py + 0.75, pz));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        flowers.push(new THREE.SphereGeometry(0.17, 6, 5).translate(px + Math.cos(a) * 1.45, py + 0.7, pz + Math.sin(a) * 1.45));
      }
      if (k % 2 === 0) { // a curved wooden seat round half of it
        for (let i = 0; i < 10; i++) {
          const a0 = Math.PI * (0.1 + i * 0.08);
          wood.push(new THREE.BoxGeometry(0.55, 0.08, 0.5).rotateY(-a0).translate(px + Math.cos(a0) * 2.45, py + 0.48, pz + Math.sin(a0) * 2.45));
        }
      }
    }
    place(rim, M('#58585a'), 0, 0, 0, 0);
    place(soil, M('#5e4330'), 0, 0, 0, 0);
    place(green, M('#5f8d43'), 0, 0, 0, 0);
    place(flowers, M('#8e1d2e'), 0, 0, 0, 0);
    place(wood, M('#8a5a35'), 0, 0, 0, 0);
  }

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

  return {
    group,
    gondola,
    update(dt: number): void {
      for (const f of animated) f(dt);
      if (crossMat) crossMat.emissiveIntensity = SHARED.uNight.value * 0.9;
      if (stationGlass) stationGlass.emissiveIntensity = SHARED.uNight.value * 0.55;
      for (const m of nightGlass) m.emissiveIntensity = SHARED.uNight.value * 0.6;
      if (cultureGlass) cultureGlass.emissiveIntensity = SHARED.uNight.value * 0.6;
    },
  };
}
