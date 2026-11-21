// Prilep: hand-built models after photos on Wikimedia Commons (references only, nothing from them is in the repo):
// - Саат-кула (19th c.): a square shaft of rubble stone with brick-framed blind roundels and small windows up to a
//   moulded cornice; above it a light stage of slender piers with the clock between them, a balcony, a small open
//   lantern and a tall octagonal lead spire with a gold cross.
// - Могила на непобедените (Bogdan Bogdanović, 1961): a ring of white stone "urns" — a wide base, a waist and a
//   flaring bowl with scrolls at its rim — along a stone-paved path, behind them a white wall of names.
// - Маркови Кули: the walls of the medieval town in ruins among the round granite boulders of the hill; the
//   boulders are scattered over the hill's outline (`modelRects.markovi`), the walls on OSM are drawn as walls.
// - Трескавец: a cloisonné church with a drum and a stone konak, on the granite top of Златоврв.
// Sizes are read off the photos, not measured.
import * as THREE from 'three';
import { frame, parts, modelKit, byzChurch, PU, MU, PV, MV, type Frame, type Key } from './models.ts';
import type { Terrain } from './terrain.ts';
import type { CityData, Flat } from './types.ts';

/** Walking collision: the models' outlines and heights. */
export function prilepFootprints(data: CityData): [Flat, number][] {
  const M = data.landmarks?.models;
  if (!M) return [];
  const out: [Flat, number][] = [];
  for (const [k, h] of [['pclock', 34], ['treskavec', 12]] as const) if (M[k]) out.push([M[k], h]);
  return out;
}

export function createPrilep(data: CityData, terrain: Terrain, clippingPlanes: THREE.Plane[]) {
  const M = data.landmarks?.models ?? {}, A = data.landmarks?.modelAxes ?? {};
  const group = new THREE.Group();
  const { glass, place } = modelKit(group, clippingPlanes);
  const gnd = (f: Frame, u: number, v: number) => { const [x, z] = f.world(u, v); return terrain.at(x, z) - f.y; };

  // ---------------- Саат-кула (≈ 34 m with the cross)
  const cf = M.pclock ? frame(M.pclock, terrain) : null;
  if (cf) {
    const p = parts(), h = Math.max(2.1, Math.min(cf.L, cf.W, 3)), u = cf.under, S = 20.5;
    p.box('stone', -h, h, -h, h, u, S);
    for (const [ang, du, dv] of [[PU, h, 0], [MU, -h, 0], [PV, 0, h], [MV, 0, -h]] as const) {
      for (const y of [4.5, 10, 15.5]) p.put('brick', new THREE.TorusGeometry(0.75, 0.09, 6, 20).translate(0, 0.75, 0.03), du, dv, y, ang); // blind roundels
      p.put('glass', p.arch(0.5, 1.2, 0.06), du, dv, 7.5, ang);
      p.put('glass', p.arch(0.5, 1.2, 0.06), du, dv, 13, ang);
    }
    p.put('door', p.arch(1.2, 2.3, 0.08), 0, h, 0, PV);
    p.box('ashlar', -h - 0.3, h + 0.3, -h - 0.3, h + 0.3, S, S + 0.5); // the cornice
    // the clock stage: four corner piers and a slender one in each face, the clock between them, open above
    const g = h - 0.2;
    for (const su of [-1, 0, 1]) for (const sv of [-1, 0, 1]) if (su || sv) p.box('plaster', su * g - 0.18, su * g + 0.18, sv * g - 0.18, sv * g + 0.18, S + 0.5, S + 5.5);
    p.box('plaster', -g, g, -g, g, S + 0.5, S + 1.2);
    for (const [ang, du, dv] of [[PU, g, 0], [MU, -g, 0], [PV, 0, g], [MV, 0, -g]] as const) {
      const disc = (k: Key, r: number, d: number) => p.put(k, new THREE.CylinderGeometry(r, r, d, 20).rotateX(Math.PI / 2).translate(0, 0, d / 2), du, dv, S + 3, ang);
      disc('plaster', 0.85, 0.08); disc('face', 0.75, 0.1);
      p.put('dark', new THREE.BoxGeometry(0.08, 0.55, 0.05).translate(0, 0.25, 0.14), du, dv, S + 3, ang);
    }
    p.box('dark', -g + 0.2, g - 0.2, -g + 0.2, g - 0.2, S + 1.2, S + 5.5); // the dark inside
    p.box('ashlar', -h - 0.5, h + 0.5, -h - 0.5, h + 0.5, S + 5.5, S + 5.9); // the balcony
    for (let k = -h - 0.4; k <= h + 0.45; k += 0.45) for (const s of [-1, 1]) {
      p.box('iron', k - 0.02, k + 0.02, s * (h + 0.45) - 0.02, s * (h + 0.45) + 0.02, S + 5.9, S + 6.8);
      p.box('iron', s * (h + 0.45) - 0.02, s * (h + 0.45) + 0.02, k - 0.02, k + 0.02, S + 5.9, S + 6.8);
    }
    // the lantern and the spire
    const r = h * 0.62;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.cyl('plaster', Math.cos(a) * r, Math.sin(a) * r, S + 5.9, S + 8.4, 0.1, 0.1, 6); }
    p.cyl('dark', 0, 0, S + 5.9, S + 8.4, r * 0.6, r * 0.6, 8);
    p.cyl('plaster', 0, 0, S + 8.4, S + 8.8, r + 0.25, r + 0.25, 8);
    p.cone('lead', 0, 0, S + 8.8, r + 0.35, 5.2, 8);
    p.cross(0, 0, S + 14, 0.7);
    place(p, cf);
  }

  // ---------------- Могила на непобедените: the urns on both sides of the path, the wall of names behind
  const mf = M.mogila ? frame(M.mogila, terrain, A.mogila, true) : null;
  if (mf) {
    const p = parts(), L = mf.L, W = mf.W;
    // an urn: a lathe profile (base, waist, bowl) with two scrolls at the rim
    const urn = (s: number) => {
      const pr = [[0, 0], [1.05, 0], [1.0, 0.25], [0.62, 1.6], [0.5, 2.3], [0.62, 2.6], [1.15, 3.05], [1.3, 3.35], [1.0, 3.45], [0, 3.45]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
      return new THREE.LatheGeometry(pr, 14);
    };
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), u = -L * 0.75 + t * L * 1.5, v = (i % 2 ? 1 : -1) * W * (0.45 + 0.15 * ((i * 3) % 2)), s = 0.9 + ((i * 5) % 3) * 0.18;
      const y = gnd(mf, u, v);
      p.add('white', urn(s).translate(u, y, v));
      for (const sd of [-1, 1]) p.add('white', new THREE.TorusGeometry(0.28 * s, 0.1 * s, 6, 12).rotateY(Math.PI / 2).translate(u, y + 3.2 * s, v + sd * 1.05 * s));
      p.box('stoneDark', u - 1.3 * s, u + 1.3 * s, v - 1.3 * s, v + 1.3 * s, y - 0.6, y + 0.05);
    }
    // the paved path along u and the wall of names across its end
    for (let u = -L; u < L; u += 2) { const y = gnd(mf, u + 1, 0); p.box('stoneDark', u, u + 2.05, -1.6, 1.6, y - 0.5, y + 0.08); }
    const wy = gnd(mf, L * 0.9, 0);
    p.box('white', L * 0.85, L * 0.85 + 0.8, -W * 0.7, W * 0.7, wy - 0.5, wy + 3.2);
    for (let v = -W * 0.65; v < W * 0.65; v += 0.9) p.box('stoneDark', L * 0.85 - 0.02, L * 0.85, v, v + 0.5, wy + 0.6, wy + 2.6); // the engraved names (darker panels)
    place(p, mf);
  }

  // ---------------- Маркови Кули: granite boulders over the hill
  const kf = M.markovi ? frame(M.markovi, terrain) : null;
  if (kf) {
    const p = parts();
    let seed = 11;
    const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
    const n = Math.min(220, Math.round((kf.L * kf.W) / 120));
    for (let i = 0; i < n; i++) {
      const u = (rnd() * 2 - 1) * kf.L, v = (rnd() * 2 - 1) * kf.W, r = 1.2 + rnd() ** 2 * 5;
      const g = new THREE.DodecahedronGeometry(r, 1);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) { const f = 0.82 + ((Math.sin(pos.getX(k) * 3.1 + i) + Math.cos(pos.getZ(k) * 2.7 + i)) * 0.5 + 1) * 0.1; pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f * 0.75, pos.getZ(k) * f); }
      g.computeVertexNormals();
      g.rotateY(rnd() * 6.28).translate(u, gnd(kf, u, v) + r * 0.35, v);
      p.add(rnd() < 0.35 ? 'rockDark' : 'rock', g);
    }
    place(p, kf);
  }

  // ---------------- Трескавец: the church and its konak on the granite top
  const tf = M.treskavec ? frame(M.treskavec, terrain, [1, 0], true) : null;
  if (tf) {
    const p = parts();
    byzChurch(p, tf, { low: 5, high: 7.2, narthex: Math.min(4.5, tf.L * 0.3), drum: { h: 3.2, sides: 8 }, minor: 2 });
    place(p, tf);
  }
  return { group, nightLit: [glass] };
}
