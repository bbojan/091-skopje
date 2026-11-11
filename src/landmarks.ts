import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toPts, obb } from './geo.ts';
import { SHARED, MODELLED_BUILDINGS } from './city.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Pt, Vec3 } from './types.ts';

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

  return {
    group,
    gondola,
    update(dt: number): void {
      for (const f of animated) f(dt);
      if (crossMat) crossMat.emissiveIntensity = SHARED.uNight.value * 0.9;
      if (stationGlass) stationGlass.emissiveIntensity = SHARED.uNight.value * 0.55;
    },
  };
}
